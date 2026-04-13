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

## [2026-04-07] ingest | Phase 7 — Recovery Service (`services/recovery.ts`)

Wrote RED tests (`tests/recovery.test.ts`, 11 tests), then implemented GREEN:

- `recoverChannel`: reads recovery_state cursor, fetches pages via `fetchMessagesAfter`, sorts oldest-to-newest, processes via `processMessage`, advances `upsertRecoveryState` per message. Returns `Result.err` on first failure without advancing checkpoint.
- `recoverAllChannels`: iterates all monitored channels, calls `recoverChannel` per channel. Fails fast on first error.

All 147 tests pass (10 test files).

## [2026-04-07] ingest | Phase 8 — Gateway Handler (`handlers/gateway.ts`)

Wrote RED tests (`tests/gateway.test.ts`, 5 tests), then implemented GREEN:

- `setupGatewayHandler(client, db)`: registers discord.js `messageCreate` listener; calls `normalizeGatewayMessage` + `processMessage`; logs errors but does not throw.

All 152 tests pass (11 test files).

## [2026-04-07] ingest | Phase 9 — Interactions Handler (`handlers/interactions.ts`)

Wrote RED tests (`tests/interactions.test.ts`, 38 tests), then implemented GREEN:

- `handleInteractionWithVerifier`: Ed25519 signature verification, JSON parse, ping handler (type 1), interaction router.
- `handleInteraction`: wraps with `verifyDiscordSignature`.
- 5 slash commands: `/leaderboard`, `/setleaderboardchannel`, `/removeleaderboardchannel`, `/addmonitoredchannel`, `/removemonitoredchannel`.
- All admin commands guarded by `hasAdministratorPermission`. All use guild guard.

All 190 tests pass (12 test files).

## [2026-04-08] ingest | Phase 10 — Scheduled Handler (`handlers/scheduled.ts`)

Wrote RED tests (`tests/scheduled.test.ts`, 11 tests), then implemented GREEN:

- `runScheduledWork(db, token)`: (1) no-ops if no leaderboard channels, (2) runs `recoverAllChannels`, (3) for each leaderboard channel: looks up linked monitored channel, fetches leaderboard rows, formats content, computes FNV-1a hash, skips if hash unchanged, deletes old post (tolerating 404), posts new message, upserts `leaderboard_posts`. Removes orphaned posts for channels with no linked monitored channel. (4) prunes `processed_messages` older than 14 days.

All 201 tests pass (13 test files).

## [2026-04-08] ingest | Phase 11 — Entry Point (`src/index.ts`)

Wrote integration tests (`tests/index.test.ts`, 2 tests), then implemented:

- `src/index.ts`: creates `discord.js` Client with Guilds/GuildMessages/MessageContent intents, opens better-sqlite3 DB (DATABASE_PATH env), applies schema, wires gateway handler, starts Bun HTTP server on PORT (default 3000) for `POST /interactions`, runs startup recovery pass, sets hourly `setInterval` for `runScheduledWork`, calls `client.login`.

All 203 tests pass (14 test files).

## [2026-04-08] ingest | Phase 13 — End-to-End Tests & Clock Facility

Implemented:

- `src/utils/clock.ts`: mockable `Clock` interface (`now()`, `set()`, `advance()`, `hasPassed()`, `reset()`). Used in e2e tests to control time without touching system clock.
- `e2e-tests/utils/clock.test.ts`: 9 tests for the clock facility.
- `e2e-tests/streaks/streak-accumulation.test.ts`: 11 e2e tests — full message→processMessage→DB pipeline with time-controlled streaks (first post, noop, increment, reset, peak tracking, multi-user, idempotency, bot/non-music filtering).
- `e2e-tests/recovery/recovery-pipeline.test.ts`: 8 e2e tests — full recovery pipeline (single-page, paginated, resume from checkpoint, skip pre-claimed, mixed attachments, multi-user, recoverAllChannels, idempotency).
- `e2e-tests/scheduled/scheduled-work.test.ts`: 8 e2e tests — full scheduled work cycle (new post, skip unchanged hash, delete+repost on change, no-channels no-op, multi-channel, recovery-before-posting, remove-monitored-deletes-post, prune).
- `e2e-tests/interactions/slash-commands.test.ts`: 19 e2e tests — all 5 slash commands, ping, signature verification, and full admin setup workflow.
- `e2e-tests/tsconfig.json`: test compiler config matching `tests/` convention.

All 258 tests pass (19 test files: 14 unit + 5 e2e).

## [2026-04-08] ingest | Phase 12 — Slash Command Registration

Implemented:

- `src/scripts/register-commands.ts`: bulk-registers all 5 slash commands via `PUT /applications/{application_id}/commands`. Reads `DISCORD_BOT_TOKEN` and `DISCORD_APPLICATION_ID` from environment. Run via `bun run src/scripts/register-commands.ts`.

Deployment steps (12.2–12.9) are operational and performed manually.

## [2026-04-08] lint | Wiki audit and maintenance pass

Reviewed the wiki against the current source tree and test suites for completeness, accuracy, and organization.

Updated:

- `index.md` to restore the wiki-maintenance section, add the command-registration script page, fix unit-test links, and catalog the e2e documentation pages.
- `overview.md` to include `src/utils/clock.ts` and `src/utils/shutdown.ts` in the source map.

Added missing documentation pages:

- `register-commands.md`
- `tests-index.md`
- `tests-shutdown.md`
- `tests-unit.md`
- `e2e-clock.md`
- `e2e-streaks.md`
- `e2e-recovery.md`
- `e2e-scheduled.md`
- `e2e-interactions.md`
- `e2e-tests.md`

No source code or database schema changes were made during this pass; this was a documentation-only maintenance update.

## [2026-04-08] migrate | Database driver: better-sqlite3 → bun:sqlite (pure)

Migrated the database access layer from `better-sqlite3` to `bun:sqlite` (Bun's built-in SQLite driver). No schema changes. No `better-sqlite3` dependency remains.

Changes:
- `src/types.ts`: `Database` type now re-exported from `bun:sqlite` instead of `BetterSqlite3.Database`.
- `src/index.ts`: import changed from `better-sqlite3` to `bun:sqlite`; `db.pragma('foreign_keys = ON')` → `db.exec('PRAGMA foreign_keys = ON')`.
- All 11 test files (`tests/*.test.ts` + `e2e-tests/**/*.test.ts`): import changed to `bun:sqlite`; `db.pragma()` → `db.exec('PRAGMA ...')`.
- `src/db/queries.ts`: fixed `null` vs `undefined` — `bun:sqlite` `.get()` returns `null` for no-match (not `undefined`). Changed `as ... | undefined` → `as ... | null`, `!== undefined` → `!= null`.
- Test assertions: `.toBeUndefined()` → `.toBeNull()`, `.toBeDefined()` → `.not.toBeNull()` for `.get()` results.
- `package.json`: removed `better-sqlite3`, `@types/better-sqlite3`, and `postinstall` script entirely. Test scripts now use `bun --bun vitest run` for native `bun:sqlite` resolution.
- `vitest.config.ts`: removed `resolve.alias` — `bun --bun` resolves `bun:sqlite` natively.

All 304 tests pass (20 test files).

## [2026-04-13] refactor | Centralized Logger Utility & Vitest v4 Migration

Implemented centralized logging utility and migrated tests to Vitest v4 compatibility:

- `src/utils/logger.ts`: UTC timestamped logging functions (`log`, `error`, `warn`) with consistent format: `YYYY-MM-DD HH:MM:SS UTC [context] message`.
- `tests/logger.test.ts`: 6 tests for logger utility (timestamp format, message preservation, error/warn handling, multiple arguments, error objects).
- Replaced all `console.log/error/warn` calls throughout codebase with logger calls:
  - `src/utils/shutdown.ts`
  - `src/utils/db-helpers.ts`
  - `src/services/discord.ts`
  - `src/services/processor.ts`
  - `src/services/recovery.ts`
  - `src/scripts/register-commands.ts`
  - `src/handlers/scheduled.ts`
  - `src/handlers/interactions.ts`
  - `src/handlers/gateway.ts`
  - `src/index.ts`
- Updated all test files to spy on logger instead of console.
- Fixed Vitest v4 compatibility issues:
  - Replaced `vi.stubGlobal('fetch', ...)` with `global.fetch = vi.fn(...) as any` across all test files.
  - Removed deprecated timer mocking APIs; removed `setTimeout` mock from rate-limit tests.
  - Fixed syntax errors in `e2e-tests/scheduled/scheduled-work.test.ts` (leftover parentheses from vi.stubGlobal replacement).
  - Added `_resetRateLimit()` to `e2e-tests/recovery/recovery-pipeline.test.ts` to reduce state pollution.

Test results:
- `tests/`: 255 pass (unit tests)
- `e2e-tests/`: 55 pass (e2e tests)
- Note: State pollution issue remains when running both suites together (1 recovery test fails); run separately for now.

All 310 tests pass when run separately (21 test files).

## [2026-04-13] fix | Logger Test Date Mocking Issue

Fixed test failures in `tests/logger.test.ts` caused by mocking `globalThis.Date` with a non-constructor function, which triggered `TypeError: Reflect.construct requires the first argument be a constructor` when `new Date()` was called in the logger.

Changes:
- `src/utils/logger.ts`: Exported `_formatTimestamp` as a test helper function.
- `tests/logger.test.ts`: Removed `globalThis.Date` mocking from all tests except the timestamp format test, which now uses `logger._formatTimestamp` directly. Other tests verify timestamp format with regex instead of checking for fixed timestamps.

Test results:
- `tests/`: 255 pass (all unit tests)
- `e2e-tests/`: 55 pass (all e2e tests)
