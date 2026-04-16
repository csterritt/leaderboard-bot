# Plan: Many-to-Many Monitored/Leaderboard Channel Relationship

## Problem

The `monitored_channels` table enforces two constraints that limit the relationship to one-to-one:

1. `channel_id TEXT PRIMARY KEY` — a monitored channel can only appear in one row (linked to one leaderboard)
2. `leaderboard_channel_id TEXT NOT NULL UNIQUE` — a leaderboard channel can only link to one monitored channel

This causes a silent failure when:
- Leaderboard #a monitors channel #a (row inserted)
- Leaderboard #b tries to also monitor channel #a → `ON CONFLICT(channel_id) DO NOTHING` silently skips the insert
- `/leaderboard` in #b returns "No monitored channel is linked…"

The desired behavior is **many-to-many**: one leaderboard channel can monitor multiple monitored channels, and one monitored channel can feed multiple leaderboard channels.

## Schema Change

### `monitored_channels` table (before)

```sql
CREATE TABLE IF NOT EXISTS monitored_channels (
    channel_id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    leaderboard_channel_id TEXT NOT NULL UNIQUE
        REFERENCES leaderboard_channels(channel_id) ON DELETE CASCADE,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### `monitored_channels` table (after)

```sql
CREATE TABLE IF NOT EXISTS monitored_channels (
    channel_id TEXT NOT NULL,
    guild_id TEXT NOT NULL,
    leaderboard_channel_id TEXT NOT NULL
        REFERENCES leaderboard_channels(channel_id) ON DELETE CASCADE,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (channel_id, leaderboard_channel_id)
);
```

Key changes:
- PK becomes composite `(channel_id, leaderboard_channel_id)` — allows the same monitored channel to appear in multiple rows (one per leaderboard)
- UNIQUE constraint on `leaderboard_channel_id` is **removed** — allows a leaderboard to link to multiple monitored channels

## Migration

SQLite does not support `ALTER TABLE ... DROP CONSTRAINT` or `ALTER TABLE ... ALTER COLUMN`. The migration must:

1. Create the new table under a temporary name
2. Copy existing rows
3. Drop the old table
4. Rename the new table

This should be done in a transaction in `src/index.ts` at startup, after the schema is initialized but before normal operation.

## Code Changes

### 1. `src/db/schema.sql`

Update the `monitored_channels` DDL as shown above.

### 2. `src/db/queries.ts`

- **`addMonitoredChannel`**: Change conflict clause from `ON CONFLICT(channel_id) DO NOTHING` to `ON CONFLICT(channel_id, leaderboard_channel_id) DO NOTHING`.
- **`deleteMonitoredChannel`**: Change signature to accept both `channelId` and `leaderboardChannelId`. Update SQL to `DELETE FROM monitored_channels WHERE channel_id = ? AND leaderboard_channel_id = ?`.
- **`getMonitoredChannelByLeaderboard`** → rename to **`getMonitoredChannelsByLeaderboard`** (plural): Return `MonitoredChannel[]` instead of `MonitoredChannel | null`. Change SQL to return all rows for the leaderboard channel.
- **`getLeaderboard`**: No signature change needed. It already accepts a single `channelId`. Callers will invoke it once per linked monitored channel.

### 3. `src/handlers/interactions.ts`

- **`/addmonitoredchannel`**: Remove the guard that rejects adding a monitored channel when the leaderboard already has a different one linked. The command should now allow adding multiple monitored channels to a single leaderboard.
- **`/removemonitoredchannel`**: Must be run from a leaderboard channel (add validation). Pass both `monitoredChannelId` and `leaderboardChannelId` (the current channel) to `deleteMonitoredChannel`, so only the specific link is removed — not all links for that monitored channel across every leaderboard.
- **`/leaderboard`**: Update to call `getMonitoredChannelsByLeaderboard` (plural). If the result is an empty array, show the "no monitored channel linked" message. Otherwise, for each linked monitored channel, call `getLeaderboard` and `formatLeaderboard` individually, then concatenate all sections into one response. Each section names its monitored channel.

### 4. `src/handlers/scheduled.ts`

- **`runScheduledWork`**: For each leaderboard channel, call `getMonitoredChannelsByLeaderboard` (plural). If empty, handle the orphan-post case as before. Otherwise, for each linked monitored channel, call `getLeaderboard` and `formatLeaderboard` individually, then concatenate all sections into one message for posting.

### 5. `src/types.ts`

- No changes to `MonitoredChannel` type itself. Update any function signatures that change (e.g., `deleteMonitoredChannel` params).

### 6. `src/services/leaderboard.ts`

- `formatLeaderboard` already accepts a channel name and rows. No merge function needed — each monitored channel gets its own call to `formatLeaderboard`.
- Add a `formatMultiChannelLeaderboard(sections: { channelName: string, rows: LeaderboardRow[] }[])` helper (or have callers concatenate `formatLeaderboard` outputs) to combine multiple sections into one message.

## Tasks

- [ ] **1. Write migration** in `src/index.ts` to convert existing `monitored_channels` to the new schema at startup.
- [ ] **2. Update `src/db/schema.sql`** with the new DDL.
- [ ] **3. Update `src/db/queries.ts`** — `addMonitoredChannel`, `deleteMonitoredChannel`, `getMonitoredChannelsByLeaderboard`.
- [ ] **4. Update `src/services/leaderboard.ts`** — add multi-section formatting (concatenate individual `formatLeaderboard` outputs).
- [ ] **5. Update `src/handlers/interactions.ts`** — `/addmonitoredchannel`, `/removemonitoredchannel`, `/leaderboard`.
- [ ] **6. Update `src/handlers/scheduled.ts`** — `runScheduledWork` leaderboard refresh loop.
- [ ] **7. Write/update unit tests** (`tests/`) for all changed functions.
- [ ] **8. Write/update e2e tests** (`e2e-tests/`) for multi-channel scenarios.
- [ ] **9. Run all tests** and confirm they pass.
- [ ] **10. Update wiki** to reflect the new schema and behavior.

## Pitfalls

- **Migration safety**: The migration must be idempotent — if the new schema already exists (PK is composite), skip the migration. Check by inspecting `PRAGMA table_info(monitored_channels)` or catching the conflict.
- **Multi-section output**: When a leaderboard channel monitors multiple channels, the posted message contains one section per monitored channel. Each section names its channel and shows stats from that channel only — no cross-channel merging. Discord message length limits (2000 chars) may become a concern with many monitored channels; consider truncation or splitting if needed.
- **`/removemonitoredchannel` scope change**: Currently removes a monitored channel globally. After the fix, it only removes the link from the current leaderboard channel. Users may need to run the command from each leaderboard channel to fully unlink a monitored channel. This is the correct behavior — each leaderboard manages its own monitoring links independently.
- **Recovery**: `recoverAllChannels` iterates `getMonitoredChannels()` which returns all rows. With multiple rows per monitored channel, recovery must deduplicate so it doesn't recover the same channel multiple times. The simplest fix: collect unique `channelId` values before iterating.
- **`isMonitoredChannel`**: Still queries `WHERE channel_id = ?`, which works correctly with the composite PK (returns true if any row matches).

## Assumptions

- The underlying `user_stats` table and its per-channel scoping remain unchanged.
- Stats are never merged across channels, even for display. Each monitored channel gets its own leaderboard section.
- Existing data is preserved through the migration — all current links remain intact.
