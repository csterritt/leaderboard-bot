# tests/discord.test.ts

16 tests covering `services/discord.ts`. Tests use `vi.stubGlobal('fetch', mockFetch)` and `vi.useFakeTimers()` for rate-limit and retry simulation.

## discordFetch — rate-limit behaviour (3 tests, via `sendMessage`)

- Enforces minimum delay between consecutive calls (fake timers used to advance time).
- Retries once on `429` after the `Retry-After` duration; returns success on the second attempt.
- Returns `Result.err` when a second consecutive `429` is received.

## sendMessage (3 tests)

- Makes `POST /channels/{channelId}/messages` with `Authorization` header and JSON body `{ content }`.
- Returns `Result.ok(messageId)` on success.
- Returns `Result.err` on non-2xx.

## deleteMessage (4 tests)

- Makes `DELETE /channels/{channelId}/messages/{messageId}`.
- Returns `Result.ok(true)` on `204`.
- Returns `Result.ok(true)` on `404` (already deleted — treated as success).
- Returns `Result.err` on other non-2xx (e.g. `403`).

## fetchMessagesAfter (3 tests)

- Makes `GET /channels/{channelId}/messages?after={afterId}&limit=100`.
- Returns `Result.ok(DiscordMessage[])` on success.
- Returns `Result.err` on non-2xx.

## fetchChannel (3 tests)

- Makes `GET /channels/{channelId}` with `Authorization` and `GET` method.
- Returns `Result.ok({ id, name })` on success.
- Returns `Result.err` on non-2xx.

## Related pages

- [service-discord.md](service-discord.md) — implementation
