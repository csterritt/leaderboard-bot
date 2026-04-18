# db/queries.ts

All exported database operations for the leaderboard bot. Every function follows the `fn` / `fnActual` pattern: the public export wraps a private `*Actual` function in `withRetry`; the `*Actual` function uses `toResult` to normalise exceptions. All return types are `Result<T, Error>` (synchronous, bun:sqlite).

## getUserStats / upsertUserStats

- `getUserStats(db, channelId, userId): Result<UserStats | null, Error>` — fetches a row from `user_stats` by `(channel_id, user_id)`.
- `upsertUserStats(db, stats): Result<void, Error>` — inserts or updates with explicit `ON CONFLICT(channel_id, user_id) DO UPDATE`, setting `updated_at = CURRENT_TIMESTAMP` in the `DO UPDATE` clause.

## getLeaderboard

- `getLeaderboard(db, channelId): Result<LeaderboardRow[], Error>` — returns up to `LEADERBOARD_MAX_ROWS` (50) rows sorted `run_count DESC, highest_run_seen DESC`. Excludes rows where both `run_count = 0` and `highest_run_seen = 0`.

## Leaderboard Channel CRUD

- `getLeaderboardChannels(db)` — all rows from `leaderboard_channels`.
- `upsertLeaderboardChannel(db, channel)` — insert or update `channel_name` and `updated_at` on conflict.
- `deleteLeaderboardChannel(db, channelId)` — removes the row (cascade deletes linked `monitored_channels` row via FK).
- `getLeaderboardChannel(db, channelId)` — single row or `null`.

## Leaderboard Post CRUD

- `getLeaderboardPost(db, channelId)` — stored post for a leaderboard channel, or `null`.
- `upsertLeaderboardPost(db, post)` — insert or overwrite `message_id`, `content_hash`, and `posted_at`.
- `deleteLeaderboardPost(db, channelId)` — removes the row.

## Recovery State

- `getRecoveryState(db, channelId)` — last-checkpoint row or `null`.
- `upsertRecoveryState(db, state)` — insert or update `last_processed_message_id` and `updated_at`.

## Monitored Channels

- `getMonitoredChannels(db)` — all rows.
- `addMonitoredChannel(db, channel)` — insert with `ON CONFLICT(channel_id, leaderboard_channel_id) DO NOTHING` (idempotent for the same pair). Multiple monitored channels may be linked to the same leaderboard channel (many-to-many).
- `deleteMonitoredChannel(db, channelId, leaderboardChannelId)` — removes the specific `(channel_id, leaderboard_channel_id)` row. Other links for the same monitored or leaderboard channel are preserved.
- `isMonitoredChannel(db, channelId)` — `boolean` existence check (true if any row for this channel_id exists).
- `getMonitoredChannelsByLeaderboard(db, leaderboardChannelId)` — all monitored channels linked to a leaderboard channel (returns `MonitoredChannel[]`, empty array if none).

## Inactivity Reset

- `resetInactiveStreaks(db, nowUnixSecs): Result<void, Error>` — sets `run_count = 0` (and refreshes `updated_at`) for all `user_stats` rows where `last_music_post_at` is non-null, more than 36 hours before `nowUnixSecs`, and `run_count > 0`. Does not modify `highest_run_seen`. Uses the hardcoded threshold `129_600` (36 hours in seconds).

## Processed Messages (Idempotency)

- `claimProcessedMessage(db, { messageId, channelId })` — inserts with `ON CONFLICT DO NOTHING`; returns `true` if the row was inserted (first claim), `false` if already existed.
- `hasProcessedMessage(db, messageId)` — existence check.
- `pruneProcessedMessages(db, thresholdDays)` — deletes rows older than `thresholdDays` days using `datetime('now', '-N days')`.

## Related pages

- [schema.md](schema.md) — table definitions
- [util-db-helpers.md](util-db-helpers.md) — `toResult`, `withRetry`
- [types.md](types.md) — `UserStats`, `LeaderboardRow`, etc.
- [tests-queries.md](tests-queries.md) — test coverage
