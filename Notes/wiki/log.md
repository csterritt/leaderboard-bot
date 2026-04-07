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
