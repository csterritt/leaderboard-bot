# Wiki Log

## [2026-04-07] ingest | Phase 0 — Project Scaffolding

Scaffolded the project with `bun init`. Installed: `discord.js`, `better-sqlite3`, `@types/better-sqlite3`, `true-myth`, `vitest`. Configured `tsconfig.json` (strict, bundler moduleResolution), `vitest.config.ts`, and `package.json` test scripts. Created `src/db/schema.sql`, `src/constants.ts`, `src/types.ts`. Applied schema to local `leaderboard.db` — all 6 tables confirmed. Created `tests/` and `e2e-tests/` directories.

## [2026-04-07] ingest | Phase 1 — Utility Layer

Wrote RED tests for all four utility modules, then implemented GREEN:
- `src/utils/time.ts`: `parseDiscordTimestamp`, `computeStreakDelta`
- `src/utils/signature.ts`: `verifyDiscordSignature` (Ed25519 via Web Crypto)
- `src/utils/permissions.ts`: `hasAdministratorPermission` (BigInt)
- `src/utils/db-helpers.ts`: `toResult`, `withRetry`

All 30 tests pass (4 test files).

## [2026-04-07] ingest | Phase 2 — Database Queries (`db/queries.ts`)

Wrote RED tests (`tests/queries.test.ts`, 37 tests), then implemented GREEN:
- `src/db/queries.ts`: all 8 query groups (getUserStats, upsertUserStats, getLeaderboard, leaderboard channel CRUD, leaderboard post CRUD, recovery state, monitored channels, processed message idempotency).
- All functions follow `fn`/`fnActual` + `withRetry`/`toResult` pattern.
- Explicit `INSERT … ON CONFLICT … DO UPDATE` UPSERTs throughout; `updated_at = CURRENT_TIMESTAMP` in `DO UPDATE` clause.
- `addMonitoredChannel` uses `ON CONFLICT(channel_id) DO NOTHING`; UNIQUE constraint on `leaderboard_channel_id` rejects linking a second monitored channel.

All 67 tests pass (5 test files).

## [2026-04-07] ingest | Phase 3 — Tracker Service (`services/tracker.ts`)

Wrote RED tests (`tests/tracker.test.ts`, 25 tests), then implemented GREEN:
- `src/services/tracker.ts`: `computeNewStats`, `hasMusicAttachment`, `resolveUsername`.
- Pure business logic; no DB access.
- `computeNewStats` delegates to `computeStreakDelta` for delta classification; handles negative deltas, first posts, streak reset/increment/noop.
- `hasMusicAttachment` checks extension first, falls back to `content_type` starts-with `audio/`.
- `resolveUsername` priority: nick → globalName → username.

All 92 tests pass (6 test files).

## [2026-04-07] ingest | Phase 4 -- Shared Message Processor (`services/processor.ts`)

Wrote RED tests (`tests/processor.test.ts`, 17 tests), then implemented GREEN:
- `normalizeDiscordMessage`: converts raw REST `DiscordMessage` (snake_case) to `NormalizedMessage`.
- `normalizeGatewayMessage`: converts `discord.js` gateway message (Map-based attachments, `createdTimestamp`) to `NormalizedMessage`.
- `processMessage`: single transactional path; filters bots/bad types/no-music/non-monitored; atomically claims + upserts stats; rolls back on failure; does not touch `recovery_state`.

All 109 tests pass (7 test files).

## [2026-04-07] ingest | Phase 5 -- Leaderboard Service (`services/leaderboard.ts`)

Wrote RED tests (`tests/leaderboard.test.ts`, 11 tests), then implemented GREEN:
- `formatLeaderboard`: Discord-safe formatting (header, ranked rows, empty state); escapes `|` and backticks in usernames; truncates to 32 chars; output <= 2 000 chars for 50 rows.
- `hashContent`: FNV-1a 32-bit hash, returns lowercase hex. Used for leaderboard change detection.

All 120 tests pass (8 test files).

## [2026-04-07] ingest | Phase 6 -- Discord API Client (`services/discord.ts`)

Wrote RED tests (`tests/discord.test.ts`, 16 tests), then implemented GREEN:
- `discordFetch` (internal): promise-chained delay (>= 1 100 ms between requests); 429 retry with `Retry-After`; second consecutive 429 -> `Result.err`.
- `sendMessage`: POST /channels/{id}/messages, returns `Result.ok(messageId)`.
- `deleteMessage`: DELETE /channels/{id}/messages/{msgId}, treats 404 as success.
- `fetchMessagesAfter`: GET /channels/{id}/messages?after={id}&limit=100, returns `Result.ok(DiscordMessage[])`.
- `fetchChannel`: GET /channels/{id}, returns `Result.ok({ id, name })`.
- `_resetRateLimit` exported for test isolation only.

All 136 tests pass (9 test files).
