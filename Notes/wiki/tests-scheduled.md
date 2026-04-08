# Tests for handlers/scheduled.ts

**Test file:** `tests/scheduled.test.ts` (11 tests)

## Coverage

- Does nothing (no fetch calls) when there are no configured leaderboard channels
- Runs recovery before leaderboard posting (verified via call order)
- Processes each leaderboard channel independently (2 separate channels each receive a post)
- Formats leaderboard using the stored `channel_name` from the leaderboard channel record
- Does not merge rows across different monitored channels
- Removes stored leaderboard post (message + DB row) when a leaderboard channel has no linked monitored channel
- Skips posting when the content hash is unchanged (second run produces no POST)
- Deletes the previous leaderboard message before posting a new one (verified via call order)
- Continues gracefully when message deletion returns 404
- Posts a new leaderboard and upserts `leaderboard_posts` with correct `message_id` and `content_hash`
- Prunes `processed_messages` rows older than 14 days after leaderboard posting

## Related pages

- [`handler-scheduled.md`](handler-scheduled.md) — implementation
