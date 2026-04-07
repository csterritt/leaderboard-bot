# Tests: time.ts

**File**: `tests/time.test.ts`

## `parseDiscordTimestamp` tests (4)

- Converts a basic ISO8601 string to Unix seconds
- Handles fractional seconds (floors to integer)
- Normalizes timezone-offset timestamps to UTC Unix seconds
- Returns an integer (no fractional part)

## `computeStreakDelta` tests (9)

- `null` → `'first'`
- Negative delta → clamped to 0 → `'noop'`
- Large negative delta → clamped → `'noop'`
- Exactly 8 hours (28800s) → `'noop'`
- Zero → `'noop'`
- Just over 8 hours (28801s) → `'increment'`
- Exactly 36 hours (129600s) → `'increment'`
- Just over 36 hours (129601s) → `'reset'`
- Very large delta → `'reset'`

## Cross-references

- [util-time.md](util-time.md)
