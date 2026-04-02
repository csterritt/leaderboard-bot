# Discord Music Leaderboard Bot - Architecture

## Overview

A Discord bot built as a Hono application running on Cloudflare Workers, using D1 for data persistence. The bot tracks user music file uploads (.mp3, .ogg, .wav, .flac, etc.) and maintains "streak" statistics based on post timing.

## System Architecture

### Tech Stack
- **Runtime**: Cloudflare Workers
- **Framework**: Hono
- **Database**: Cloudflare D1 (SQLite)
- **Language**: TypeScript
- **Discord Integration**: Discord API + Webhooks/Interactions

### Core Components

#### 1. Hono App Structure
```
src/
├── index.ts              # Worker entry point, routes
├── handlers/
│   ├── interactions.ts   # Slash command handler
│   └── webhook.ts        # Message monitoring handler
├── db/
│   ├── schema.ts         # D1 table definitions
│   └── queries.ts        # Database operations
├── services/
│   ├── tracker.ts        # Music post tracking logic
│   ├── leaderboard.ts    # Leaderboard generation
│   └── discord.ts        # Discord API client
└── utils/
    ├── time.ts           # Time window calculations
    └── constants.ts      # File extensions, time values
```

#### 2. Database Schema (D1)

```sql
-- User music tracking (per channel)
CREATE TABLE user_stats (
    channel_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    last_music_post_at INTEGER,  -- Unix timestamp from message timestamp
    run_count INTEGER DEFAULT 1,
    highest_run_seen INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (channel_id, user_id)
);

-- Bot configuration
CREATE TABLE config (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Leaderboard state (for message deletion)
CREATE TABLE leaderboard_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    posted_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Message recovery state (per monitored channel)
CREATE TABLE recovery_state (
    channel_id TEXT PRIMARY KEY,
    last_processed_message_id TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Monitored channels list (supports multiple channels)
CREATE TABLE monitored_channels (
    channel_id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

**Config keys:**
- `leaderboard_channel_id`: Channel ID for auto-posting leaderboard
- `guild_id`: Discord server ID

#### 3. Message Flow

```
Discord Message (in monitored channel)
    ↓
Discord Gateway → Webhook → Cloudflare Worker
    ↓
Hono Router (POST /webhook/message)
    ↓
Attachment Filter (.mp3, .ogg, .wav, .flac, .m4a, .aac)
    ↓
Tracker Service
    ├─ Use message.timestamp (Discord-provided ISO8601) converted to Unix seconds
    ├─ Check last_music_post_at for (channel_id, user_id)
    ├─ Calculate time delta using message timestamps
    ├─ Update username from message.member.nick or message.author.global_name
    ├─ Update run_count / highest_run_seen
    └─ Store updated stats
```

#### 4. Tracking Logic (Time Windows)

```
Current Post Time: T_now (from message.timestamp, Unix seconds)
Last Post Time: T_last (from DB, Unix seconds)

Delta = T_now - T_last

IF T_last IS NULL:  -- First music post ever in this channel
    run_count = 1
    highest_run_seen = 1
ELSE IF Delta > 36 hours:
    IF run_count > highest_run_seen:
        highest_run_seen = run_count
    run_count = 0
ELSE IF Delta > 8 hours AND Delta <= 36 hours:
    run_count += 1
ELSE (Delta <= 8 hours):
    -- No change to run_count, just update last_music_post_at

Update last_music_post_at = T_now
```

#### 5. Slash Commands

**`/leaderboard [channel]`**
- Shows the music leaderboard for a specific channel (defaults to current channel)
- Query filters by channel_id, sorted by run_count DESC, highest_run_seen DESC

**`/setleaderboardchannel`**
- Sets the current channel as the auto-posting leaderboard channel
- **Permission Check**: Verifies the invoking user has the `Server Owner` role (role ID matches guild ID)
- Stores channel_id in config table with key `leaderboard_channel_id`
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
LIMIT 25;
```

#### 6. Scheduled Leaderboard Update

**Cron Trigger**: `0 * * * *` (every hour)

**Flow**:
```
Cron Trigger → Worker Scheduled Event
    ↓
Check config for leaderboard_channel_id
    ↓
IF exists:
    Check if there is any change in the leaderboard since the last update
        ↓
    IF there's been a change:
        ├─ Query last message_id from leaderboard_posts
        ├─ DELETE /channels/{id}/messages/{message_id} (if exists)
        │   └─ On 404: Log warning, delete DB record, continue
        ├─ Generate leaderboard content (aggregating all monitored channels or per-channel?)
        ├─ POST /channels/{id}/messages
        └─ REPLACE INTO leaderboard_posts (channel_id, message_id, posted_at)
```

#### 7. Message Recovery (Startup)

**Flow** (runs when worker starts or via scheduled recovery job):
```
For each monitored_channels entry:
    ├─ Get last_processed_message_id from recovery_state
    ├─ Fetch messages from channel after that ID
    │   (GET /channels/{channel.id}/messages?after={last_id}&limit=100)
    ├─ Process each message through Attachment Filter → Tracker Service
    ├─ Update last_processed_message_id in recovery_state
    └─ Repeat until no more messages (caught up)
```

**Note**: Recovery is throttled to respect Discord rate limits (5 req/5s per channel).

## Key Implementation Details

### Time Calculations
Use **Discord message timestamps** (converted to Unix seconds) for all time comparisons:
- Parse `message.timestamp` from ISO8601 to Unix seconds
- 8 hours = 28,800 seconds
- 36 hours = 129,600 seconds

**Why**: Eliminates time drift between Cloudflare Workers, D1, and Discord's clocks.

### Message Deletion Handling
When deleting the previous leaderboard message:
```typescript
// Attempt to delete the stored message_id
const response = await fetch(`.../messages/${message_id}`, { method: 'DELETE' });

if (response.status === 404) {
    // Message already deleted (manually or by another process)
    // Log and continue - we still want to post the new leaderboard
    console.warn(`Leaderboard message ${message_id} not found, continuing...`);
} else if (!response.ok) {
    // Other error (permissions, etc.) - log but don't block
    console.error(`Failed to delete leaderboard: ${response.status}`);
}

// Always clear the DB record and post the new leaderboard
await db.deleteLeaderboardPost(message_id);
await postNewLeaderboard();
```

### Role Verification for `/setleaderboardchannel`

Check if user has Server Owner role (role ID == guild ID):

```typescript
// In the interaction handler for /setleaderboardchannel
const member = interaction.member;
const guildId = interaction.guild_id;

// Server Owner role ID equals the guild ID
const isServerOwner = member.roles.includes(guildId);

if (!isServerOwner) {
    return Response.json({
        type: 4,  // ChannelMessageWithSource
        data: {
            content: "❌ You must have the Server Owner role to use this command.",
            flags: 64  // Ephemeral
        }
    });
}
```

**Note**: The `@everyone` role always has `role.id === guild.id`. Server owners don't necessarily "have" this role in the traditional sense, but checking if the user is the guild owner requires the `owner_id` from the guild object. Since we may not have the guild cached, an alternative is to check `member.permissions` for `ADMINISTRATOR` or verify `interaction.member.user.id === guild.owner_id` via a guild fetch.

### Environment Variables
```bash
DISCORD_APPLICATION_ID=xxx
DISCORD_PUBLIC_KEY=xxx   # For signature verification
DISCORD_BOT_TOKEN=xxx    # For API calls
D1_DATABASE_ID=xxx       # Cloudflare D1 binding
```

## Deployment

### Wrangler Configuration
```toml
name = "music-leaderboard-bot"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "leaderboard-db"
database_id = "xxx"

[triggers]
crons = ["0 * * * *"]

[vars]
DISCORD_APPLICATION_ID = "xxx"
```

### Discord App Setup
1. Create app at https://discord.com/developers/applications
2. Enable "Message Content" privileged intent (required to read attachment filenames)
3. Add slash commands: `/leaderboard`, `/setleaderboardchannel`
4. Set up webhook subscription for `MESSAGE_CREATE` events
5. Install bot to server with permissions: Read Messages, Send Messages, Manage Messages (for deletion), Attach Files
6. Add monitored channels to the `monitored_channels` table via the `/setleaderboardchannel` command
