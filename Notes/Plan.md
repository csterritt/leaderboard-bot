# Discord Music Leaderboard Bot — Implementation Plan

## Overview

A bot that:

- receives `MESSAGE_CREATE` events through a gateway-based Discord client
- handles slash commands through the Discord Interactions HTTP endpoint
- tracks per-user music posting streaks separately for each monitored channel
- posts a separate scheduled leaderboard in each channel designated as a leaderboard channel

The implementation uses Red/Green TDD throughout.

---

## DB Access Pattern

Every database operation follows the same retry and `Result` pattern.

The updated `withRetry` and `toResult` design **does address** the earlier concern, as long as `withRetry` retries whenever the inner operation returns `Result.err`. The important behavior is that `withRetry` must convert `Result.err` into a thrown error inside the retry callback so `async-retry` can re-run the operation.

```typescript
const withRetry = async <T>(
  operationName: string,
  operation: () => Promise<Result<T, Error>>
): Promise<Result<T, Error>> => {
  try {
    return await retry(async () => {
      const result = await operation()

      if (result.isErr) {
        throw result.error
      }

      return result
    }, STANDARD_RETRY_OPTIONS)
  } catch (error) {
    console.error(`${operationName} failed`, error)
    return Result.err(error instanceof Error ? error : new Error(String(error)))
  }
}

const toResult = async <T>(fn: () => Promise<T>): Promise<Result<T, Error>> => {
  try {
    return Result.ok(await fn())
  } catch (error) {
    return Result.err(error instanceof Error ? error : new Error(String(error)))
  }
}

export const getUserStats = (
  db: Database,
  channelId: string,
  userId: string
): Promise<Result<UserStats | null, Error>> =>
  withRetry('getUserStats', () => getUserStatsActual(db, channelId, userId))

const getUserStatsActual = (
  db: Database,
  channelId: string,
  userId: string
): Promise<Result<UserStats | null, Error>> =>
  toResult(async () => {
    const row = await db
      .prepare('SELECT * FROM user_stats WHERE channel_id = ? AND user_id = ?')
      .bind(channelId, userId)
      .first<UserStatsRow>()

    return row ? mapUserStats(row) : null
  })
```

**Key rules:**
- `withRetry` wraps every exported DB function.
- `withRetry` retries when the inner function returns `Result.err` or throws.
- `toResult` is used inside each private `*Actual` function to normalize thrown exceptions.
- `*Actual` functions are never exported.
- Prefer explicit `INSERT ... ON CONFLICT ... DO UPDATE` statements over `INSERT OR REPLACE`.
- `Result` comes from `true-myth/result`.

---

## Project Structure

```
src/
├── index.ts                  # Main entry point, gateway bootstrap, fetch handler, scheduled handler
├── types.ts                  # Shared interfaces and type definitions
├── constants.ts              # File extensions, time thresholds, retry options, permission bit values
├── handlers/
│   ├── gateway.ts            # Gateway event dispatcher for MESSAGE_CREATE
│   ├── interactions.ts       # Slash command router + handlers
│   └── scheduled.ts          # Scheduled orchestration
├── db/
│   ├── schema.sql            # DDL for all tables
│   └── queries.ts            # All DB operations
├── services/
│   ├── tracker.ts            # Streak logic
│   ├── processor.ts          # Shared message-processing pipeline
│   ├── leaderboard.ts        # Leaderboard querying + formatting
│   ├── recovery.ts           # Message backfill logic
│   └── discord.ts            # Discord REST API client
└── utils/
    ├── time.ts               # ISO8601 → Unix seconds, threshold helpers
    ├── signature.ts          # Discord interaction signature verification
    ├── permissions.ts        # ADMINISTRATOR permission checks
    └── db-helpers.ts         # withRetry, toResult
```

---

## Implementation Checklist

Work through these phases in order. Each step: write the failing test first, then implement.

---

### Phase 0 — Project Scaffolding

- [ ] **0.1** Initialise project: `npm init`, install dependencies
  - Runtime/framework: gateway client
  - DB/result: `true-myth`, `async-retry`
  - Testing: `vitest`
  - Types: `typescript`, `@types/async-retry`
- [ ] **0.2** Configure `tsconfig.json` with strict mode and bundler module resolution
- [ ] **0.3** Configure `vitest.config.ts`
- [ ] **0.4** Create `src/db/schema.sql` with `user_stats`, `leaderboard_channels`, `leaderboard_posts`, `recovery_state`, `monitored_channels`, and `processed_messages`
- [ ] **0.5** Apply schema to local database
- [ ] **0.6** Create `src/constants.ts` with `MUSIC_EXTENSIONS`, `EIGHT_HOURS_SECS`, `THIRTY_SIX_HOURS_SECS`, `LEADERBOARD_MAX_ROWS`, `ADMINISTRATOR_PERMISSION`, and `STANDARD_RETRY_OPTIONS`
- [ ] **0.7** Create `src/types.ts` with the shared interfaces in the Types section below

---

### Phase 1 — Utility Layer

- [ ] **1.1 — `utils/time.ts`**
  - RED: test `parseDiscordTimestamp` converts ISO8601 strings to Unix seconds integers
  - RED: test fractional seconds and timezone normalization edge cases
  - GREEN: implement `parseDiscordTimestamp(iso: string): number`
  - RED: test `computeStreakDelta` returns `'first'`, `'reset'`, `'increment'`, or `'noop'`
  - GREEN: implement `computeStreakDelta(deltaSecs: number): StreakDeltaKind`

- [ ] **1.2 — `utils/signature.ts`**
  - RED: test a valid Discord interaction signature passes verification
  - RED: test a tampered body fails verification
  - GREEN: implement `verifyDiscordSignature({ publicKey, timestamp, body, signature }): Promise<boolean>`

- [ ] **1.3 — `utils/permissions.ts`**
  - RED: test `hasAdministratorPermission` returns `true` when the `ADMINISTRATOR` bit is present
  - RED: test `hasAdministratorPermission` returns `false` when the bit is absent
  - GREEN: implement `hasAdministratorPermission(permissions: string): boolean`

- [ ] **1.4 — `utils/db-helpers.ts`**
  - RED: test `toResult` returns `Result.ok(value)` on success
  - RED: test `toResult` returns `Result.err(Error)` when the callback throws
  - RED: test `withRetry` retries when the inner operation returns `Result.err`
  - RED: test `withRetry` retries when the inner operation throws
  - RED: test `withRetry` returns immediately on success without retrying
  - GREEN: implement `toResult<T>` and `withRetry<T>`

---

### Phase 2 — Database Schema & Queries (`db/queries.ts`)

All exported functions follow the `fn` / `fnActual` pattern. `Database` is always the first argument.

- [ ] **2.1 — `getUserStats`**
  - RED: test returns `Result.ok(null)` for an unknown user in a channel
  - RED: test returns `Result.ok(UserStats)` for a known user
  - GREEN: implement `getUserStats(db, channelId, userId)`

- [ ] **2.2 — `upsertUserStats`**
  - RED: test inserts a new row when no record exists
  - RED: test updates an existing row using explicit UPSERT semantics
  - RED: test preserves `updated_at` behavior expected by the schema
  - GREEN: implement `upsertUserStats(db, stats)` with `INSERT ... ON CONFLICT(channel_id, user_id) DO UPDATE`

- [ ] **2.3 — `getLeaderboard`**
  - RED: test returns an empty array for a channel with no data
  - RED: test returns rows sorted by `run_count DESC, highest_run_seen DESC`, max 50
  - RED: test excludes rows where both `run_count = 0` and `highest_run_seen = 0`
  - GREEN: implement `getLeaderboard(db, channelId)`

- [ ] **2.4 — `getLeaderboardChannels` / `upsertLeaderboardChannel` / `deleteLeaderboardChannel`**
  - RED: test `getLeaderboardChannels` returns an empty array initially
  - RED: test `upsertLeaderboardChannel` inserts a new channel row
  - RED: test `upsertLeaderboardChannel` updates `channel_name` and `updated_at` on conflict
  - RED: test `deleteLeaderboardChannel` removes the row
  - GREEN: implement all three functions

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

- [ ] **2.7 — `getMonitoredChannels` / `addMonitoredChannel` / `deleteMonitoredChannel` / `isMonitoredChannel`**
  - RED: test monitored channels are empty initially
  - RED: test adding a monitored channel inserts a row
  - RED: test adding the same channel again is idempotent
  - RED: test deleting the channel removes it
  - GREEN: implement all four functions

- [ ] **2.8 — `claimProcessedMessage` / `hasProcessedMessage`**
  - RED: test first claim for a message ID succeeds
  - RED: test second claim for the same message ID is rejected
  - RED: test `hasProcessedMessage` returns `true` after a successful claim
  - GREEN: implement both against `processed_messages`

---

### Phase 3 — Tracker Service (`services/tracker.ts`)

The tracker contains pure business logic. It takes the current `UserStats | null`, a new post timestamp, and a username, then returns updated stats.

- [ ] **3.1 — `computeNewStats`**
  - RED: test first-ever post sets `runCount = 1` and `highestRunSeen = 1`
  - RED: test delta `<= 8h` leaves `runCount` unchanged and updates `lastMusicPostAt`
  - RED: test `8h < delta <= 36h` increments `runCount`
  - RED: test `highestRunSeen` updates whenever the new active streak exceeds the prior best
  - RED: test `delta > 36h` resets `runCount` to `0`
  - GREEN: implement `computeNewStats(existing, newPostTimestamp, username)`

- [ ] **3.2 — `hasMusicAttachment`**
  - RED: test returns `true` for `.mp3`, `.ogg`, `.wav`, `.flac`, `.m4a`, and `.aac`
  - RED: test file extension matching is case-insensitive
  - RED: test `song.mp3.txt` is rejected
  - RED: test non-audio attachments return `false`
  - RED: test no attachments returns `false`
  - GREEN: implement `hasMusicAttachment(attachments)`

- [ ] **3.3 — `resolveUsername`**
  - RED: test prefers `member.nick`
  - RED: test falls back to `author.global_name`
  - RED: test falls back to `author.username`
  - GREEN: implement `resolveUsername(author, member)`

---

### Phase 4 — Shared Message Processor (`services/processor.ts`)

This service is the single authoritative path for message ingestion used by both the gateway handler and recovery.

- [ ] **4.1 — `processMessage`**
  - RED: test ignores a message from a non-monitored channel
  - RED: test ignores a message with no supported music attachment
  - RED: test ignores bot messages
  - RED: test ignores system/non-default messages when they should not affect streaks
  - RED: test claims a message ID before mutating stats
  - RED: test skips processing when the message ID is already claimed
  - RED: test processes a valid music message by reading stats, computing new stats, and upserting stats
  - RED: test advances `recovery_state.last_processed_message_id` only after successful processing
  - GREEN: implement `processMessage(db, message)`

---

### Phase 5 — Leaderboard Service (`services/leaderboard.ts`)

- [ ] **5.1 — `formatLeaderboard`**
  - RED: test returns a formatted header using the provided channel display name
  - RED: test returns a "no data" message for an empty leaderboard
  - RED: test ranks start at 1 and increment correctly
  - RED: test formatted content remains below Discord’s message length limit for the maximum row count
  - GREEN: implement `formatLeaderboard(channelName: string, rows: LeaderboardRow[]): string`

---

### Phase 6 — Discord API Client (`services/discord.ts`)

Uses `fetch` directly. Tests use request interception.

- [ ] **6.1 — `sendMessage`**
  - RED: test makes `POST /channels/{id}/messages` with correct headers and body
  - RED: test returns `Result.ok(messageId)` on success
  - RED: test returns `Result.err` on non-2xx
  - GREEN: implement `sendMessage(token, channelId, content)`

- [ ] **6.2 — `deleteMessage`**
  - RED: test makes `DELETE /channels/{id}/messages/{messageId}`
  - RED: test returns `Result.ok(true)` on `204`
  - RED: test returns `Result.ok(true)` on `404`
  - RED: test returns `Result.err` on other non-2xx responses
  - GREEN: implement `deleteMessage(token, channelId, messageId)`

- [ ] **6.3 — `fetchMessagesAfter`**
  - RED: test makes `GET /channels/{id}/messages?after={afterId}&limit=100`
  - RED: test returns `Result.ok(DiscordMessage[])` on success
  - RED: test returns `Result.err` on non-2xx
  - GREEN: implement `fetchMessagesAfter(token, channelId, afterId)`

---

### Phase 7 — Recovery Service (`services/recovery.ts`)

- [ ] **7.1 — `recoverChannel`**
  - RED: test begins from `last_processed_message_id` when present
  - RED: test begins from the start state when `last_processed_message_id` is `null`
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

- [ ] **8.1 — Gateway event dispatch**
  - RED: test `MESSAGE_CREATE` events are routed to `processMessage`
  - RED: test unrelated gateway events are ignored
  - GREEN: implement `handleGatewayEvent(db, event)`

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

- [ ] **9.3 — `/leaderboard`**
  - RED: test no channel option uses `interaction.channel_id`
  - RED: test channel option uses the provided channel ID
  - RED: test passes the channel display name into `formatLeaderboard`
  - RED: test returns an ephemeral response
  - RED: test returns a "no data" message when the channel has no stats
  - GREEN: implement `/leaderboard`

- [ ] **9.4 — `/setleaderboardchannel`**
  - RED: test rejects a user without the `ADMINISTRATOR` permission
  - RED: test accepts a user with the `ADMINISTRATOR` permission
  - RED: test upserts the channel into `leaderboard_channels`
  - RED: test refreshes the stored `channel_name` when the command is run again for the same channel
  - RED: test also adds the current channel into `monitored_channels`
  - GREEN: implement `/setleaderboardchannel`

- [ ] **9.5 — `/removeleaderboardchannel`**
  - RED: test rejects a user without the `ADMINISTRATOR` permission
  - RED: test removes the current channel from `leaderboard_channels`
  - RED: test also removes the current channel from `monitored_channels`
  - RED: test deletes the stored `leaderboard_posts` row for the channel
  - RED: test does not delete historical `user_stats`, `recovery_state`, or `processed_messages` rows
  - GREEN: implement `/removeleaderboardchannel`

- [ ] **9.6 — Interaction router**
  - RED: test unknown commands return `400`
  - GREEN: implement the command router

---

### Phase 10 — Scheduled Handler (`handlers/scheduled.ts`)

- [ ] **10.1 — `runScheduledLeaderboards`**
  - RED: test recovery runs before leaderboard posting
  - RED: test does nothing when there are no configured leaderboard channels
  - RED: test processes each leaderboard channel independently
  - RED: test formats each scheduled post using the `channel_name` stored in `leaderboard_channels`
  - RED: test computes a content hash per channel and skips unchanged content
  - RED: test deletes the previous leaderboard message when one exists
  - RED: test continues gracefully when message deletion returns `404`
  - RED: test posts a new leaderboard and upserts `leaderboard_posts(channel_id, message_id, content_hash)`
  - GREEN: implement `runScheduledLeaderboards(db, token): Promise<Result<void, Error>>`

---

### Phase 11 — Entry Point (`src/index.ts`)

- [ ] **11.1** Wire the HTTP `fetch` handler:
  - `POST /interactions` → signature verification → interaction router
- [ ] **11.2** Wire the gateway client:
  - `MESSAGE_CREATE` → gateway dispatcher → shared message processor
- [ ] **11.3** Export the scheduled handler that calls `recoverAllChannels` then `runScheduledLeaderboards`
- [ ] **11.4** Add an integration smoke test that simulates a gateway `MESSAGE_CREATE` event and verifies a DB row is created

---

### Phase 12 — Deployment & Configuration

- [ ] **12.1** Create the database
- [ ] **12.2** Apply the schema
- [ ] **12.3** Set secrets: `DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY`, `DISCORD_APPLICATION_ID`
- [ ] **12.4** Deploy the app
- [ ] **12.5** Register slash commands through the Discord API
- [ ] **12.6** Configure the Discord Interactions endpoint for the app
- [ ] **12.7** Enable the required gateway intents for guild message events
- [ ] **12.8** Use `/setleaderboardchannel` in each channel that should be monitored and receive its own scheduled leaderboard post

---

## Types Reference (`src/types.ts`)

```typescript
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
  readonly permissions: string
}

export interface DiscordAttachment {
  readonly id: string
  readonly filename: string
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

export interface GatewayDispatchEvent {
  readonly t: string
  readonly d: unknown
}

export type StreakDeltaKind = 'first' | 'noop' | 'increment' | 'reset'

export interface Env {
  readonly DISCORD_BOT_TOKEN: string
  readonly DISCORD_PUBLIC_KEY: string
  readonly DISCORD_APPLICATION_ID: string
}
```

---

## Constants Reference (`src/constants.ts`)

```typescript
export const MUSIC_EXTENSIONS = ['.mp3', '.ogg', '.wav', '.flac', '.m4a', '.aac'] as const

export const EIGHT_HOURS_SECS = 28_800
export const THIRTY_SIX_HOURS_SECS = 129_600
export const LEADERBOARD_MAX_ROWS = 50
export const ADMINISTRATOR_PERMISSION = 0x8n

export const STANDARD_RETRY_OPTIONS = {
  retries: 3,
  minTimeout: 100,
  maxTimeout: 1_000,
  factor: 2,
} as const
```

---

## Notes

- `runCount` resets to `0` when a post arrives more than 36 hours after the previous tracked post.
- `highestRunSeen` is updated whenever the active streak exceeds the previous best streak.
- `/setleaderboardchannel` both designates the current channel for scheduled leaderboard posting and adds it to `monitored_channels`.
- `/removeleaderboardchannel` removes the current channel from both `leaderboard_channels` and `monitored_channels`.
- Scheduled leaderboard formatting uses the `channel_name` stored in `leaderboard_channels`, and that value is refreshed by `/setleaderboardchannel`.
- Removing a leaderboard channel stops future tracking and posting for that channel but preserves historical `user_stats`, `recovery_state`, and `processed_messages` rows.
- Each leaderboard channel is tracked independently, with its own post record and content hash.
- Recovery always processes messages from oldest to newest inside each fetched batch.
- Message IDs are stored in `processed_messages` so gateway and recovery paths remain idempotent.
- Use explicit UPSERT statements with `ON CONFLICT` instead of `INSERT OR REPLACE`.
- All `*Actual` DB functions are module-private; only their retry-wrapped counterparts are exported.
