# Wiki Index

## Project Overview

- **[overview.md](overview.md)** — High-level architecture, runtime, data flow, and design decisions for the Discord Music Leaderboard Bot

## Configuration / Schema

- **[schema.md](schema.md)** — Database schema: all tables, columns, constraints, indexes, and UPSERT patterns
- **[constants.md](constants.md)** — All project constants (extensions, time thresholds, permissions, retry config)
- **[types.md](types.md)** — All shared TypeScript interfaces and types

## Utilities

- **[util-time.md](util-time.md)** — `parseDiscordTimestamp` and `computeStreakDelta` implementations and streak classification rules
- **[util-signature.md](util-signature.md)** — `verifyDiscordSignature` Ed25519 Discord webhook verification
- **[util-permissions.md](util-permissions.md)** — `hasAdministratorPermission` BigInt permission check
- **[util-db-helpers.md](util-db-helpers.md)** — `toResult` and `withRetry` DB access helpers

## Database

- **[db-queries.md](db-queries.md)** — All DB query functions in `db/queries.ts`: `getUserStats`, `upsertUserStats`, `getLeaderboard`, leaderboard channel CRUD, leaderboard post CRUD, recovery state, monitored channels, processed message idempotency

## Services

- **[service-tracker.md](service-tracker.md)** — `services/tracker.ts`: `computeNewStats`, `hasMusicAttachment`, `resolveUsername`

## Tests

- **[tests-time.md](tests-time.md)** — Tests for `utils/time.ts`
- **[tests-signature.md](tests-signature.md)** — Tests for `utils/signature.ts`
- **[tests-permissions.md](tests-permissions.md)** — Tests for `utils/permissions.ts`
- **[tests-db-helpers.md](tests-db-helpers.md)** — Tests for `utils/db-helpers.ts`
- **[tests-queries.md](tests-queries.md)** — Tests for `db/queries.ts` (37 tests)
- **[tests-tracker.md](tests-tracker.md)** — Tests for `services/tracker.ts` (25 tests)
