# tests-recovery.md

**Test file:** `tests/recovery.test.ts`  
**Tests:** 11

## `recoverChannel` (9 tests)

- Begins from `after=0` when no prior recovery state exists.
- Begins from `last_processed_message_id` when a prior state exists.
- Sorts each fetched batch from oldest to newest before processing.
- Skips already-processed message IDs safely (idempotent).
- Advances `recovery_state` with the highest successfully processed message ID.
- Does not advance the checkpoint beyond a failed message (returns `Result.err`, no state row created).
- Loops through multiple pages until an empty page is returned.
- Uses the last processed message ID as the cursor for the next page fetch.
- Returns `Result.err` when `fetchMessagesAfter` fails.

## `recoverAllChannels` (2 tests)

- Calls recovery for each monitored channel (verified via captured fetch URLs).
- Succeeds when there are no monitored channels.

## Test approach

- Uses `vi.stubGlobal('fetch', ...)` to mock the Discord API.
- In-memory bun:sqlite database per test.
- Counts fetch call invocations to verify pagination loops.
