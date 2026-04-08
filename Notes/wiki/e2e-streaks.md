# e2e-tests/streaks/streak-accumulation.test.ts

Exercises the full message-processing pipeline from normalized message input through `processMessage` into persisted `user_stats` rows.

## Coverage

- First valid music post creates a streak with `runCount = 1` and `highestRunSeen = 1`.
- Posts within 8 hours are treated as `noop`.
- Posts between 8 and 36 hours increment the streak.
- Posts after 36 hours reset the streak while preserving `highestRunSeen`.
- Peak streak tracking survives later resets.
- Multiple users are tracked independently inside the same monitored channel.
- Duplicate message IDs are idempotent and do not double-count.
- Bot-authored messages are ignored.
- Non-music attachments are ignored.
- Messages from non-monitored channels are ignored.
- The shared clock helper advances as expected for time-based scenarios.

## Test approach

- Uses an in-memory database with real schema and real query functions.
- Seeds leaderboard and monitored channel rows before each test.
- Uses `createClock()` to produce deterministic timestamps.
- Calls `processMessage` directly with real `NormalizedMessage` values.

## Cross-references

- [service-processor.md](service-processor.md) — main pipeline under test
- [service-tracker.md](service-tracker.md) — streak logic exercised through the pipeline
- [util-clock.md](util-clock.md) — time control helper
- [e2e-tests.md](e2e-tests.md) — e2e suite overview
