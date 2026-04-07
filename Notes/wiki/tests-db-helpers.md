# Tests: db-helpers.test.ts

**File**: `tests/db-helpers.test.ts`

## `toResult` tests (3)

- Returns `Result.ok(value)` on success
- Returns `Result.err(Error)` when callback throws an `Error`
- Wraps non-`Error` throws in `new Error(String(...))`

## `withRetry` tests (5)

- Returns immediately on first success (called once)
- Retries on `SQLITE_BUSY` error, succeeds on second attempt
- Retries on `SQLITE_LOCKED` error, succeeds on second attempt
- Does **not** retry non-transient errors (called exactly once)
- Returns last error after all 4 attempts exhausted on `SQLITE_BUSY` (1 + 3 retries = 4 calls total)

## Cross-references

- [util-db-helpers.md](util-db-helpers.md)
