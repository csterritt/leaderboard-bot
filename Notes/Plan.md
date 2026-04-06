# Discord Music Leaderboard Bot — Implementation Plan

## Overview

A bot that:

- receives `MESSAGE_CREATE` events through `discord.js`
- handles slash commands through the Discord Interactions HTTP endpoint
- tracks per-user music posting streaks separately for each monitored channel
- posts a separate scheduled leaderboard in each channel designated as a leaderboard channel
- monitored channels and leaderboard channels are configured independently; a monitored channel links to the leaderboard channel where its stats are displayed

The implementation uses Red/Green TDD throughout.

**Runtime**: Bun
**Database**: better-sqlite3
**Discord library**: discord.js (handles gateway lifecycle, heartbeat, reconnection, resume)
**Testing**: vitest with in-memory better-sqlite3 databases per test suite

---

## DB Access Pattern

Every database operation follows the same retry and `Result` pattern. The `Database` type is `BetterSqlite3.Database` from `better-sqlite3`. Since better-sqlite3 is synchronous, `toResult` wraps synchronous calls.

```typescript
const withRetry = <T>(
  operationName: string,
  operation: () => Result<T, Error>
): Result<T, Error> => {
  let lastError: Error | undefined

  for (let attempt = 0; attempt <= STANDARD_RETRY_OPTIONS.retries; attempt++) {
    const result = operation()

    if (result.isOk) {
      return result
    }

    lastError = result.error
    console.warn(`${operationName} attempt ${attempt + 1} failed`, lastError)
  }

  console.error(`${operationName} failed after retries`, lastError)
  return Result.err(lastError ?? new Error(`${operationName} failed`))
}

const toResult = <T>(fn: () => T): Result<T, Error> => {
  try {
    return Result.ok(fn())
  } catch (error) {
    return Result.err(error instanceof Error ? error : new Error(String(error)))
  }
}

export const getUserStats = (
  db: Database,
  channelId: string,
  userId: string
): Result<UserStats | null, Error> =>
  withRetry('getUserStats', () => getUserStatsActual(db, channelId, userId))

const getUserStatsActual = (
  db: Database,
  channelId: string,
  userId: string
): Result<UserStats | null, Error> =>
  toResult(() => {
    const row = db
      .prepare('SELECT * FROM user_stats WHERE channel_id = ? AND user_id = ?')
      .get(channelId, userId) as UserStatsRow | undefined

    return row ? mapUserStats(row) : null
  })
```

**Key rules:**
- `withRetry` wraps every exported DB function.
- `withRetry` retries when the inner function returns `Result.err`.
- `toResult` is used inside each private `*Actual` function to normalize thrown exceptions.
- `*Actual` functions are never exported.
- Prefer explicit `INSERT ... ON CONFLICT ... DO UPDATE` statements over `INSERT OR REPLACE`.
- `Result` comes from `true-myth/result`.
- All DB operations are synchronous (better-sqlite3). Return types are `Result<T, Error>`, not `Promise<Result<T, Error>>`.

---

## Project Structure

```
src/
├── index.ts                  # Main entry point, discord.js client setup, scheduled jobs
├── types.ts                  # Shared interfaces and type definitions
├── constants.ts              # File extensions, time thresholds, retry options, permission bit values, accepted message types
├── handlers/
│   ├── gateway.ts            # Gateway event dispatcher for MESSAGE_CREATE
│   ├── interactions.ts       # Slash command router + handlers
│   └── scheduled.ts          # Scheduled orchestration (recovery + leaderboard posting + maintenance)
├── db/
│   ├── schema.sql            # DDL for all tables
│   └── queries.ts            # All DB operations (synchronous, better-sqlite3)
├── services/
│   ├── tracker.ts            # Streak logic
│   ├── processor.ts          # Shared message-processing pipeline
│   ├── leaderboard.ts        # Leaderboard querying + formatting
│   ├── recovery.ts           # Message backfill logic
│   └── discord.ts            # Discord REST API client with rate-limit handling
├── utils/
│   ├── time.ts               # ISO8601 → Unix seconds, threshold helpers
│   ├── signature.ts          # Discord interaction signature verification
│   ├── permissions.ts        # ADMINISTRATOR permission checks
│   └── db-helpers.ts         # withRetry, toResult
└── scripts/
    └── register-commands.ts  # One-shot script to register slash commands with Discord
```

---

## Implementation Checklist

Work through these phases in order. Each step: write the failing test first, then implement.

---

### Phase 0 — Project Scaffolding

- [ ] **0.1** Initialise project: `bun init`, install dependencies
  - Runtime: `bun`
  - Discord: `discord.js`
  - DB: `better-sqlite3`, `@types/better-sqlite3`
  - Result: `true-myth`
  - Retry: `async-retry`, `@types/async-retry`
  - Testing: `vitest`
  - Types: `typescript`
- [ ] **0.2** Configure `tsconfig.json` with strict mode and bundler module resolution
- [ ] **0.3** Configure `vitest.config.ts`
  - Each test suite creates its own in-memory better-sqlite3 database via `new Database(':memory:')` and applies `schema.sql` in a `beforeEach` or `beforeAll` hook
- [ ] **0.4** Create `src/db/schema.sql` with `user_stats`, `leaderboard_channels`, `leaderboard_posts`, `recovery_state`, `monitored_channels`, and `processed_messages`
- [ ] **0.5** Apply schema to local file-based database for manual testing
- [ ] **0.6** Create `src/constants.ts` with `MUSIC_EXTENSIONS`, `EIGHT_HOURS_SECS`, `THIRTY_SIX_HOURS_SECS`, `LEADERBOARD_MAX_ROWS`, `ADMINISTRATOR_PERMISSION`, `STANDARD_RETRY_OPTIONS`, and `ACCEPTED_MESSAGE_TYPES`
- [ ] **0.7** Create `src/types.ts` with the shared interfaces in the Types section below

---

### Phase 1 — Utility Layer

- [ ] **1.1 — `utils/time.ts`**
  - RED: test `parseDiscordTimestamp` converts ISO8601 strings to Unix seconds integers
  - RED: test fractional seconds and timezone normalization edge cases
  - GREEN: implement `parseDiscordTimestamp(iso: string): number`
  - RED: test `computeStreakDelta(null)` returns `'first'`
  - RED: test `computeStreakDelta(delta)` where `delta <= 8h` returns `'noop'`
  - RED: test `computeStreakDelta(delta)` where `8h < delta <= 36h` returns `'increment'`
  - RED: test `computeStreakDelta(delta)` where `delta > 36h` returns `'reset'`
  - GREEN: implement `computeStreakDelta(deltaSecs: number | null): StreakDeltaKind`
    - `null` → `'first'`
    - `<= 28_800` → `'noop'`
    - `<= 129_600` → `'increment'`
    - `> 129_600` → `'reset'`

- [ ] **1.2 — `utils/signature.ts`**
  - RED: test a valid Discord interaction signature passes verification
  - RED: test a tampered body fails verification
  - GREEN: implement `verifyDiscordSignature({ publicKey, timestamp, body, signature }): Promise<boolean>`

- [ ] **1.3 — `utils/permissions.ts`**
  - RED: test `hasAdministratorPermission` returns `true` when the `ADMINISTRATOR` bit is present
  - RED: test `hasAdministratorPermission` returns `false` when the bit is absent
  - RED: test handles the permissions string as a BigInt (parse string → `BigInt`, test with bitwise AND against `0x8n`)
  - GREEN: implement `hasAdministratorPermission(permissions: string): boolean`

- [ ] **1.4 — `utils/db-helpers.ts`**
  - RED: test `toResult` returns `Result.ok(value)` on success
  - RED: test `toResult` returns `Result.err(Error)` when the callback throws
  - RED: test `withRetry` retries when the inner operation returns `Result.err`
  - RED: test `withRetry` returns immediately on success without retrying
  - GREEN: implement `toResult<T>` and `withRetry<T>` (synchronous — no async needed for better-sqlite3)

---

### Phase 2 — Database Schema & Queries (`db/queries.ts`)

All exported functions follow the `fn` / `fnActual` pattern. `Database` (`BetterSqlite3.Database`) is always the first argument. All return types are `Result<T, Error>` (synchronous).

- [ ] **2.1 — `getUserStats`**
  - RED: test returns `Result.ok(null)` for an unknown user in a channel
  - RED: test returns `Result.ok(UserStats)` for a known user
  - GREEN: implement `getUserStats(db, channelId, userId): Result<UserStats | null, Error>`

- [ ] **2.2 — `upsertUserStats`**
  - RED: test inserts a new row when no record exists
  - RED: test updates an existing row using explicit UPSERT semantics
  - RED: test preserves `updated_at` behavior expected by the schema
  - GREEN: implement `upsertUserStats(db, stats): Result<void, Error>` with `INSERT ... ON CONFLICT(channel_id, user_id) DO UPDATE`

- [ ] **2.3 — `getLeaderboard`**
  - RED: test returns an empty array for a channel with no data
  - RED: test returns rows sorted by `run_count DESC, highest_run_seen DESC`, max 50
  - RED: test excludes rows where both `run_count = 0` and `highest_run_seen = 0`
  - GREEN: implement `getLeaderboard(db, channelId): Result<LeaderboardRow[], Error>`

- [ ] **2.4 — `getLeaderboardChannels` / `upsertLeaderboardChannel` / `deleteLeaderboardChannel` / `getLeaderboardChannel`**
  - RED: test `getLeaderboardChannels` returns an empty array initially
  - RED: test `upsertLeaderboardChannel` inserts a new channel row
  - RED: test `upsertLeaderboardChannel` updates `channel_name` and `updated_at` on conflict
  - RED: test `deleteLeaderboardChannel` removes the row
  - RED: test `getLeaderboardChannel` returns `null` for unknown channel, returns the row for a known channel
  - GREEN: implement all four functions

- [ ] **2.5 — `getLeaderboardPost` / `upsertLeaderboardPost` / `deleteLeaderboardPost`**
  - RED: test `getLeaderboardPost` returns `null` for a channel with no stored post
  - RED: test `upsertLeaderboardPost` overwrites the stored message for the same `channel_id`
  - RED: test `upsertLeaderboardPost` persists the content hash
  - RED: test `deleteLeaderboardPost` removes the row
  - GREEN: implement all three functions using `channel_id` as the key

- [ ] **2.6 — `getRecoveryState` / `upsertRecoveryState`**
  - RED: test returns `null` for an unknown channel
  - RED: test round-trips `last_processed_message_id`
  - GREEN: implement both using explicit UPSERT syntax

- [ ] **2.7 — `getMonitoredChannels` / `addMonitoredChannel` / `deleteMonitoredChannel` / `isMonitoredChannel` / `getMonitoredChannelsByLeaderboard`**
  - RED: test monitored channels are empty initially
  - RED: test adding a monitored channel with a `leaderboardChannelId` inserts a row
  - RED: test adding the same channel again is idempotent
  - RED: test deleting the channel removes it
  - RED: test `getMonitoredChannelsByLeaderboard` returns only channels linked to a given leaderboard channel
  - GREEN: implement all five functions

- [ ] **2.8 — `claimProcessedMessage` / `hasProcessedMessage` / `pruneProcessedMessages`**
  - RED: test first claim for a message ID succeeds
  - RED: test second claim for the same message ID is rejected
  - RED: test `hasProcessedMessage` returns `true` after a successful claim
  - RED: test `pruneProcessedMessages` deletes rows older than the provided threshold (14 days)
  - RED: test `pruneProcessedMessages` preserves rows newer than the threshold
  - GREEN: implement all three against `processed_messages`

---

### Phase 3 — Tracker Service (`services/tracker.ts`)

The tracker contains pure business logic. It takes the current `UserStats | null`, a new post timestamp, and a username, then returns updated stats.

- [ ] **3.1 — `computeNewStats`**
  - RED: test first-ever post sets `runCount = 1` and `highestRunSeen = 1`
  - RED: test delta `<= 8h` leaves `runCount` unchanged and updates `lastMusicPostAt`
  - RED: test `8h < delta <= 36h` increments `runCount`
  - RED: test `highestRunSeen` updates whenever the new active streak exceeds the prior best
  - RED: test `delta > 36h` resets `runCount` to `1` (the new post itself starts a fresh streak)
  - GREEN: implement `computeNewStats(existing, newPostTimestamp, username)`

- [ ] **3.2 — `hasMusicAttachment`**
  - RED: test returns `true` for `.mp3`, `.ogg`, `.wav`, `.flac`, `.m4a`, and `.aac`
  - RED: test file extension matching is case-insensitive
  - RED: test `song.mp3.txt` is rejected
  - RED: test non-audio attachments return `false`
  - RED: test no attachments returns `false`
  - RED: test attachment with no filename but a matching `content_type` (e.g. `audio/mpeg`) returns `true`
  - RED: test attachment with no filename and a non-audio `content_type` returns `false`
  - GREEN: implement `hasMusicAttachment(attachments)`
    - Primary check: file extension from `filename`
    - Fallback: if `filename` is absent, check `content_type` starts with `audio/`

- [ ] **3.3 — `resolveUsername`**
  - RED: test prefers `member.nick`
  - RED: test falls back to `author.global_name`
  - RED: test falls back to `author.username`
  - GREEN: implement `resolveUsername(author, member)`

---

### Phase 4 — Shared Message Processor (`services/processor.ts`)

This service is the single authoritative path for message ingestion used by both the gateway handler and recovery. It accepts only `DEFAULT` (type 0) and `REPLY` (type 19) messages; all other message types are ignored.

- [ ] **4.1 — `processMessage`**
  - RED: test ignores a message from a non-monitored channel
  - RED: test ignores a message with no supported music attachment
  - RED: test ignores bot messages (`author.bot === true`)
  - RED: test ignores messages with types not in `ACCEPTED_MESSAGE_TYPES` (only `DEFAULT = 0` and `REPLY = 19` are accepted)
  - RED: test claims a message ID before mutating stats
  - RED: test skips processing when the message ID is already claimed
  - RED: test processes a valid music message by reading stats, computing new stats, and upserting stats
  - RED: test advances `recovery_state.last_processed_message_id` only after successful processing
  - RED: test returns `Result.err` on DB failure but does not advance `recovery_state`
  - GREEN: implement `processMessage(db, message): Result<boolean, Error>`
    - Returns `Result.ok(true)` when the message was processed
    - Returns `Result.ok(false)` when the message was skipped (filtered or already claimed)
    - Returns `Result.err` on failure

---

### Phase 5 — Leaderboard Service (`services/leaderboard.ts`)

- [ ] **5.1 — `formatLeaderboard`**
  - RED: test returns a formatted header using the provided channel display name
  - RED: test returns a "no data" message for an empty leaderboard
  - RED: test ranks start at 1 and increment correctly
  - RED: test formatted content remains below Discord's message length limit for the maximum row count
  - GREEN: implement `formatLeaderboard(channelName: string, rows: LeaderboardRow[]): string`

- [ ] **5.2 — `hashContent`**
  - RED: test produces a consistent hex digest for the same input
  - RED: test produces different digests for different inputs
  - GREEN: implement `hashContent(content: string): string` using FNV-1a (fast, non-cryptographic, good collision resistance for this use case)

---

### Phase 6 — Discord API Client (`services/discord.ts`)

Uses `fetch` directly. Tests use request interception. All requests go through a shared `discordFetch` wrapper that enforces rate-limit discipline.

**Rate-limit strategy:**
- Maintain a minimum delay of **1 100 ms** between consecutive Discord API requests (stays well within 5 requests / 5 seconds).
- On a `429` response, read the `Retry-After` header (seconds), wait that duration, then retry the request once.
- On a second consecutive `429`, return `Result.err` and let the caller decide.

- [ ] **6.1 — `discordFetch` (internal helper)**
  - RED: test enforces minimum delay between consecutive calls
  - RED: test retries once on `429` after the `Retry-After` duration
  - RED: test returns `Result.err` on a second consecutive `429`
  - GREEN: implement `discordFetch(token, url, options): Promise<Result<Response, Error>>`

- [ ] **6.2 — `sendMessage`**
  - RED: test makes `POST /channels/{id}/messages` with correct headers and body
  - RED: test returns `Result.ok(messageId)` on success
  - RED: test returns `Result.err` on non-2xx
  - GREEN: implement `sendMessage(token, channelId, content): Promise<Result<string, Error>>`

- [ ] **6.3 — `deleteMessage`**
  - RED: test makes `DELETE /channels/{id}/messages/{messageId}`
  - RED: test returns `Result.ok(true)` on `204`
  - RED: test returns `Result.ok(true)` on `404`
  - RED: test returns `Result.err` on other non-2xx responses
  - GREEN: implement `deleteMessage(token, channelId, messageId): Promise<Result<boolean, Error>>`

- [ ] **6.4 — `fetchMessagesAfter`**
  - RED: test makes `GET /channels/{id}/messages?after={afterId}&limit=100`
  - RED: test returns `Result.ok(DiscordMessage[])` on success
  - RED: test returns `Result.err` on non-2xx
  - GREEN: implement `fetchMessagesAfter(token, channelId, afterId): Promise<Result<DiscordMessage[], Error>>`

- [ ] **6.5 — `fetchChannel`**
  - RED: test makes `GET /channels/{id}`
  - RED: test returns `Result.ok({ id, name })` on success
  - RED: test returns `Result.err` on non-2xx
  - GREEN: implement `fetchChannel(token, channelId): Promise<Result<{ id: string; name: string }, Error>>`

---

### Phase 7 — Recovery Service (`services/recovery.ts`)

- [ ] **7.1 — `recoverChannel`**
  - RED: test begins from `last_processed_message_id` (exclusive — the checkpoint message itself is not re-fetched)
  - RED: test begins from `after=0` when `last_processed_message_id` is `null` (fetches from the very beginning of the channel)
  - RED: test sorts each fetched batch from oldest to newest before processing
  - RED: test skips already processed message IDs safely
  - RED: test updates `recovery_state` with the highest successfully processed message ID
  - RED: test does not advance the checkpoint beyond a failed message
  - RED: test loops through multiple pages until caught up
  - GREEN: implement `recoverChannel(db, token, channelId): Promise<Result<number, Error>>`

- [ ] **7.2 — `recoverAllChannels`**
  - RED: test iterates all monitored channels and calls `recoverChannel` for each
  - GREEN: implement `recoverAllChannels(db, token): Promise<Result<void, Error>>`

---

### Phase 8 — Gateway Handler (`handlers/gateway.ts`)

The `discord.js` library manages the gateway lifecycle (heartbeat, reconnection, session resume). This handler only needs to listen for events on the `discord.js` `Client`.

- [ ] **8.1 — Gateway event dispatch**
  - RED: test `messageCreate` events are routed to `processMessage`
  - RED: test bot messages are ignored before reaching `processMessage`
  - GREEN: implement `setupGatewayHandler(client, db)`
    - Listens on the `discord.js` `client.on('messageCreate', ...)` event
    - Calls `processMessage(db, message)` and logs errors on `Result.err` (fire-and-forget; recovery will retry later)

---

### Phase 9 — Slash Command Handlers (`handlers/interactions.ts`)

- [ ] **9.1 — Interaction signature verification**
  - RED: test missing signature headers return `401`
  - RED: test invalid signatures return `401`
  - RED: test valid requests reach the interaction router
  - GREEN: implement interaction verification middleware

- [ ] **9.2 — Ping/pong**
  - RED: test `type = 1` returns `{ type: 1 }`
  - GREEN: implement the ping handler

- [ ] **9.3 — `/leaderboard [channel]`**
  - RED: test when no channel option is provided, uses `interaction.channel_id` as the target
  - RED: test when a channel option is provided, uses that channel ID as the target
  - RED: test returns an error if the target channel is not in `leaderboard_channels`
  - RED: test resolves the channel display name: from `interaction.channel.name` for the current channel, via `fetchChannel` for a different channel
  - RED: test queries `getMonitoredChannelsByLeaderboard` to find all monitored channels for the target, then queries `getLeaderboard` for each and merges rows
  - RED: test passes the channel display name into `formatLeaderboard`
  - RED: test returns an ephemeral response
  - RED: test returns a "no data" message when no monitored channels have stats
  - GREEN: implement `/leaderboard`

- [ ] **9.4 — `/setleaderboardchannel`**
  - Takes no arguments; operates on the current channel.
  - RED: test rejects a user without the `ADMINISTRATOR` permission (BigInt check)
  - RED: test accepts a user with the `ADMINISTRATOR` permission
  - RED: test upserts the current channel into `leaderboard_channels`
  - RED: test refreshes the stored `channel_name` when the command is run again for the same channel
  - RED: test does **not** add the current channel to `monitored_channels` (monitored channels are managed separately)
  - GREEN: implement `/setleaderboardchannel`

- [ ] **9.5 — `/removeleaderboardchannel`**
  - Takes no arguments; operates on the current channel.
  - RED: test rejects a user without the `ADMINISTRATOR` permission
  - RED: test removes the current channel from `leaderboard_channels`
  - RED: test removes all `monitored_channels` rows that reference this leaderboard channel
  - RED: test deletes the stored `leaderboard_posts` row for the channel
  - RED: test does not delete historical `user_stats`, `recovery_state`, or `processed_messages` rows
  - GREEN: implement `/removeleaderboardchannel`

- [ ] **9.6 — `/addmonitoredchannel <channel>`**
  - Takes one required argument: the channel to monitor.
  - RED: test rejects a user without the `ADMINISTRATOR` permission
  - RED: test rejects if the current channel is not in `leaderboard_channels` (the admin must first set a leaderboard channel, then run this command from that leaderboard channel to link a monitored channel)
  - RED: test adds the provided channel to `monitored_channels` with `leaderboard_channel_id` set to the current channel
  - RED: test is idempotent (adding the same channel again does not error)
  - GREEN: implement `/addmonitoredchannel`

- [ ] **9.7 — `/removemonitoredchannel <channel>`**
  - Takes one required argument: the channel to stop monitoring.
  - RED: test rejects a user without the `ADMINISTRATOR` permission
  - RED: test removes the provided channel from `monitored_channels`
  - RED: test does not delete historical `user_stats`, `recovery_state`, or `processed_messages` rows
  - GREEN: implement `/removemonitoredchannel`

- [ ] **9.8 — Interaction router**
  - RED: test unknown commands return `400`
  - GREEN: implement the command router

---

### Phase 10 — Scheduled Handler (`handlers/scheduled.ts`)

- [ ] **10.1 — `runScheduledWork`**
  - RED: test recovery runs before leaderboard posting
  - RED: test `pruneProcessedMessages` runs after leaderboard posting (deletes rows older than 14 days)
  - RED: test does nothing when there are no configured leaderboard channels
  - RED: test processes each leaderboard channel independently
  - RED: test for each leaderboard channel, queries all linked monitored channels, merges leaderboard rows, and formats using the stored `channel_name`
  - RED: test computes a content hash (FNV-1a) per channel and skips unchanged content
  - RED: test deletes the previous leaderboard message when one exists
  - RED: test continues gracefully when message deletion returns `404`
  - RED: test posts a new leaderboard and upserts `leaderboard_posts(channel_id, message_id, content_hash)`
  - GREEN: implement `runScheduledWork(db, token): Promise<Result<void, Error>>`

---

### Phase 11 — Entry Point (`src/index.ts`)

- [ ] **11.1** Create the `discord.js` `Client` with required intents: `Guilds`, `GuildMessages`, `MessageContent`
- [ ] **11.2** Initialise the better-sqlite3 database from a file path (environment variable `DATABASE_PATH`), apply `schema.sql` if tables don't exist
- [ ] **11.3** Wire the gateway handler: `setupGatewayHandler(client, db)`
- [ ] **11.4** Wire the HTTP `fetch` handler (separate HTTP server or express-like listener):
  - `POST /interactions` → signature verification → interaction router
- [ ] **11.5** Set up a `setInterval` (or `node-cron`) timer for hourly scheduled work that calls `runScheduledWork(db, token)`
- [ ] **11.6** Call `client.login(DISCORD_BOT_TOKEN)` to start the gateway connection
- [ ] **11.7** Add an integration smoke test that simulates a `messageCreate` event on the client and verifies a DB row is created

---

### Phase 12 — Slash Command Registration & Deployment

- [ ] **12.1** Create `src/scripts/register-commands.ts` that registers all slash commands via the Discord REST API:

```typescript
const commands = [
  {
    name: 'leaderboard',
    description: 'Show the music leaderboard for a channel',
    options: [
      {
        name: 'channel',
        description: 'The leaderboard channel to display (defaults to current channel)',
        type: 7, // CHANNEL
        required: false,
        channel_types: [0], // GUILD_TEXT
      },
    ],
  },
  {
    name: 'setleaderboardchannel',
    description: 'Designate the current channel as a leaderboard channel',
  },
  {
    name: 'removeleaderboardchannel',
    description: 'Remove the current channel as a leaderboard channel',
  },
  {
    name: 'addmonitoredchannel',
    description: 'Add a channel to monitor for music uploads, linked to the current leaderboard channel',
    options: [
      {
        name: 'channel',
        description: 'The channel to monitor for music uploads',
        type: 7, // CHANNEL
        required: true,
        channel_types: [0], // GUILD_TEXT
      },
    ],
  },
  {
    name: 'removemonitoredchannel',
    description: 'Stop monitoring a channel for music uploads',
    options: [
      {
        name: 'channel',
        description: 'The channel to stop monitoring',
        type: 7, // CHANNEL
        required: true,
        channel_types: [0], // GUILD_TEXT
      },
    ],
  },
]
```

  - Run via `bun run src/scripts/register-commands.ts`
  - Uses `PUT /applications/{application_id}/commands` for bulk overwrite

- [ ] **12.2** Create the database file and apply the schema
- [ ] **12.3** Set environment variables: `DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY`, `DISCORD_APPLICATION_ID`, `DATABASE_PATH`
- [ ] **12.4** Deploy the app on the target machine
- [ ] **12.5** Run the registration script to register slash commands
- [ ] **12.6** Configure the Discord Interactions endpoint URL for the app
- [ ] **12.7** Enable the required gateway intents in the Discord developer portal: `MESSAGE_CONTENT`, `GUILD_MESSAGES`, `GUILDS`
- [ ] **12.8** Start the bot: `bun run src/index.ts`
- [ ] **12.9** Use `/setleaderboardchannel` in each channel that should display a leaderboard, then use `/addmonitoredchannel` from that leaderboard channel to link each channel that should be monitored for music uploads

---

## Types Reference (`src/types.ts`)

```typescript
import type BetterSqlite3 from 'better-sqlite3'

export type Database = BetterSqlite3.Database

export interface UserStats {
  readonly channelId: string
  readonly userId: string
  readonly username: string
  readonly lastMusicPostAt: number | null
  readonly runCount: number
  readonly highestRunSeen: number
}

export interface UpsertUserStatsInput {
  readonly channelId: string
  readonly userId: string
  readonly username: string
  readonly lastMusicPostAt: number
  readonly runCount: number
  readonly highestRunSeen: number
}

export interface LeaderboardRow {
  readonly username: string
  readonly runCount: number
  readonly highestRunSeen: number
}

export interface LeaderboardChannel {
  readonly channelId: string
  readonly guildId: string
  readonly channelName: string
  readonly addedByUserId: string
}

export interface LeaderboardPost {
  readonly channelId: string
  readonly messageId: string
  readonly contentHash: string
}

export interface MonitoredChannel {
  readonly channelId: string
  readonly guildId: string
  readonly leaderboardChannelId: string
}

export interface RecoveryState {
  readonly channelId: string
  readonly lastProcessedMessageId: string | null
}

export interface ProcessedMessage {
  readonly messageId: string
  readonly channelId: string
}

export interface DiscordUser {
  readonly id: string
  readonly username: string
  readonly global_name: string | null
  readonly bot?: boolean
}

export interface DiscordMember {
  readonly nick: string | null
  readonly permissions?: string
}

export interface DiscordAttachment {
  readonly id: string
  readonly filename?: string
  readonly content_type?: string
}

export interface DiscordMessage {
  readonly id: string
  readonly channel_id: string
  readonly guild_id?: string
  readonly author: DiscordUser
  readonly member?: DiscordMember
  readonly timestamp: string
  readonly attachments: readonly DiscordAttachment[]
  readonly type: number
}

export interface DiscordInteraction {
  readonly id: string
  readonly type: number
  readonly guild_id?: string
  readonly channel_id: string
  readonly member?: DiscordMember
  readonly channel?: {
    readonly id: string
    readonly name: string
  }
  readonly data?: DiscordInteractionData
}

export interface DiscordInteractionData {
  readonly name: string
  readonly options?: readonly DiscordInteractionOption[]
}

export interface DiscordInteractionOption {
  readonly name: string
  readonly value: string | number | boolean
}

export type StreakDeltaKind = 'first' | 'noop' | 'increment' | 'reset'

export interface Env {
  readonly DISCORD_BOT_TOKEN: string
  readonly DISCORD_PUBLIC_KEY: string
  readonly DISCORD_APPLICATION_ID: string
  readonly DATABASE_PATH: string
}
```

---

## Schema Reference (`src/db/schema.sql`)

```sql
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

CREATE TABLE IF NOT EXISTS leaderboard_channels (
    channel_id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    channel_name TEXT NOT NULL,
    added_by_user_id TEXT NOT NULL,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS leaderboard_posts (
    channel_id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    posted_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS recovery_state (
    channel_id TEXT PRIMARY KEY,
    last_processed_message_id TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS monitored_channels (
    channel_id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    leaderboard_channel_id TEXT NOT NULL,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS processed_messages (
    message_id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## Constants Reference (`src/constants.ts`)

```typescript
export const MUSIC_EXTENSIONS = ['.mp3', '.ogg', '.wav', '.flac', '.m4a', '.aac'] as const

export const AUDIO_CONTENT_TYPE_PREFIX = 'audio/' as const

export const EIGHT_HOURS_SECS = 28_800
export const THIRTY_SIX_HOURS_SECS = 129_600
export const LEADERBOARD_MAX_ROWS = 50
export const ADMINISTRATOR_PERMISSION = 0x8n

export const ACCEPTED_MESSAGE_TYPES = [0, 19] as const // DEFAULT, REPLY

export const PRUNE_THRESHOLD_DAYS = 14

export const DISCORD_API_DELAY_MS = 1_100

export const STANDARD_RETRY_OPTIONS = {
  retries: 3,
} as const
```

---

## Notes

- `runCount` resets to `1` when a post arrives more than 36 hours after the previous tracked post (the new post itself starts a fresh streak).
- `highestRunSeen` is updated whenever the active streak exceeds the previous best streak.
- Leaderboard channels and monitored channels are configured independently. A monitored channel has a `leaderboard_channel_id` foreign key linking it to the leaderboard channel where its stats are displayed.
- `/setleaderboardchannel` designates the current channel as a leaderboard posting target. It does **not** add it to `monitored_channels`.
- `/addmonitoredchannel <channel>` is run from a leaderboard channel. It adds the specified channel to `monitored_channels` and links it to the current leaderboard channel.
- `/removeleaderboardchannel` removes the current channel from `leaderboard_channels` and also removes all `monitored_channels` rows that reference it.
- `/removemonitoredchannel <channel>` removes the specified channel from `monitored_channels` without affecting the leaderboard channel.
- Removing a leaderboard or monitored channel stops future tracking and posting but preserves historical `user_stats`, `recovery_state`, and `processed_messages` rows.
- Scheduled leaderboard formatting uses the `channel_name` stored in `leaderboard_channels`, refreshed by `/setleaderboardchannel`.
- Each leaderboard channel is tracked independently, with its own post record and content hash.
- The `/leaderboard` command verifies the target channel is in `leaderboard_channels`, then queries all linked monitored channels and merges their leaderboard rows.
- Recovery always processes messages from oldest to newest inside each fetched batch. The checkpoint ID is **excluded** from the fetch (Discord's `after` parameter is exclusive).
- When `last_processed_message_id` is `null`, recovery starts from `after=0` to fetch from the beginning of the channel.
- Message IDs are stored in `processed_messages` so gateway and recovery paths remain idempotent. Rows older than 14 days are pruned during scheduled work.
- The gateway handler logs and swallows `processMessage` errors. Recovery will retry failed messages later.
- The Discord API client enforces a minimum 1 100 ms delay between requests and respects `429` / `Retry-After` headers.
- Use explicit UPSERT statements with `ON CONFLICT` instead of `INSERT OR REPLACE`.
- All `*Actual` DB functions are module-private; only their retry-wrapped counterparts are exported.
- Only `DEFAULT` (type 0) and `REPLY` (type 19) messages are processed; all other message types are ignored.
- `discord.js` manages the gateway lifecycle (heartbeat, reconnection, session resume).
- Permission checks parse the permissions string to `BigInt` and test with bitwise AND against `ADMINISTRATOR_PERMISSION` (`0x8n`).
- `hasMusicAttachment` checks file extension first; if `filename` is absent, falls back to checking `content_type` starts with `audio/`.
- `async-retry` is not used. Since better-sqlite3 is synchronous, the `withRetry` helper uses a simple synchronous retry loop.
