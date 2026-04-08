# src/utils/shutdown.ts — Graceful Shutdown

**Source:** `src/utils/shutdown.ts`

## Purpose

Provides an idempotent shutdown function that cleanly releases all bot resources on `SIGTERM` or `SIGINT`.

## Interface

```typescript
interface ShutdownResources {
  server: { stop(): void }
  client: { destroy(): void }
  db: { close(): void }
  intervalId: ReturnType<typeof setInterval> | null
}

const createShutdown = (resources: ShutdownResources): (() => void)
```

## Behaviour

1. First call sets an internal `isShuttingDown` flag and runs cleanup:
   - Clears the hourly `setInterval` (if `intervalId` is not null)
   - Stops the Bun HTTP server
   - Destroys the discord.js client (closes the gateway connection)
   - Closes the better-sqlite3 database
2. Subsequent calls are no-ops (idempotent).
3. Logs `"Shutting down gracefully..."` and `"Shutdown complete"`.

## Wiring (in `src/index.ts`)

```typescript
const shutdown = createShutdown({ server, client, db, intervalId })
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
```

## Tests

8 tests in `tests/shutdown.test.ts`:
- Returns a function
- Stops the HTTP server
- Destroys the discord.js client
- Closes the database connection
- Clears the interval when set
- Does not call clearInterval when intervalId is null
- Idempotent — calling twice only cleans up once
- Logs shutdown messages

## Cross-references

- [`entry-point.md`](entry-point.md) — wiring in startup sequence
