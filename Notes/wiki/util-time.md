# Utility: time.ts

**File**: `src/utils/time.ts`

## Functions

### `parseDiscordTimestamp(iso: string): number`

Converts a Discord ISO8601 timestamp string to a Unix seconds integer. Handles timezone offsets and fractional seconds correctly by using `Date.parse` / `getTime()` divided by 1000, floored.

### `computeStreakDelta(deltaSecs: number | null): StreakDeltaKind`

Classifies the time gap between consecutive music posts:

| Input                       | Output                    |
| --------------------------- | ------------------------- |
| `null`                      | `'first'` — no prior post |
| negative → clamped to `0`   | `'noop'`                  |
| `0 – 28_800` (≤ 8h)         | `'noop'`                  |
| `28_801 – 129_600` (8h–36h] | `'increment'`             |
| `> 129_600` (> 36h)         | `'reset'`                 |

Negative deltas are clamped to `0` before classification (handles out-of-order message delivery).

## Cross-references

- [constants.md](constants.md) — `EIGHT_HOURS_SECS`, `THIRTY_SIX_HOURS_SECS`
- [types.md](types.md) — `StreakDeltaKind`
- [tests-time.md](tests-time.md)
