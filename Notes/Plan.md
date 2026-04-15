# Plan: Post/refresh leaderboard after recovery pass finishes

## Problem

When a recovery pass finishes, the leaderboard should be posted (if missing) or updated (if stale). Currently this only happens in the **hourly scheduled work** pipeline (`runScheduledWork`), which already runs recovery → leaderboard refresh → prune in sequence. However, the **startup recovery pass** in `src/index.ts` calls `recoverAllChannels` directly and does *not* refresh leaderboards afterward. This means:

- If the bot restarts and recovery backfills new messages, the leaderboard won't reflect them until the next hourly tick (up to 1 hour delay).
- If no leaderboard has ever been posted, it won't appear until the first hourly tick.

## Analysis

The leaderboard refresh logic already exists in `runScheduledWork` (lines 37–89 of `src/handlers/scheduled.ts`). Two options:

**Option A — Replace the startup `recoverAllChannels` call with `runScheduledWork`.** This is the simplest fix: `runScheduledWork` already runs recovery first, then refreshes leaderboards, then prunes. It's a direct drop-in replacement for the startup recovery call. The only behavioral addition is that it also prunes old processed messages at startup, which is benign.

**Option B — Extract the leaderboard refresh loop into a standalone function and call it after startup recovery.** More surgical, avoids the pruning side-effect at startup, but adds code and a new function surface.

**Recommendation:** Option A. It's minimal, uses existing tested code, and the pruning side-effect is harmless (even beneficial after a restart). The startup log messages will change slightly (`[scheduled] ...` instead of `[startup] recovery ...`), so we should adjust the startup logging.

## Tasks

- [x] **1. Extract or reuse leaderboard refresh logic:** In `src/index.ts`, replace the bare `recoverAllChannels(db, token)` call with `runScheduledWork(db, token)`. Update the surrounding log messages to reflect that this is a startup scheduled work pass.
- [x] **2. Plan unit tests:** Add/modify tests to cover the new startup behavior:
  - Unit test: confirm `runScheduledWork` posts a leaderboard when none exists after recovery finds new messages (already covered by existing test "runs recovery before leaderboard posting").
  - Unit test: confirm `runScheduledWork` deletes and re-posts when content has changed (already covered by existing test "deletes the previous leaderboard message when one exists before posting new").
  - E2E test: add a test that simulates the startup scenario — recovery backfills messages, then verifies the leaderboard is posted immediately (not deferred to the hourly tick).
- [x] **3. Implement the change** (Red/Green TDD per instructions).
- [x] **4. Run all tests** (`tests/` and `e2e-tests/`) and confirm they pass.
- [x] **5. Update wiki** to reflect the changed startup behavior.

## Pitfalls

- **Double recovery on first hourly tick:** After the change, recovery runs at startup (via `runScheduledWork`) and again ~1 hour later (via the hourly interval). This is already the current behavior since recovery is idempotent via checkpoints — no new messages will be processed on the second run.
- **Startup timing:** `runScheduledWork` is async and fire-and-forget at startup. If it fails, the error is already logged. No change in error handling posture.
- **Log clarity:** The startup recovery logs will now show `[scheduled]` prefixes instead of `[startup]`. We should add a `[startup]` log line before calling `runScheduledWork` so it's clear this is the startup pass.

## Assumptions

- The "recovery pass" in file `2-Actual-Work.md` refers to both the startup recovery and the hourly scheduled recovery. The hourly path already handles this correctly; the startup path is the gap.
- No database schema changes are needed.
- The existing content-hash deduplication in `runScheduledWork` is sufficient to determine "out of date" — if the formatted leaderboard content differs from the stored hash, it's out of date.
