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
