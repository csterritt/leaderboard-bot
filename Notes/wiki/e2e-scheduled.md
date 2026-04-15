# e2e-tests/scheduled/scheduled-work.test.ts

Exercises the full scheduled-work pipeline: recovery, leaderboard rendering/posting, stale-post cleanup, and processed-message pruning.

## Coverage

- Posts a new leaderboard when no previous post exists.
- Skips posting when the computed content hash is unchanged.
- Deletes the previous post and re-posts when leaderboard content changes.
- Does nothing when no leaderboard channels are configured.
- Processes multiple leaderboard channels independently.
- Runs recovery before posting so newly recovered messages affect the leaderboard.
- Removes a stored leaderboard post when its leaderboard channel no longer has a monitored-channel link.
- Prunes old `processed_messages` rows during the scheduled run.
- **Startup scenario**: recovery backfills messages in a single `runScheduledWork` pass and the leaderboard is posted immediately (not deferred to the next hourly tick).

## Test approach

- Uses an in-memory database with real schema and seeded channels.
- Stubs Discord API calls for message fetch, post, and delete operations.
- Uses `createClock()` where deterministic timestamps help seed test data.
- Verifies both outbound side effects and stored `leaderboard_posts` rows.

## Cross-references

- [handler-scheduled.md](handler-scheduled.md) — implementation
- [service-recovery.md](service-recovery.md) — recovery phase within scheduled work
- [service-leaderboard.md](service-leaderboard.md) — formatting and hashing
- [e2e-tests.md](e2e-tests.md) — e2e suite overview
