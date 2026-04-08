# tests/index.test.ts

Integration tests for the startup wiring and the gateway-to-database path.

## Coverage

### Gateway integration smoke test (1 test)

- Seeds a leaderboard channel and monitored channel.
- Registers `setupGatewayHandler` on a fake `EventEmitter` client.
- Emits a `messageCreate` event with a valid music attachment.
- Verifies `getUserStats` returns a persisted row with `runCount = 1`.

### Startup recovery ordering (1 test)

- Verifies recovery is performed immediately at startup rather than being deferred until the first hourly interval tick.
- Uses a stubbed `fetch` and a fake `setInterval` to record call ordering.
- Confirms recovery completes before interval registration is observed.

## Test approach

- In-memory better-sqlite3 database with `schema.sql` applied per test.
- Minimal fake Discord client built from `EventEmitter`.
- Direct use of production query and service functions rather than mocks for the main integration path.

## Cross-references

- [entry-point.md](entry-point.md) — startup sequence under test
- [handler-gateway.md](handler-gateway.md) — gateway listener wiring
- [service-recovery.md](service-recovery.md) — startup recovery behavior
