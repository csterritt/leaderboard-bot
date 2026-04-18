# Discord Music Leaderboard Bot - Architecture

## Overview

A Discord bot built with **discord.js** for gateway event ingestion and **better-sqlite3** for persistence, running on **Bun**. The bot listens for `MESSAGE_CREATE` events through the Discord Gateway, tracks music file uploads per channel, maintains per-user streak statistics based on post timing, and posts a separate leaderboard inside each configured leaderboard channel.

Monitored channels and leaderboard channels have a **many-to-many** relationship:

- A single leaderboard channel can monitor **multiple** monitored channels. It displays individual leaderboards for each one, with each leaderboard naming its monitored channel and showing stats from that channel only. Stats are never merged across channels.
- A single monitored channel can feed **multiple** leaderboard channels. Posting music in it updates leaderboards in every linked leaderboard channel.

This allows flexible configurations such as a leaderboard channel showing per-channel breakdowns for several topic channels, or a single busy channel feeding dashboards in multiple guild areas.

Slash commands are handled through Discord Interactions over HTTP, while message ingestion happens through the Gateway event stream. The `discord.js` library manages the gateway lifecycle (heartbeat, reconnection, session resume).

## System Architecture

### Tech Stack

- **Runtime**: Bun
- **Gateway Layer**: discord.js (handles gateway lifecycle)
- **HTTP Interface**: Discord Interactions endpoint for slash commands
- **Database**: better-sqlite3 (synchronous, WAL journal mode)
- **Language**: TypeScript
- **Discord Integration**: discord.js + Discord REST API + Discord Interactions

### Core Components

#### 1. Main App Structure

```
src/
├── index.ts                 # Main entry point, discord.js client setup, scheduled jobs
├── types.ts                 # Shared interfaces and type definitions
├── constants.ts             # File extensions, time values, permission bits, accepted message types
├── handlers/
│   ├── gateway.ts           # Gateway event dispatcher for MESSAGE_CREATE
│   ├── interactions.ts      # Slash command router + handlers
│   └── scheduled.ts         # Scheduled orchestration (recovery + leaderboard posting + maintenance)
├── db/
│   ├── schema.sql           # better-sqlite3 table definitions
│   └── queries.ts           # Database operations (synchronous)
├── services/
│   ├── tracker.ts           # Streak calculation logic
│   ├── leaderboard.ts       # Leaderboard query shaping + text formatting + content hashing
│   ├── recovery.ts          # Backfill logic for monitored channels
│   ├── processor.ts         # Shared message processing path used by gateway + recovery
│   └── discord.ts           # Discord REST API client with rate-limit handling
├── utils/
│   ├── time.ts              # Time window calculations
│   ├── signature.ts         # Discord interaction signature verification
│   ├── permissions.ts       # ADMINISTRATOR permission checks (BigInt)
│   └── db-helpers.ts        # Retry and Result helpers (synchronous)
└── scripts/
    └── register-commands.ts # One-shot script to register slash commands with Discord
```

#### 2. Database Schema (sqlite)

```sql
-- User music tracking (per channel)
CREATE TABLE IF NOT EXISTS user_stats (
    channel_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    last_music_post_at INTEGER,
    run_count INTEGER NOT NULL DEFAULT 0,
    highest_run_seen INTEGER NOT NULL DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (channel_id, user_id)
);

-- Channels that should receive a scheduled leaderboard post
CREATE TABLE IF NOT EXISTS leaderboard_channels (
    channel_id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    channel_name TEXT NOT NULL,
    added_by_user_id TEXT NOT NULL,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Last posted leaderboard message per leaderboard channel
CREATE TABLE IF NOT EXISTS leaderboard_posts (
    channel_id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    posted_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Message recovery checkpoint per monitored channel
CREATE TABLE IF NOT EXISTS recovery_state (
    channel_id TEXT PRIMARY KEY,
    last_processed_message_id TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Junction table: many-to-many link between monitored channels and leaderboard channels
CREATE TABLE IF NOT EXISTS monitored_channels (
    channel_id TEXT NOT NULL,
    guild_id TEXT NOT NULL,
    leaderboard_channel_id TEXT NOT NULL
        REFERENCES leaderboard_channels(channel_id) ON DELETE CASCADE,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (channel_id, leaderboard_channel_id)
);

-- Message IDs already processed, used for idempotency across gateway and recovery paths
CREATE TABLE IF NOT EXISTS processed_messages (
    message_id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### 3. Gateway Message Flow

```
Discord MESSAGE_CREATE event (via discord.js client.on('messageCreate'))
    ↓
Is message.author.bot? → Yes → ignore
    ↓
Is message.type in ACCEPTED_MESSAGE_TYPES (DEFAULT=0, REPLY=19)? → No → ignore
    ↓
Is channel in monitored_channels?
    ├─ No → ignore
    └─ Yes
         ↓
      Does message have a supported music attachment?
      (check file extension first; fall back to content_type starts with 'audio/' if no filename)
         ├─ No → ignore
         └─ Yes
              ↓
            Claim message ID for idempotency
              ├─ Already claimed → ignore
              └─ Newly claimed
                   ↓
                 Tracker Service
                   ├─ Use message.timestamp converted to Unix seconds
                   ├─ Read user_stats for (channel_id, user_id)
                   ├─ Calculate streak transition using Discord timestamps
                   ├─ Resolve username from member.nick / author.global_name / author.username
                   ├─ Update run_count and highest_run_seen
                   └─ Persist updated stats
                        ↓
                      Advance recovery_state for the channel
```

The gateway path and the recovery path both call the same shared message-processing function so the bot has one authoritative streak-update implementation.

On `processMessage` failure in the gateway path, the error is logged and swallowed. Recovery will retry the message later.

#### 4. Tracking Logic (Time Windows)

```
Current Post Time: T_now (from message.timestamp, Unix seconds)
Last Post Time: T_last (from DB, Unix seconds)

Delta = T_now - T_last

IF T_last IS NULL:
    run_count = 1
    highest_run_seen = 1
ELSE IF Delta > 36 hours:
    run_count = 1 (the new post itself starts a fresh streak)
ELSE IF Delta > 8 hours AND Delta <= 36 hours:
    run_count += 1
    highest_run_seen = max(highest_run_seen, run_count)
ELSE (Delta <= 8 hours):
    -- No change to run_count

Update last_music_post_at = T_now
```

`highest_run_seen` is updated **when the active streak exceeds the best streak seen so far**, not on reset.

#### 5. Slash Commands

**`/leaderboard [channel]`**

- Shows the music leaderboard for a leaderboard channel
- Defaults to the current channel when no option is provided
- Verifies the target channel is in `leaderboard_channels`; returns an error if not
- Channel name resolution:
  - Current channel: from `interaction.channel.name`
  - Provided channel: via `fetchChannel` Discord API call
- Queries all `monitored_channels` linked to the target leaderboard channel
- For each linked monitored channel, queries and formats an individual leaderboard section (channel name + stats from that channel only)
- Each section is sorted by `run_count DESC, highest_run_seen DESC`
- Returns an ephemeral response

**`/setleaderboardchannel`**

- Takes no arguments; operates on the current channel
- Marks the current channel as a leaderboard channel
- Does **not** add it to `monitored_channels` (monitored channels are managed separately)
- Requires the invoking member to have the `ADMINISTRATOR` permission (BigInt bitfield check)
- Upserts a row in `leaderboard_channels`, refreshing the stored `channel_name`
- Responds with confirmation or permission denied error

**`/removeleaderboardchannel`**

- Takes no arguments; operates on the current channel
- Removes the current channel from `leaderboard_channels`
- Removes all `monitored_channels` rows that reference this leaderboard channel (CASCADE via FK)
- Deletes any stored `leaderboard_posts` row for that channel
- Stops future tracking and posting but keeps historical `user_stats`, `recovery_state`, and `processed_messages` rows intact
- Requires the invoking member to have the `ADMINISTRATOR` permission
- Responds with confirmation or permission denied error

**`/addmonitoredchannel <channel>`**

- Takes one required argument: the channel to monitor for music uploads
- Must be run from a leaderboard channel (the current channel must be in `leaderboard_channels`)
- Adds the provided channel to `monitored_channels` with `leaderboard_channel_id` set to the current channel
- A leaderboard channel can monitor multiple channels; a monitored channel can be linked to multiple leaderboard channels
- Idempotent (adding the same channel+leaderboard pair again does not error)
- Requires the invoking member to have the `ADMINISTRATOR` permission
- Responds with confirmation or permission denied error

**`/removemonitoredchannel <channel>`**

- Takes one required argument: the channel to stop monitoring
- Must be run from a leaderboard channel — removes only the link between the specified monitored channel and the current leaderboard channel
- Other leaderboard channels monitoring the same channel are unaffected
- Does not delete historical `user_stats`, `recovery_state`, or `processed_messages` rows
- Requires the invoking member to have the `ADMINISTRATOR` permission
- Responds with confirmation or permission denied error

**Response Format**:

```
🎵 Music Leaderboard for #monitored-channel-a 🎵

Rank | User | Current Run | Best Run
-----|------|-------------|----------
1    | @user1 | 5 | 12
2    | @user2 | 3 | 8

🎵 Music Leaderboard for #monitored-channel-b 🎵

Rank | User | Current Run | Best Run
-----|------|-------------|----------
1    | @user3 | 1 | 5
```

When a leaderboard channel monitors a single channel, only one section is shown. When it monitors multiple channels, each gets its own section.

**Query** (run once per linked monitored channel — no cross-channel merging):

```sql
SELECT
    username,
    run_count,
    highest_run_seen
FROM user_stats
WHERE channel_id = ? AND (run_count > 0 OR highest_run_seen > 0)
ORDER BY run_count DESC, highest_run_seen DESC
LIMIT 50;
```

#### 6. Scheduled Work

**Timer**: `setInterval` or `node-cron`, every hour

**Flow**:

```
Hourly Timer → runScheduledWork
    ↓
1. Recover all monitored channels
    ↓
2. Reset inactive streaks
   └─ SET run_count = 0 for all user_stats rows where
      last_music_post_at is non-null and more than 36 hours ago
      (uses THIRTY_SIX_HOURS_SECS constant and the clock facility)
   └─ highest_run_seen is preserved — it records the all-time best
    ↓
3. For each leaderboard_channels entry:
    ├─ Query all monitored_channels linked to this leaderboard channel (may be multiple)
    ├─ For each linked monitored channel, query user_stats and format an individual section
    ├─ Concatenate all sections into one message
    ├─ Hash rendered content (FNV-1a)
    ├─ Compare against leaderboard_posts.content_hash for the channel
    ├─ If unchanged → skip posting
    ├─ If changed:
    │   ├─ DELETE /channels/{channel_id}/messages/{message_id} when a prior post exists
    │   │   └─ On 404: log warning and continue
    │   ├─ POST /channels/{channel_id}/messages
    │   └─ UPSERT leaderboard_posts(channel_id, message_id, content_hash, posted_at)
    └─ Continue to the next leaderboard channel
    ↓
4. Prune processed_messages rows older than 14 days
```

Each configured leaderboard channel is tracked independently. There is no single global leaderboard channel.

#### 7. Message Recovery

**Flow** (runs during scheduled work):

```
For each monitored_channels entry:
    ├─ Read recovery_state.last_processed_message_id
    ├─ If null, use after=0 to fetch from the beginning of the channel
    ├─ Fetch messages after that ID (exclusive — the checkpoint message is not re-fetched)
    │   (GET /channels/{channel.id}/messages?after={last_id}&limit=100)
    ├─ Sort fetched messages into ascending snowflake / chronological order
    ├─ For each message from oldest to newest:
    │   ├─ Skip if processed_messages already contains message_id
    │   ├─ Process through the shared message-processing path
    │   └─ Advance the in-memory checkpoint only after successful processing
    ├─ Persist the highest successfully processed message ID to recovery_state
    └─ Repeat until no more messages are returned
```

If a batch partially fails, the stored checkpoint remains at the last successfully processed message so the remaining messages can be retried safely.

## Key Implementation Details

### Time Calculations

Use **Discord message timestamps** for all streak comparisons:

- Parse `message.timestamp` from ISO8601 to Unix seconds
- 8 hours = 28,800 seconds
- 36 hours = 129,600 seconds

**Why**: This avoids drift between the runtime, database, and Discord.

### Idempotent Message Processing

The system must prevent double-processing when the same message is seen via both the live gateway path and the recovery path.

The write path should guarantee that message claiming and stat mutation are serialized together. Since better-sqlite3 is synchronous and single-threaded, transactions provide natural serialization. The required behavior is:

- a message ID is processed at most once
- a failed attempt does not advance `recovery_state` past the failure point
- recovery can safely re-fetch already seen messages without corrupting streak counts

Rows in `processed_messages` older than 14 days are pruned during scheduled work to prevent unbounded table growth.

### Leaderboard Post Replacement

When deleting a previous leaderboard message:

- `404` means the message is already gone and should not block a new post
- other non-2xx responses should be logged
- the new post should still be attempted unless the failure indicates a fatal permissions issue

### Content Hashing

Leaderboard content is hashed using **FNV-1a** (fast, non-cryptographic) to detect changes. Only post a new message when the hash differs from the stored `content_hash` in `leaderboard_posts`.

### WAL Journal Mode

The database runs in **WAL (Write-Ahead Logging)** mode, enabled at startup with `PRAGMA journal_mode = WAL` before any other operations. WAL improves concurrent read performance and reduces write contention compared to the default rollback journal.

### Inactivity Reset

During each scheduled work cycle, **after recovery and before leaderboard posting**, the bot resets streaks for inactive users:

- Any `user_stats` row where `last_music_post_at` is non-null and more than 36 hours before the current time has its `run_count` set to 0.
- `highest_run_seen` is **not** modified — it preserves the user's all-time best streak.
- The 36-hour threshold reuses `THIRTY_SIX_HOURS_SECS` from `constants.ts`.
- The current time comes from the clock facility (`utils/clock.ts`), making the logic testable.

This ensures leaderboards reflect only active streaks. A user whose streak was already reset by the normal posting flow (delta > 36 h → `run_count = 1` on next post) is unaffected because their `run_count` is already based on the fresh post.

### Discord API Rate Limiting

The Discord REST API client enforces:

- A minimum delay of **1 100 ms** between consecutive requests (stays within 5 requests / 5 seconds)
- On a `429` response, reads `Retry-After` header, waits that duration, then retries once
- On a second consecutive `429`, returns `Result.err`

### Channel Name Source of Truth

Scheduled leaderboard posts use the `channel_name` stored in `leaderboard_channels`.

That stored value is refreshed each time `/setleaderboardchannel` is run for the channel.

### Permission Verification for Channel Management

All admin commands (`/setleaderboardchannel`, `/removeleaderboardchannel`, `/addmonitoredchannel`, `/removemonitoredchannel`) are restricted to members with the `ADMINISTRATOR` permission.

The interaction payload exposes permissions as a bitfield string. The handler parses that string to a `BigInt` and tests with bitwise AND against `ADMINISTRATOR_PERMISSION` (`0x8n`).

### Message Type Filtering

Only `DEFAULT` (type 0) and `REPLY` (type 19) messages are processed. All other message types are ignored.

### Music Attachment Detection

1. Primary check: file extension from `filename` against `MUSIC_EXTENSIONS`
2. Fallback: if `filename` is absent, check `content_type` starts with `audio/`

### Environment Variables

```bash
DISCORD_APPLICATION_ID=xxx
DISCORD_PUBLIC_KEY=xxx
DISCORD_BOT_TOKEN=xxx
DATABASE_PATH=./data/leaderboard.db
```

## Deployment

### Prerequisites

- Bun runtime installed on the target machine
- A persistent filesystem for the SQLite database

### Discord App Setup

1. Create the app at https://discord.com/developers/applications
2. Enable the **Message Content** privileged intent
3. Enable the Gateway intents: `GUILDS`, `GUILD_MESSAGES`, `MESSAGE_CONTENT`
4. Register slash commands by running `bun run src/scripts/register-commands.ts`
5. Configure the Interactions endpoint URL for slash commands
6. Install the bot with permissions to read messages, send messages, manage messages, and read message history
7. Start the bot: `bun run src/index.ts`
8. Use `/setleaderboardchannel` in each channel that should display a leaderboard
9. Use `/addmonitoredchannel` from each leaderboard channel to link the channels that should be monitored for music uploads
