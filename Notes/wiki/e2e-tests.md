# End-to-End Test Documentation

This page groups the higher-level tests under `e2e-tests/`.

## Scope

The `e2e-tests/` directory validates that the main subsystems work together against real query logic and schema setup, while external boundaries such as Discord HTTP calls are stubbed.

## Covered flows

- [e2e-clock.md](e2e-clock.md) — the controllable clock helper used by time-sensitive scenarios
- [e2e-streaks.md](e2e-streaks.md) — message processing to persisted streak state
- [e2e-recovery.md](e2e-recovery.md) — Discord history backfill and checkpointing
- [e2e-scheduled.md](e2e-scheduled.md) — scheduled recovery, posting, cleanup, and pruning
- [e2e-interactions.md](e2e-interactions.md) — slash command HTTP handling and admin workflow

## Test characteristics

- Real in-memory SQLite schema per test suite
- Real source modules under test rather than mocked business logic
- Stubbed network boundaries for Discord API calls
- Focus on end-to-end behavior, persisted state, and orchestration order

## Related pages

- [tests-unit.md](tests-unit.md) — unit and integration coverage in `tests/`
- [overview.md](overview.md) — architectural context for the end-to-end flows
