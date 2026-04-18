# Implementation Plan

## Change 1: Enable WAL Journal Mode

- [x] In `src/index.ts`, add `db.exec('PRAGMA journal_mode = WAL')` immediately after opening the database, before `PRAGMA foreign_keys = ON`.
- [x] Add a unit test in `tests/` verifying the database is in WAL mode after initialization.

## Change 2: Hourly Inactivity Reset

### New DB query: `resetInactiveStreaks`

- [x] In `src/db/queries.ts`, add a new exported function `resetInactiveStreaks(db, nowUnixSecs)` that executes:
  ```sql
  UPDATE user_stats
  SET run_count = 0, updated_at = CURRENT_TIMESTAMP
  WHERE last_music_post_at IS NOT NULL
    AND last_music_post_at <= ? - 129600
    AND run_count > 0
  ```
  The second parameter is `nowUnixSecs - THIRTY_SIX_HOURS_SECS` (i.e., `nowUnixSecs - 129600`).
  `highest_run_seen` is intentionally left unchanged.
  Follows the existing `withRetry` / `toResult` / `Result<void, Error>` pattern.

### Wire into scheduled work

- [x] In `src/handlers/scheduled.ts`, import `resetInactiveStreaks`.
- [x] `runScheduledWork` gains an optional `nowUnixSecs` parameter (defaulting to `Date.now()`) for testability.
- [x] Call `resetInactiveStreaks(db, now)` **after** recovery and **before** the leaderboard refresh loop.
- [x] Log `[scheduled] resetting inactive streaks` before the call.

### Update entry point

- [x] In `src/index.ts`, WAL pragma added. No clock instance needed — `runScheduledWork` defaults to `Date.now()` at runtime.

### Tests

- [x] **Unit tests** (`tests/`):
  - `resetInactiveStreaks` correctly zeros `run_count` for rows older than 36 h.
  - `resetInactiveStreaks` does not touch rows within 36 h.
  - `resetInactiveStreaks` does not touch rows with `run_count` already 0.
  - `resetInactiveStreaks` preserves `highest_run_seen`.
  - `resetInactiveStreaks` does not touch rows where `last_music_post_at` is null.
  - `resetInactiveStreaks` does not touch rows at exactly the 36 h boundary.
  - `runScheduledWork` calls `resetInactiveStreaks` after recovery and before leaderboard posting.

- [x] **E2E tests** (`e2e-tests/`):
  - A user who hasn't posted in > 36 h has `run_count = 0` after scheduled work.
  - A user who posted within 36 h retains their streak after scheduled work.
  - After reset, leaderboard correctly reflects the zeroed score.

## Assumptions

- **No schema changes** — both features operate on existing tables and columns.
- The 36-hour threshold for inactivity reset matches the existing `THIRTY_SIX_HOURS_SECS` constant. No new constant is needed.
- The clock facility is already available and used in e2e tests, so threading it into `runScheduledWork` is straightforward.

## Pitfalls

- **WAL + `bun:sqlite`**: WAL mode is well-supported by bun:sqlite. The pragma must be set before any schema operations to take effect for the session.
- **Test isolation**: E2E tests that manipulate the clock must reset it after each test to avoid cross-contamination.
- **Threshold boundary**: The reset uses a strict `>` 36-hour comparison (i.e., `last_music_post_at <= now - 129600`), matching the existing streak logic where exactly 36 h is still within the "increment" window.
