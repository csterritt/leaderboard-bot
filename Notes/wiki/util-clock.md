# Clock Utility — `src/utils/clock.ts`

## Purpose

A mockable clock facility used by e2e tests to control the passage of time without touching the system clock or relying on `vi.useFakeTimers()`.

## Interface

```typescript
export interface Clock {
  now(): number          // current Unix seconds (real or fixed)
  set(t: number): void   // fix the clock at time t
  advance(secs: number): void  // move the fixed clock forward by secs
  hasPassed(t: number): boolean  // returns now() >= t
  reset(): void          // restore real-time behaviour
}

export const createClock = (): Clock => { ... }
```

## Behaviour

- When no `set()` has been called (or after `reset()`), `now()` returns `Math.floor(Date.now() / 1000)`.
- After `set(t)`, `now()` always returns `t` regardless of wall-clock time.
- `advance(secs)` adds `secs` to the current fixed value (initialising from real time if not yet fixed).
- Multiple `advance()` calls accumulate.
- `hasPassed(t)` is a convenience for `now() >= t`.
- `reset()` clears the fixed value and restores real-time mode.

## Usage in E2E Tests

```typescript
const clock = createClock()
clock.set(1_700_000_000)

processMessage(db, makeMsg({ id: 'msg-1', timestampSecs: clock.now() }))

clock.advance(12 * 3600) // simulate 12 hours passing
processMessage(db, makeMsg({ id: 'msg-2', timestampSecs: clock.now() }))
```

## Cross-references

- [e2e-clock.md](e2e-clock.md) — Tests for this module
- [e2e-streaks.md](e2e-streaks.md) — Primary consumer in e2e streak tests
- [e2e-scheduled.md](e2e-scheduled.md) — Used for time setup in scheduled tests
