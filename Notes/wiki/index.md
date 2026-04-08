# Wiki Index

## Project Overview

- **[overview.md](overview.md)** — High-level architecture, runtime, data flow, and design decisions for the Discord Music Leaderboard Bot

## Configuration / Schema

- **[schema.md](schema.md)** — Database schema: all tables, columns, constraints, indexes, and UPSERT patterns
- **[constants.md](constants.md)** — All project constants (extensions, time thresholds, permissions, retry config)
- **[types.md](types.md)** — All shared TypeScript interfaces and types

## Utilities

- **[util-time.md](util-time.md)** — `parseDiscordTimestamp` and `computeStreakDelta` implementations and streak classification rules
- **[util-clock.md](util-clock.md)** — `createClock` mockable clock facility: `now()`, `set()`, `advance()`, `hasPassed()`, `reset()`
- **[util-signature.md](util-signature.md)** — `verifyDiscordSignature` Ed25519 Discord webhook verification
- **[util-permissions.md](util-permissions.md)** — `hasAdministratorPermission` BigInt permission check
- **[util-db-helpers.md](util-db-helpers.md)** — `toResult` and `withRetry` DB access helpers
- **[util-shutdown.md](util-shutdown.md)** — `createShutdown` idempotent graceful shutdown for SIGTERM/SIGINT

## Database

- **[db-queries.md](db-queries.md)** — All DB query functions in `db/queries.ts`: `getUserStats`, `upsertUserStats`, `getLeaderboard`, leaderboard channel CRUD, leaderboard post CRUD, recovery state, monitored channels, processed message idempotency

## Services

- **[service-tracker.md](service-tracker.md)** — `services/tracker.ts`: `computeNewStats`, `hasMusicAttachment`, `resolveUsername`
- **[service-processor.md](service-processor.md)** — `services/processor.ts`: `normalizeDiscordMessage`, `normalizeGatewayMessage`, `processMessage`
- **[service-leaderboard.md](service-leaderboard.md)** — `services/leaderboard.ts`: `formatLeaderboard`, `hashContent` (FNV-1a)
- **[service-discord.md](service-discord.md)** — `services/discord.ts`: `sendMessage`, `deleteMessage`, `fetchMessagesAfter`, `fetchChannel`, rate-limit strategy
- **[service-recovery.md](service-recovery.md)** — `services/recovery.ts`: `recoverChannel`, `recoverAllChannels`, pagination loop, checkpoint advancement

## Handlers

- **[handler-gateway.md](handler-gateway.md)** — `handlers/gateway.ts`: `setupGatewayHandler`, discord.js `messageCreate` listener, fire-and-forget error handling
- **[handler-interactions.md](handler-interactions.md)** — `handlers/interactions.ts`: Ed25519 verification, ping handler, all 5 slash commands, interaction router
- **[handler-scheduled.md](handler-scheduled.md)** — `handlers/scheduled.ts`: `runScheduledWork`, recovery → leaderboard refresh → prune pipeline

## Entry Point

- **[entry-point.md](entry-point.md)** — `src/index.ts`: startup sequence, DB init, gateway + HTTP wiring, recovery pass, hourly interval, login

## Tests

- **[tests-time.md](tests-time.md)** — Tests for `utils/time.ts`
- **[tests-signature.md](tests-signature.md)** — Tests for `utils/signature.ts`
- **[tests-permissions.md](tests-permissions.md)** — Tests for `utils/permissions.ts`
- **[tests-db-helpers.md](tests-db-helpers.md)** — Tests for `utils/db-helpers.ts`
- **[tests-queries.md](tests-queries.md)** — Tests for `db/queries.ts` (37 tests)
- **[tests-tracker.md](tests-tracker.md)** — Tests for `services/tracker.ts` (25 tests)
- **[tests-processor.md](tests-processor.md)** — Tests for `services/processor.ts` (17 tests)
- **[tests-leaderboard.md](tests-leaderboard.md)** — Tests for `services/leaderboard.ts` (11 tests)
- **[tests-discord.md](tests-discord.md)** — Tests for `services/discord.ts` (16 tests)
- **[tests-recovery.md](tests-recovery.md)** — Tests for `services/recovery.ts` (11 tests)
- **[tests-gateway.md](tests-gateway.md)** — Tests for `handlers/gateway.ts` (5 tests)
- **[tests-interactions.md](tests-interactions.md)** — Tests for `handlers/interactions.ts` (38 tests)
- **[tests-scheduled.md](tests-scheduled.md)** — Tests for `handlers/scheduled.ts` (11 tests)
- **[util-shutdown.md](util-shutdown.md)** — Tests for `utils/shutdown.ts` (8 tests)
- **[entry-point.md](entry-point.md)** — Integration tests for `src/index.ts` (2 tests)

## E2E Tests

- **[e2e-clock.md](e2e-clock.md)** — `e2e-tests/utils/clock.test.ts`: 9 tests for the clock facility
- **[e2e-streaks.md](e2e-streaks.md)** — `e2e-tests/streaks/streak-accumulation.test.ts`: 11 e2e tests for streak accumulation pipeline
- **[e2e-recovery.md](e2e-recovery.md)** — `e2e-tests/recovery/recovery-pipeline.test.ts`: 8 e2e tests for the recovery pipeline
- **[e2e-scheduled.md](e2e-scheduled.md)** — `e2e-tests/scheduled/scheduled-work.test.ts`: 8 e2e tests for the scheduled work cycle
- **[e2e-interactions.md](e2e-interactions.md)** — `e2e-tests/interactions/slash-commands.test.ts`: 19 e2e tests for slash command interactions
