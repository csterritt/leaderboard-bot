# Utility: db-helpers.ts

**File**: `src/utils/db-helpers.ts`

## Functions

### `toResult<T>(fn: () => T): Result<T, Error>`

Wraps a synchronous callback in a `true-myth` `Result`. Returns `Result.ok(value)` on success, `Result.err(error)` on thrown exception (wraps non-`Error` throws in `new Error(String(...))`).

### `withRetry<T>(operationName: string, operation: () => Result<T, Error>): Result<T, Error>`

Retries a DB operation up to `STANDARD_RETRY_OPTIONS.retries` (3) additional times, but **only** on transient SQLite errors (`SQLITE_BUSY`, `SQLITE_LOCKED`). Non-transient errors return immediately after the first attempt.

**Behaviour**:

- Returns on first success without retrying
- Retries only when `result.error.message` contains `SQLITE_BUSY` or `SQLITE_LOCKED`
- Total calls: up to 4 (1 initial + 3 retries)
- Logs `console.warn` per failed attempt, `console.error` on final exhaustion

## DB Access Pattern

Every exported DB function follows: `publicFn` → `withRetry` → `*Actual` → `toResult`.  
`*Actual` functions are module-private; only the retry-wrapped counterparts are exported.

## Cross-references

- [constants.md](constants.md) — `STANDARD_RETRY_OPTIONS`, `SQLITE_TRANSIENT_ERROR_MESSAGES`
- [tests-db-helpers.md](tests-db-helpers.md)
- [overview.md](overview.md)
