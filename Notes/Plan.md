# Plan: Recovery + Leaderboard Display After `/addmonitoredchannel`

## Goal

When a user runs `/addmonitoredchannel`, after adding the channel to the `monitored_channels` table, the bot should:

1. Run a recovery pass for the newly added monitored channel (backfill historical messages).
2. Build and post/update the leaderboard in the leaderboard channel (same logic as `runScheduledWork`).

Currently `handleAddMonitoredChannel` is synchronous — it inserts the DB row and returns an ephemeral confirmation. It needs to become async, trigger recovery, then refresh the leaderboard post.

## Code Changes

### 1. `src/handlers/interactions.ts` — `handleAddMonitoredChannel`

- Change signature from `(interaction, db): Response` to `(interaction, db, token): Response`.
- After the successful `addMonitoredChannel` DB call:
  1. **Fire-and-forget**: kick off an async IIFE that:
     a. Calls `recoverChannel(db, token, monitoredChannelId)` to backfill messages.
     b. Builds and posts/updates the leaderboard (same logic as `runScheduledWork`):
        - Get all monitored channels for this leaderboard via `getMonitoredChannelsByLeaderboard`.
        - For each, call `getLeaderboard` to get rows.
        - Format with `formatLeaderboard` / `formatMultiChannelLeaderboard`.
        - Compute `hashContent`, compare with existing `getLeaderboardPost`.
        - If changed: delete old message (if any) via `deleteMessage`, post new via `sendMessage`, upsert `leaderboard_posts`.
     c. Logs errors but does not throw (fire-and-forget).
  2. **Immediately** return the ephemeral confirmation message (no awaiting recovery/leaderboard).
- Update the `case 'addmonitoredchannel'` in `routeInteraction` to pass `token`.

### 2. `src/handlers/interactions.ts` — imports

- Add imports for: `recoverChannel` from `services/recovery.js`, `hashContent` from `services/leaderboard.js`, `sendMessage`, `deleteMessage` from `services/discord.js`, `getLeaderboardPost`, `upsertLeaderboardPost`, `deleteLeaderboardPost` from `db/queries.js`.

### 3. Tests — `tests/interactions.test.ts`

- Existing `/addmonitoredchannel` tests need `global.fetch` mocked since `recoverChannel` calls `fetchMessagesAfter` (which uses `fetch`).
- New tests:
  - Recovery is called for the newly added monitored channel.
  - Leaderboard is posted to the leaderboard channel after recovery.
  - Leaderboard is not re-posted when content hash is unchanged.
  - Old leaderboard message is deleted before posting a new one.
  - Recovery failure doesn't prevent the add from succeeding (channel is still added, warning returned).
  - Ephemeral response confirms the channel was added.

### 4. No schema changes required.

### 5. Wiki updates

- Update `handler-interactions.md` to document the new async behavior of `/addmonitoredchannel`.
- Update `log.md` with the change.

## Tasks

- [x] **1. Plan tests** — design new and modified tests for the `/addmonitoredchannel` changes.
- [x] **2. Write failing tests** (Red) — add new tests to `tests/interactions.test.ts`.
- [x] **3. Implement changes** (Green) — update `handleAddMonitoredChannel` in `src/handlers/interactions.ts`.
- [x] **4. Run all tests** — confirm both `tests/` and `e2e-tests/` pass (366 tests, 21 files).
- [x] **5. Update wiki** — reflect changes in `handler-interactions.md`, `tests-interactions.md`, and `log.md`.

## Pitfalls

- **Discord interaction timeout**: Discord expects an interaction response within 3 seconds. Recovery + leaderboard posting may take longer for channels with large history. Consider whether to return the ephemeral response immediately and do recovery/leaderboard asynchronously (fire-and-forget), or accept the timeout risk for small channels.
  - The current `runScheduledWork` already does recovery + posting synchronously, so the pattern exists. For `/addmonitoredchannel`, a single channel recovery should be fast unless the channel has very long history.
  - If timeout is a concern, we could return the ephemeral message first and run recovery/leaderboard in a fire-and-forget pattern (matching `setupGatewayHandler`'s approach).
- **Rate limits**: `recoverChannel` pages through Discord API messages. The 1100ms delay in `discordFetch` means recovery of a channel with thousands of messages will take a while. This strengthens the case for fire-and-forget.
- **Existing test mocking**: Current tests for `/addmonitoredchannel` don't mock `fetch`. The handler becoming async and calling Discord APIs means tests must mock `fetch` to avoid real HTTP calls.

## Assumptions

- Recovery + leaderboard posting happen asynchronously (fire-and-forget) after returning the interaction response. This avoids Discord's 3-second interaction timeout.
- The ephemeral response confirms the add; recovery/leaderboard happen in the background.
- Errors in the fire-and-forget path are logged but do not affect the user-facing response.
- No database schema changes are needed.
