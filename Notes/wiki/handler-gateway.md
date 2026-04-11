# handler-gateway.md

**Source:** `src/handlers/gateway.ts`

## Purpose

Wires the `discord.js` `Client` to the shared `processMessage` pipeline. The `discord.js` library fully manages the gateway lifecycle (heartbeat, reconnect, session resume); this handler only attaches event listeners.

## Functions

### `setupGatewayHandler(client, db): void`

- Listens on `client.on('messageCreate', ...)`.
- Normalizes the gateway `Message` object into `NormalizedMessage` via `normalizeGatewayMessage`.
- Calls `processMessage(db, normalized)`.
- Logs `[gateway] message received: id=... channelId=... authorId=...` on every message.
- On `Result.ok(true)`: logs `[gateway] message processed: id=...`.
- On `Result.ok(false)`: logs `[gateway] message skipped: id=...`.
- On `Result.err`: logs `[gateway] processMessage error: id=...` to `console.error` and swallows the error (fire-and-forget). Recovery will retry later.
- Does **not** advance `recovery_state` — only the recovery service owns checkpoint advancement.

## Key Design Rules

- Bot messages are filtered out inside `processMessage` (not duplicated here).
- Gateway handler is thin transport glue only; all business logic lives in `processMessage`.
- Errors are swallowed intentionally — the gateway path is best-effort and idempotent via `processed_messages`.

## Cross-references

- Uses [`service-processor.md`](service-processor.md) — `normalizeGatewayMessage`, `processMessage`
