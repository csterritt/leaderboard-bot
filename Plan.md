# Discord Music Leaderboard Bot — Implementation Plan

## Overview

A Cloudflare Workers bot (Hono + D1) that monitors Discord channels for music file uploads, tracks per-user posting streaks, and auto-posts a leaderboard. Built with Red/Green TDD throughout.

---

## DB Access Pattern

Every database operation follows this exact structure (adapted from the reference pattern, but using D1 directly instead of Drizzle ORM):

```typescript
// Public entry point — wraps with retry logic
export const getUserStats = (
  db: D1Database,
  channelId: string,
  userId: string
): Promise<Result<UserStats | null, Error>> =>
  withRetry('getUserStats', () => getUserStatsActual(db, channelId, userId))

// Private implementation — wrapped in toResult
const getUserStatsActual = async (
  db: D1Database,
  channelId: string,
  userId: string
): Promise<Result<UserStats | null, Error>> => {
  try {
    const row = await db
      .prepare('SELECT * FROM user_stats WHERE channel_id = ? AND user_id = ?')
      .bind(channelId, userId)
      .first<UserStatsRow>()
    return Result.ok(row ? mapUserStats(row) : null)
  } catch (e) {
    return Result.err(e instanceof Error ? e : new Error(String(e)))
  }
}
```

**Key rules:**
- `withRetry` wraps every public function; it retries on thrown errors using `async-retry`.
- `toResult` is a helper for simple operations (wrap the D1 call, catch → `Result.err`).
- `*Actual` functions are **never exported**; they are only called by their public counterpart.
- The `D1Database` type comes from the Cloudflare Workers runtime (`@cloudflare/workers-types`).
- `Result` comes from `true-myth/result`.

---

## Project Structure

```
src/
├── index.ts                  # Worker entry point (Hono app, scheduled handler)
├── types.ts                  # Shared interfaces and type definitions
├── constants.ts              # MUSIC_EXTENSIONS, time thresholds, retry options
├── handlers/
│   ├── interactions.ts       # Slash command router + handlers
│   └── webhook.ts            # MESSAGE_CREATE webhook handler
├── db/
│   ├── schema.sql            # DDL for all tables
│   └── queries.ts            # All DB operations (retry+result pattern)
├── services/
│   ├── tracker.ts            # Streak logic (pure functions)
│   ├── leaderboard.ts        # Leaderboard generation + formatting
│   ├── recovery.ts           # Message backfill logic
│   └── discord.ts            # Discord REST API client
└── utils/
    ├── time.ts               # ISO8601 → Unix seconds, threshold helpers
    ├── signature.ts          # Discord request signature verification
    └── db-helpers.ts         # withRetry, toResult, isUniqueConstraintError
```

---

## Implementation Checklist

Work through these phases in order. Each step: write the failing test first, then implement.

---

### Phase 0 — Project Scaffolding

- [ ] **0.1** Initialise project: `npm init`, install dependencies
  - Runtime/framework: `hono`, `@cloudflare/workers-types`, `wrangler`
  - DB/result: `true-myth`, `async-retry`
  - Testing: `vitest`, `@cloudflare/vitest-pool-workers` (for D1 in tests)
  - Types: `typescript`, `@types/async-retry`
- [ ] **0.2** Configure `tsconfig.json` (target `ESNext`, `moduleResolution: bundler`, strict mode on)
- [ ] **0.3** Configure `wrangler.toml` (name, main, compatibility_date, D1 binding, cron trigger)
- [ ] **0.4** Configure `vitest.config.ts` with `@cloudflare/vitest-pool-workers` pool
- [ ] **0.5** Create `src/db/schema.sql` with all five tables (see Architecture §2)
- [ ] **0.6** Apply schema to local D1: `wrangler d1 execute leaderboard-db --local --file=src/db/schema.sql`
- [ ] **0.7** Create `src/constants.ts` with `MUSIC_EXTENSIONS`, `EIGHT_HOURS_SECS`, `THIRTY_SIX_HOURS_SECS`, `STANDARD_RETRY_OPTIONS`
- [ ] **0.8** Create `src/types.ts` with all shared interfaces (see §Types below)

---

### Phase 1 — Utility Layer (pure, no I/O)

- [ ] **1.1 — `utils/time.ts`**
  - RED: test `parseDiscordTimestamp` converts ISO8601 string to Unix seconds integer
  - RED: test edge cases (fractional seconds, Z vs +00:00)
  - GREEN: implement `parseDiscordTimestamp(iso: string): number`
  - RED: test `computeStreakDelta` returns `'first'`, `'reset'`, `'increment'`, or `'noop'` based on delta
  - GREEN: implement `computeStreakDelta(deltaSecs: number): StreakDeltaKind`

- [ ] **1.2 — `utils/signature.ts`**
  - RED: test that a valid Ed25519 signature passes verification
  - RED: test that a tampered body fails verification
  - GREEN: implement `verifyDiscordSignature({ publicKey, timestamp, body, signature }): Promise<boolean>` using `crypto.subtle`

- [ ] **1.3 — `utils/db-helpers.ts`**
  - RED: test `toResult` returns `Result.ok(value)` on success
  - RED: test `toResult` returns `Result.err(Error)` when the function throws
  - RED: test `withRetry` retries on thrown errors and eventually returns `Result.err` after exhaustion
  - RED: test `withRetry` returns immediately on success without retrying
  - GREEN: implement `toResult<T>` and `withRetry<T>` (mirrors the reference implementation exactly, but `D1Database` instead of `DrizzleClient`)

---

### Phase 2 — Database Schema & Queries (`db/queries.ts`)

All functions follow the `fn` / `fnActual` pattern. The `D1Database` is always the first argument.

- [ ] **2.1 — `getUserStats`**
  - RED: test returns `Result.ok(null)` for unknown user
  - RED: test returns `Result.ok(UserStats)` for known user
  - GREEN: implement `getUserStats(db, channelId, userId)`

- [ ] **2.2 — `upsertUserStats`**
  - RED: test inserts a new row when no record exists (verify via `getUserStats`)
  - RED: test updates existing row preserving fields not being set
  - GREEN: implement `upsertUserStats(db, stats: UpsertUserStatsInput)` using `INSERT OR REPLACE`

- [ ] **2.3 — `getLeaderboard`**
  - RED: test returns empty array for channel with no data
  - RED: test returns rows sorted by `run_count DESC, highest_run_seen DESC`, max 25
  - RED: test excludes rows where both `run_count = 0` and `highest_run_seen = 0`
  - GREEN: implement `getLeaderboard(db, channelId)`

- [ ] **2.4 — `getConfig` / `setConfig`**
  - RED: test `getConfig` returns `null` for missing key
  - RED: test `setConfig` then `getConfig` round-trips a value
  - GREEN: implement both using `INSERT OR REPLACE INTO config`

- [ ] **2.5 — `getLeaderboardPost` / `upsertLeaderboardPost` / `deleteLeaderboardPost`**
  - RED: test `getLeaderboardPost` returns `null` when table is empty for a channel
  - RED: test `upsertLeaderboardPost` inserts, then overwrites on second call (only one row per channel)
  - RED: test `deleteLeaderboardPost` removes the record
  - GREEN: implement all three

- [ ] **2.6 — `getRecoveryState` / `setRecoveryState`**
  - RED: test `getRecoveryState` returns `null` for unknown channel
  - RED: test `setRecoveryState` then `getRecoveryState` round-trips
  - GREEN: implement both using `INSERT OR REPLACE INTO recovery_state`

- [ ] **2.7 — `getMonitoredChannels` / `addMonitoredChannel`**
  - RED: test `getMonitoredChannels` returns empty array initially
  - RED: test `addMonitoredChannel` adds a row; duplicate insert is a no-op (`INSERT OR IGNORE`)
  - GREEN: implement both

---

### Phase 3 — Tracker Service (`services/tracker.ts`)

The tracker contains **pure business logic** — it takes a current `UserStats | null` plus a new post timestamp and returns an updated `UserStats`. No I/O.

- [ ] **3.1 — `computeNewStats`**
  - RED: test first-ever post → `run_count=1, highest_run_seen=1`
  - RED: test delta ≤ 8 h → `run_count` unchanged, `last_music_post_at` updated
  - RED: test 8 h < delta ≤ 36 h → `run_count` incremented by 1
  - RED: test `run_count` increment raises `highest_run_seen` when `run_count+1 > highest_run_seen`
  - RED: test delta > 36 h → `run_count` resets to 0; `highest_run_seen` updated if previous `run_count` was higher
  - GREEN: implement `computeNewStats(existing: UserStats | null, newPostTimestamp: number, username: string): UserStats`

- [ ] **3.2 — `hasMusicAttachment`**
  - RED: test returns `true` for message with `.mp3` attachment
  - RED: test returns `true` for `.ogg`, `.wav`, `.flac`, `.m4a`, `.aac`
  - RED: test returns `false` for message with only `.jpg` attachment
  - RED: test returns `false` for message with no attachments
  - GREEN: implement `hasMusicAttachment(attachments: DiscordAttachment[]): boolean`

- [ ] **3.3 — `resolveUsername`**
  - RED: test prefers `member.nick` when present
  - RED: test falls back to `author.global_name`
  - RED: test falls back to `author.username`
  - GREEN: implement `resolveUsername(author: DiscordUser, member?: DiscordMember): string`

---

### Phase 4 — Leaderboard Service (`services/leaderboard.ts`)

- [ ] **4.1 — `formatLeaderboard`**
  - RED: test returns a formatted string with the header when given rows
  - RED: test returns a "no data" message when given an empty array
  - RED: test ranks start at 1, entries are numbered correctly
  - GREEN: implement `formatLeaderboard(channelId: string, rows: LeaderboardRow[]): string`

---

### Phase 5 — Discord API Client (`services/discord.ts`)

Uses `fetch` directly (no SDK). Tests use `vi.mock` / MSW to intercept requests.

- [ ] **5.1 — `sendMessage`**
  - RED: test makes `POST /channels/{id}/messages` with correct Authorization header and body
  - RED: test returns `Result.ok(messageId)` on 200
  - RED: test returns `Result.err` on non-2xx
  - GREEN: implement `sendMessage(token, channelId, content): Promise<Result<string, Error>>`

- [ ] **5.2 — `deleteMessage`**
  - RED: test makes `DELETE /channels/{id}/messages/{msgId}` 
  - RED: test returns `Result.ok(true)` on 204
  - RED: test returns `Result.ok(true)` on 404 (already deleted — not an error)
  - RED: test returns `Result.err` on other non-2xx
  - GREEN: implement `deleteMessage(token, channelId, messageId): Promise<Result<boolean, Error>>`

- [ ] **5.3 — `fetchMessagesAfter`**
  - RED: test makes `GET /channels/{id}/messages?after={after}&limit=100`
  - RED: test returns `Result.ok(DiscordMessage[])` on 200
  - RED: test returns `Result.err` on non-2xx
  - GREEN: implement `fetchMessagesAfter(token, channelId, afterId): Promise<Result<DiscordMessage[], Error>>`

---

### Phase 6 — Recovery Service (`services/recovery.ts`)

- [ ] **6.1 — `recoverChannel`**
  - RED: test fetches messages after `last_processed_message_id` and processes each through tracker
  - RED: test updates `recovery_state` with the last message ID processed
  - RED: test stops when no messages are returned (caught up)
  - RED: test handles multiple pages (loop until empty batch)
  - GREEN: implement `recoverChannel(db, token, channelId): Promise<Result<number, Error>>` (returns count processed)

- [ ] **6.2 — `recoverAllChannels`**
  - RED: test iterates all rows from `monitored_channels` and calls `recoverChannel` for each
  - GREEN: implement `recoverAllChannels(db, token): Promise<void>`

---

### Phase 7 — Webhook Handler (`handlers/webhook.ts`)

- [ ] **7.1 — Signature verification middleware**
  - RED: test rejects request with missing headers with 401
  - RED: test rejects request with invalid signature with 401
  - RED: test passes valid request through to handler
  - GREEN: implement Hono middleware using `verifyDiscordSignature`

- [ ] **7.2 — `handleMessageCreate`**
  - RED: test ignores message from a non-monitored channel (no DB writes)
  - RED: test ignores message with no music attachments (no DB writes)
  - RED: test ignores messages from bot users (`author.bot === true`)
  - RED: test processes valid music message: reads stats → computes new stats → upserts stats
  - RED: test updates `recovery_state.last_processed_message_id`
  - GREEN: implement `handleMessageCreate(db, token, message: DiscordMessage): Promise<Response>`

---

### Phase 8 — Slash Command Handlers (`handlers/interactions.ts`)

- [ ] **8.1 — Ping/pong (Discord interaction verification)**
  - RED: test `type=1` (PING) returns `{ type: 1 }` (PONG)
  - GREEN: implement ping handler

- [ ] **8.2 — `/leaderboard`**
  - RED: test with no channel option uses `channel_id` from interaction context
  - RED: test with channel option uses the provided channel ID
  - RED: test formats and returns leaderboard content as ephemeral `type=4` response
  - RED: test returns "no data" message when channel has no stats
  - GREEN: implement `/leaderboard` handler

- [ ] **8.3 — `/setleaderboardchannel`**
  - RED: test rejects user without Server Owner role (role ID == guild ID) with ephemeral error
  - RED: test accepts user with Server Owner role, stores `leaderboard_channel_id` in config, responds with confirmation
  - GREEN: implement `/setleaderboardchannel` handler

- [ ] **8.4 — Interaction router**
  - RED: test unknown command returns 400
  - GREEN: implement router that dispatches to the correct handler by command name

---

### Phase 9 — Scheduled Handler (hourly leaderboard post)

- [ ] **9.1 — `runScheduledLeaderboard`**
  - RED: test does nothing when `leaderboard_channel_id` is not configured
  - RED: test does nothing when leaderboard data has not changed since last post (compare content hash or `updated_at`)
  - RED: test deletes previous leaderboard message when one exists (calls `deleteMessage`)
  - RED: test posts new leaderboard message, stores new `message_id` in `leaderboard_posts`
  - RED: test continues gracefully when `deleteMessage` returns 404
  - GREEN: implement `runScheduledLeaderboard(db, token): Promise<void>`

---

### Phase 10 — Entry Point (`src/index.ts`)

- [ ] **10.1** Wire Hono app:
  - `POST /interactions` → signature middleware → interaction router
  - `POST /webhook/message` → signature middleware → `handleMessageCreate`
- [ ] **10.2** Export `scheduled` handler that calls `recoverAllChannels` then `runScheduledLeaderboard`
- [ ] **10.3** Integration smoke test: spin up worker locally with `wrangler dev`, send a test `MESSAGE_CREATE` payload, verify DB row is created

---

### Phase 11 — Deployment & Configuration

- [ ] **11.1** Create D1 database: `wrangler d1 create leaderboard-db`
- [ ] **11.2** Apply schema: `wrangler d1 execute leaderboard-db --file=src/db/schema.sql`
- [ ] **11.3** Set secrets: `wrangler secret put DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY`, `DISCORD_APPLICATION_ID`
- [ ] **11.4** Deploy: `wrangler deploy`
- [ ] **11.5** Register slash commands via Discord API (`PUT /applications/{id}/commands`)
- [ ] **11.6** Set webhook URL in Discord developer portal to `https://<worker>.workers.dev/webhook/message`
- [ ] **11.7** Seed `monitored_channels` with initial channel via `wrangler d1 execute` or the `/setleaderboardchannel` command

---

## Types Reference (`src/types.ts`)

```typescript
export interface UserStats {
  readonly channelId: string
  readonly userId: string
  readonly username: string
  readonly lastMusicPostAt: number | null  // Unix seconds
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

export interface LeaderboardPost {
  readonly channelId: string
  readonly messageId: string
}

export interface MonitoredChannel {
  readonly channelId: string
  readonly guildId: string
}

export interface RecoveryState {
  readonly channelId: string
  readonly lastProcessedMessageId: string | null
}

export interface DiscordUser {
  readonly id: string
  readonly username: string
  readonly global_name: string | null
  readonly bot?: boolean
}

export interface DiscordMember {
  readonly nick: string | null
  readonly roles: readonly string[]
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
  readonly content: string
  readonly timestamp: string  // ISO8601
  readonly attachments: readonly DiscordAttachment[]
  readonly type: number
}

export interface DiscordInteraction {
  readonly id: string
  readonly type: number
  readonly guild_id?: string
  readonly channel_id: string
  readonly member?: DiscordMember
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
  readonly DB: D1Database
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

export const STANDARD_RETRY_OPTIONS = {
  retries: 3,
  minTimeout: 100,
  maxTimeout: 1_000,
  factor: 2,
} as const

export const LEADERBOARD_MAX_ROWS = 25
```

---

## Notes

- **Streak reset sets `run_count = 0`**, not 1. The user must post again in a new valid window to begin a fresh streak.
- **`highest_run_seen` is updated on reset**, not on increment — so the best streak is captured at the moment a streak ends (or when the first post of all time is made).
- **Server Owner check**: `member.roles.includes(interaction.guild_id)` per the Architecture note. If a `GUILD_FETCH` is needed to get `owner_id`, that is a future enhancement.
- **Change detection for scheduled leaderboard**: compare a SHA-256 hash of the rendered leaderboard string against the previously stored value in the `config` table (`key = 'leaderboard_hash'`) to avoid redundant posts.
- **D1 `first<T>()`** returns `T | null`; **`all<T>()`** returns `{ results: T[] }`. Use `.results` when calling `.all()`.
- All `*Actual` functions are unexported module-private; only their retry-wrapped counterparts are exported from `db/queries.ts`.
