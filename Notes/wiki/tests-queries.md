# tests/queries.test.ts

Tests for `src/db/queries.ts`. Each test suite creates a fresh in-memory bun:sqlite database and applies `schema.sql` before each test via `makeDb()`.

## Coverage

- **getUserStats**: null for unknown user; correct `UserStats` for known user.
- **upsertUserStats**: insert (new row); update (UPSERT semantics); `updated_at` set on insert and refreshed on update.
- **getLeaderboard**: empty array for no data; sorted `run_count DESC, highest_run_seen DESC`, max 50 rows; excludes all-zero rows.
- **getLeaderboardChannels / upsertLeaderboardChannel / deleteLeaderboardChannel / getLeaderboardChannel**: empty initially; insert; update `channel_name` on conflict; delete; null for unknown; row for known.
- **getLeaderboardPost / upsertLeaderboardPost / deleteLeaderboardPost**: null for no post; overwrite on re-upsert; content hash persisted; delete.
- **getRecoveryState / upsertRecoveryState**: null for unknown; round-trip `last_processed_message_id`; `updated_at` set on insert and refreshed.
- **getMonitoredChannels / addMonitoredChannel / deleteMonitoredChannel / isMonitoredChannel / getMonitoredChannelByLeaderboard**: empty initially; insert; idempotent re-add; reject second monitored channel for same leaderboard; delete; boolean check; null / row lookups.
- **claimProcessedMessage / hasProcessedMessage / pruneProcessedMessages**: first claim succeeds (`true`); second claim is no-op (`false`); `hasProcessedMessage` true after claim; prune deletes old rows; prune preserves new rows.
- **resetInactiveStreaks**: zeros `run_count` for rows older than 36 h; preserves rows within 36 h; skips rows already at 0; preserves `highest_run_seen`; skips null `last_music_post_at`; preserves rows at exactly the 36 h boundary.

**44 tests, all passing.**

## Related pages

- [db-queries.md](db-queries.md)
- [schema.md](schema.md)
