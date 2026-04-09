# Database Schema

**File**: `src/db/schema.sql`

`PRAGMA foreign_keys = ON` is set at schema level and must also be enabled on each connection at runtime.

## Tables

### `user_stats`

Tracks per-user streak data scoped to a channel.

| Column               | Type     | Notes                                         |
| -------------------- | -------- | --------------------------------------------- |
| `channel_id`         | TEXT     | PK component                                  |
| `user_id`            | TEXT     | PK component                                  |
| `username`           | TEXT     | Display name at time of last post             |
| `last_music_post_at` | INTEGER  | Unix seconds; nullable                        |
| `run_count`          | INTEGER  | Current streak length; default 0              |
| `highest_run_seen`   | INTEGER  | Best streak ever seen; default 0              |
| `updated_at`         | DATETIME | Set on insert, refreshed on update via UPSERT |

Primary key: `(channel_id, user_id)`

### `leaderboard_channels`

Channels designated as leaderboard display channels.

| Column             | Type     | Notes                                 |
| ------------------ | -------- | ------------------------------------- |
| `channel_id`       | TEXT     | PK                                    |
| `guild_id`         | TEXT     |                                       |
| `channel_name`     | TEXT     | Refreshed by `/setleaderboardchannel` |
| `added_by_user_id` | TEXT     |                                       |
| `added_at`         | DATETIME |                                       |
| `updated_at`       | DATETIME |                                       |

### `leaderboard_posts`

Tracks the most recently posted leaderboard message per channel.

| Column         | Type     | Notes                            |
| -------------- | -------- | -------------------------------- |
| `channel_id`   | TEXT     | PK                               |
| `message_id`   | TEXT     |                                  |
| `content_hash` | TEXT     | FNV-1a hash for change detection |
| `posted_at`    | DATETIME |                                  |

### `recovery_state`

Checkpoint for the recovery/backfill service.

| Column                      | Type     | Notes                                       |
| --------------------------- | -------- | ------------------------------------------- |
| `channel_id`                | TEXT     | PK                                          |
| `last_processed_message_id` | TEXT     | Nullable; `null` means start from beginning |
| `updated_at`                | DATETIME |                                             |

### `monitored_channels`

Channels monitored for music uploads. Each leaderboard channel may have at most one linked monitored channel (enforced by `UNIQUE` on `leaderboard_channel_id`).

| Column                   | Type     | Notes                                                            |
| ------------------------ | -------- | ---------------------------------------------------------------- |
| `channel_id`             | TEXT     | PK                                                               |
| `guild_id`               | TEXT     |                                                                  |
| `leaderboard_channel_id` | TEXT     | UNIQUE FK → `leaderboard_channels(channel_id)` ON DELETE CASCADE |
| `added_at`               | DATETIME |                                                                  |

### `processed_messages`

Idempotency log for processed message IDs.

| Column         | Type     | Notes |
| -------------- | -------- | ----- |
| `message_id`   | TEXT     | PK    |
| `channel_id`   | TEXT     |       |
| `processed_at` | DATETIME |       |

Index: `idx_processed_messages_processed_at` on `processed_at` (for prune hot path).

## UPSERT Pattern

All upserts use `INSERT ... ON CONFLICT ... DO UPDATE` (not `INSERT OR REPLACE`). `updated_at` is set explicitly in the `DO UPDATE` clause where applicable.

## Cross-references

- [overview.md](overview.md)
- [util-db-helpers.md](util-db-helpers.md)
