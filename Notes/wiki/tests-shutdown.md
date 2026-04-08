# tests/shutdown.test.ts

Tests for `src/utils/shutdown.ts`.

## Coverage

- Returns a shutdown function.
- Stops the HTTP server.
- Destroys the Discord client.
- Closes the database connection.
- Calls `clearInterval` when `intervalId` is present.
- Does not call `clearInterval` when `intervalId` is `null`.
- Is idempotent: repeated calls perform cleanup only once.
- Logs shutdown-related messages.

## Test approach

- Uses lightweight mock resources with `vi.fn()` methods.
- Spies on `globalThis.clearInterval` and `console.log` where needed.
- Exercises the returned shutdown function directly.

## Cross-references

- [util-shutdown.md](util-shutdown.md) — implementation details
- [entry-point.md](entry-point.md) — signal handler wiring in startup
