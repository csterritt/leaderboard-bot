# Unit and Integration Test Documentation

This page groups the test documentation under `tests/`.

## Scope

The `tests/` directory covers:

- utility modules (`time`, `signature`, `permissions`, `db-helpers`, `shutdown`)
- database queries
- service-layer logic (`tracker`, `processor`, `leaderboard`, `discord`, `recovery`)
- handler-layer logic (`gateway`, `interactions`, `scheduled`)
- integration coverage for startup and gateway wiring in `index.test.ts`

## Structure

- Utility-focused pages: [tests-time.md](tests-time.md), [tests-signature.md](tests-signature.md), [tests-permissions.md](tests-permissions.md), [tests-db-helpers.md](tests-db-helpers.md), [tests-shutdown.md](tests-shutdown.md)
- Data and services: [tests-queries.md](tests-queries.md), [tests-tracker.md](tests-tracker.md), [tests-processor.md](tests-processor.md), [tests-leaderboard.md](tests-leaderboard.md), [tests-discord.md](tests-discord.md), [tests-recovery.md](tests-recovery.md)
- Handlers and entrypoint integration: [tests-gateway.md](tests-gateway.md), [tests-interactions.md](tests-interactions.md), [tests-scheduled.md](tests-scheduled.md), [tests-index.md](tests-index.md)

## Related pages

- [e2e-tests.md](e2e-tests.md) — overview of the `e2e-tests/` suite
- [overview.md](overview.md) — how the tested layers fit together
