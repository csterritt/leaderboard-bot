# Discord Music Leaderboard Bot - Architecture

## Overview

A Discord bot built a **gateway-based event ingestion model** and sqlite for persistence. The bot listens for `MESSAGE_CREATE` events through the Discord Gateway, tracks music file uploads per channel, maintains per-user streak statistics based on post timing, and posts a separate leaderboard inside each configured leaderboard channel.

Slash commands are still handled through Discord Interactions over HTTP, while message ingestion happens through the Gateway event stream.

## System Architecture

### Tech Stack
- **Gateway Layer**: Discord Gateway Intents client
- **HTTP Interface**: Discord Interactions endpoint for slash commands
- **Database**: sqlite
- **Language**: TypeScript
- **Discord Integration**: Discord Gateway + Discord REST API + Discord Interactions

### Core Components

#### 1. Main App Structure
```
src/
├── index.ts                 # Main entry point, gateway bootstrapping, fetch handler, scheduled handler
├── constants.ts             # File extensions, time values, permission bits
├── handlers/
│   ├── gateway.ts           # Gateway event dispatcher for MESSAGE_CREATE
│   ├── interactions.ts      # Slash command router + handlers
│   └── scheduled.ts         # Scheduled leaderboard update + maintenance orchestration
├── db/
│   ├── schema.sql           # sqlite table definitions
│   └── queries.ts           # Database operations
├── services/
│   ├── tracker.ts           # Streak calculation logic
│   ├── leaderboard.ts       # Leaderboard query shaping + text formatting
│   ├── recovery.ts          # Backfill logic for monitored channels
│   ├── processor.ts         # Shared message processing path used by gateway + recovery
│   └── discord.ts           # Discord REST API client
└── utils/
    ├── time.ts              # Time window calculations
    ├── signature.ts         # Discord interaction signature verification
    ├── permissions.ts       # ADMINISTRATOR permission checks
    └── db-helpers.ts        # Retry and Result helpers
```

#### 2. Database Schema (sqlite)

```sql
-- User music tracking (per channel)
CREATE TABLE user_stats (
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
CREATE TABLE leaderboard_channels (
    channel_id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    channel_name TEXT NOT NULL,
    added_by_user_id TEXT NOT NULL,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Last posted leaderboard message per leaderboard channel
CREATE TABLE leaderboard_posts (
    channel_id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    posted_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Message recovery checkpoint per monitored channel
CREATE TABLE recovery_state (
    channel_id TEXT PRIMARY KEY,
    last_processed_message_id TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Channels that should be scanned for music uploads
CREATE TABLE monitored_channels (
    channel_id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Message IDs already processed, used for idempotency across gateway and recovery paths
CREATE TABLE processed_messages (
    message_id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### 3. Gateway Message Flow

```
Discord MESSAGE_CREATE event
    ↓
Discord Gateway → gateway dispatcher
    ↓
Is channel in monitored_channels?
    ├─ No → ignore
    └─ Yes
         ↓
      Does message have a supported music attachment?
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

#### 4. Tracking Logic (Time Windows)

```
Current Post Time: T_now (from message.timestamp, Unix seconds)
Last Post Time: T_last (from DB, Unix seconds)

Delta = T_now - T_last

IF T_last IS NULL:
    run_count = 1
    highest_run_seen = 1
ELSE IF Delta > 36 hours:
    run_count = 0
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
- Shows the music leaderboard for a specific channel
- Defaults to the current channel when no option is provided
- Queries by `channel_id`, sorted by `run_count DESC, highest_run_seen DESC`
- Resolves a display name before calling the formatter so the header can render `#channel-name`

**`/setleaderboardchannel`**
- Marks the current channel as a leaderboard channel
- Also adds the current channel to `monitored_channels`
- Requires the invoking member to have the `ADMINISTRATOR` permission
- Upserts a row in `leaderboard_channels`, refreshing the stored `channel_name`
- Responds with confirmation or permission denied error

**`/removeleaderboardchannel`**
- Removes the current channel from `leaderboard_channels`
- Also removes the current channel from `monitored_channels`
- Deletes any stored `leaderboard_posts` row for that channel
- Stops future tracking and posting for the channel but keeps historical `user_stats`, `recovery_state`, and `processed_messages` rows intact
- Requires the invoking member to have the `ADMINISTRATOR` permission
- Responds with confirmation or permission denied error

**Response Format**:
```
🎵 Music Leaderboard for #channel-name 🎵

Rank | User | Current Run | Best Run
-----|------|-------------|----------
1    | @user1 | 5 | 12
2    | @user2 | 3 | 8
3    | @user3 | 1 | 5
```

**Query** (channel-specific):
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

#### 6. Scheduled Leaderboard Update

**Cron Trigger**: `0 * * * *` (every hour)

**Flow**:
```
Cron Trigger → Scheduled Event
    ↓
Recover monitored channels first
    ↓
For each leaderboard_channels entry:
    ├─ Query leaderboard rows for that same channel
    ├─ Format leaderboard content using the stored channel_name
    ├─ Hash rendered content
    ├─ Compare against leaderboard_posts.content_hash for the channel
    ├─ If unchanged → skip posting
    ├─ If changed:
    │   ├─ DELETE /channels/{channel_id}/messages/{message_id} when a prior post exists
    │   │   └─ On 404: log warning and continue
    │   ├─ POST /channels/{channel_id}/messages
    │   └─ UPSERT leaderboard_posts(channel_id, message_id, content_hash, posted_at)
    └─ Continue to the next leaderboard channel
```

Each configured leaderboard channel is tracked independently. There is no single global leaderboard channel.

#### 7. Message Recovery

**Flow** (runs during scheduled work and optionally at startup):
```
For each monitored_channels entry:
    ├─ Read recovery_state.last_processed_message_id
    ├─ Fetch messages after that ID
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

The write path should guarantee that message claiming and stat mutation are serialized together. The implementation can use a transaction or an equivalent single-write-path mechanism, but the required behavior is:
- a message ID is processed at most once
- a failed attempt does not advance `recovery_state` past the failure point
- recovery can safely re-fetch already seen messages without corrupting streak counts

### Leaderboard Post Replacement
When deleting a previous leaderboard message:

- `404` means the message is already gone and should not block a new post
- other non-2xx responses should be logged
- the new post should still be attempted unless the failure indicates a fatal permissions issue

### Channel Name Source of Truth
Scheduled leaderboard posts use the `channel_name` stored in `leaderboard_channels`.

That stored value is refreshed each time `/setleaderboardchannel` is run for the channel.

### Permission Verification for Channel Management
`/setleaderboardchannel` and `/removeleaderboardchannel` are restricted to members with the `ADMINISTRATOR` permission.

The interaction payload exposes permissions as a bitfield string. The handler should parse that bitfield and test the `ADMINISTRATOR` bit.

### Environment Variables
```bash
DISCORD_APPLICATION_ID=xxx
DISCORD_PUBLIC_KEY=xxx
DISCORD_BOT_TOKEN=xxx
```

## Deployment

- TBD

### Discord App Setup
1. Create the app at https://discord.com/developers/applications
2. Enable the **Message Content** privileged intent
3. Enable the Gateway intents required for guild messages
4. Register slash commands: `/leaderboard`, `/setleaderboardchannel`, `/removeleaderboardchannel`
5. Configure the Interactions endpoint for slash commands
6. Install the bot with permissions to read messages, send messages, manage messages, and read message history
7. Use `/setleaderboardchannel` in each channel that should both be monitored and receive its own scheduled leaderboard post
