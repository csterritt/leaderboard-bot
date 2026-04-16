# handlers/scheduled.ts

**Source:** `src/handlers/scheduled.ts`

## Purpose

Performs all periodic (hourly) work: recovery of missed messages, leaderboard refresh, and pruning of old processed-message records.

## Functions

### `runScheduledWork(db, token): Promise<Result<void, Error>>`

Orchestrates the scheduled work pipeline in order:

1. **No-op guard** — fetches all `leaderboard_channels`; returns immediately if none are configured.
2. **Recovery** — calls `recoverAllChannels(db, token)` to backfill any missed gateway messages.
3. **Leaderboard refresh** — for each leaderboard channel:
   - Looks up all linked monitored channels via `getMonitoredChannelsByLeaderboard`.
   - If no linked monitored channels exist: deletes any stale leaderboard post (message + DB row) and continues.
   - Fetches leaderboard rows for each linked monitored channel via `getLeaderboard`.
   - **Single channel**: formats with `formatLeaderboard(lc.channelName, rows)`.
   - **Multiple channels**: formats with `formatMultiChannelLeaderboard(sections)` — concatenates per-channel sections.
   - Computes FNV-1a hash via `hashContent(content)`.
   - **Skips posting** if `content_hash` in `leaderboard_posts` matches the new hash.
   - **Deletes the previous message** via `deleteMessage` (404 is tolerated as success).
   - Posts the new leaderboard via `sendMessage`.
   - Upserts `leaderboard_posts(channel_id, message_id, content_hash)`.
4. **Pruning** — calls `pruneProcessedMessages(db, PRUNE_THRESHOLD_DAYS)` (14 days) after all posting is done.

**Logging:**

- `[scheduled] starting scheduled work` — on entry.
- `[scheduled] no leaderboard channels configured, skipping` — when no channels.
- `[scheduled] found N leaderboard channel(s)` — channel count.
- `[scheduled] processing leaderboard channel: <id> (<name>)` — per channel.
- `[scheduled] removing orphaned leaderboard post for channel: <id>` — when no linked monitored channel.
- `[scheduled] channel <id> has no linked monitored channel, skipping` — when no linked channel and no existing post.
- `[scheduled] leaderboard unchanged for channel: <id>` — content hash match.
- `[scheduled] deleting stale leaderboard message for channel: <id>` — before posting new.
- `[scheduled] leaderboard post updated for channel: <id>` — after successful post.
- `[scheduled] pruned processed messages` — after pruning.
- `[scheduled] scheduled work complete` — on exit.

## Key Design Rules

- Recovery always runs **before** any leaderboard posting.
- Pruning always runs **after** leaderboard posting.
- Each leaderboard channel is processed independently — no row merging across channels.
- Orphaned leaderboard channels (no linked monitored channel) have their stored post cleaned up.
- Content-hash deduplication prevents redundant delete+post cycles when nothing has changed.

## Cross-references

- Uses [`service-recovery.md`](service-recovery.md) — `recoverAllChannels`
- Uses [`service-leaderboard.md`](service-leaderboard.md) — `formatLeaderboard`, `formatMultiChannelLeaderboard`, `hashContent`
- Uses [`service-discord.md`](service-discord.md) — `sendMessage`, `deleteMessage`
- Uses [`db-queries.md`](db-queries.md) — `getLeaderboardChannels`, `getMonitoredChannelsByLeaderboard`, `getLeaderboard`, `getLeaderboardPost`, `upsertLeaderboardPost`, `deleteLeaderboardPost`, `pruneProcessedMessages`
- Uses [`constants.md`](constants.md) — `PRUNE_THRESHOLD_DAYS` (14)
- Tests: [`tests-scheduled.md`](tests-scheduled.md)
