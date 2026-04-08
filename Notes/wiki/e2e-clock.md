# e2e-tests/utils/clock.test.ts

End-to-end-style tests for the standalone clock facility in `src/utils/clock.ts`.

## Coverage

- `now()` returns current Unix seconds in real-time mode.
- `set()` fixes the current time.
- `advance()` moves the fixed clock forward.
- Multiple `advance()` calls accumulate.
- `hasPassed()` returns `false` for future timestamps.
- `hasPassed()` returns `true` for equal timestamps.
- `hasPassed()` returns `true` for past timestamps.
- `reset()` restores real-time behavior.
- `set()` followed by `advance()` keeps `now()` and `hasPassed()` consistent.

## Test approach

- Uses the real `createClock()` implementation with no mocks.
- Verifies behavior through public methods only.

## Cross-references

- [util-clock.md](util-clock.md) — implementation
- [e2e-tests.md](e2e-tests.md) — e2e suite overview
