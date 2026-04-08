# tests-interactions.md

**Test file:** `tests/interactions.test.ts`  
**Tests:** 38

## Signature verification (2 tests)

- Returns `401` when signature headers are missing.
- Returns `401` when signature is invalid.

## Ping (1 test)

- Returns `{ type: 1 }` for `type = 1` (ping).

## `/leaderboard` (9 tests)

- Uses current `channel_id` when no channel option is provided.
- Uses the provided channel option when given.
- Returns an error message when the target channel is not a leaderboard channel.
- Calls `fetchChannel` for a different channel option.
- Returns ephemeral response (flags = 64).
- Returns a helpful message when the leaderboard channel has no linked monitored channel.
- Returns a no-data message when the linked monitored channel has no stats.
- Returns an error when `fetchChannel` fails for a provided channel option.
- Queries only the linked monitored channel (no cross-channel merging).

## `/setleaderboardchannel` (5 tests)

- Rejects interactions with no member.
- Rejects interactions outside a guild context (no `guild_id`).
- Rejects a user without ADMINISTRATOR permission.
- Accepts a user with ADMINISTRATOR permission and upserts the channel.
- Refreshes `channel_name` when run again for the same channel.
- Does not add the channel to `monitored_channels`.

## `/removeleaderboardchannel` (7 tests)

- Rejects interactions with no member.
- Rejects interactions outside a guild context.
- Rejects a user without ADMINISTRATOR permission.
- Removes the current channel from `leaderboard_channels`.
- Removes all `monitored_channels` rows referencing this leaderboard channel (via FK cascade).
- Deletes the stored `leaderboard_posts` row for the channel.
- Does not delete historical `user_stats` rows.

## `/addmonitoredchannel` (7 tests)

- Rejects interactions with no member.
- Rejects interactions outside guild context.
- Rejects a user without ADMINISTRATOR permission.
- Rejects if the current channel is not a leaderboard channel.
- Adds the provided channel to `monitored_channels` linked to the current leaderboard channel.
- Is idempotent — adding the same channel again does not error.
- Rejects linking a different monitored channel when this leaderboard channel already has one.

## `/removemonitoredchannel` (5 tests)

- Rejects interactions with no member.
- Rejects interactions outside guild context.
- Rejects a user without ADMINISTRATOR permission.
- Removes the provided channel from `monitored_channels`.
- Does not delete historical `user_stats` rows.

## Interaction router (1 test)

- Returns `400` for unknown command names.

## Test approach

- Uses `handleInteractionWithVerifier` with an always-true injected verifier to bypass Ed25519 verification.
- `vi.stubGlobal('fetch', ...)` for tests requiring `fetchChannel` mock.
- In-memory better-sqlite3 database per test.
