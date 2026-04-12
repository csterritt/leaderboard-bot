# tests-gateway.md

**Test file:** `tests/gateway.test.ts`  
**Tests:** 5

## `setupGatewayHandler` (5 tests)

- Processes a valid `messageCreate` event and creates a DB row.
- Claims the message ID after processing.
- Ignores bot messages before reaching `processMessage`.
- Does not advance `recovery_state` on gateway processing.
- Logs to `console.error` and does not throw when `processMessage` returns an error.

## Test approach

- Uses `EventEmitter` as a fake discord.js `Client`.
- Emits `messageCreate` events directly with gateway-shaped message objects.
- In-memory bun:sqlite database per test.
- Verifies DB state after event emission.
