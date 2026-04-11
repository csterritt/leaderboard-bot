# services/discord.ts

Discord REST API client. Uses `fetch` directly (no discord.js). All exported functions go through the shared `discordFetch` wrapper which enforces rate-limit discipline.

## Rate-limit strategy

- Maintain a **minimum 1 100 ms delay** between consecutive requests (well within Discord's 5 req/5 s global limit).
- Delay is enforced via a promise chain (`pendingChain`) so concurrent callers queue rather than flood.
- On a `429` response: read `Retry-After` header (seconds), wait, retry once.
- On a **second consecutive `429`**: return `Result.err` — caller decides how to handle.
- `_resetRateLimit()` is exported for test isolation only.

## discordFetch (internal)

```typescript
discordFetch(token: string, url: string, options: RequestInit): Promise<Result<Response, Error>>
```

Internal. Enforces delay, injects `Authorization: <token>` header, handles `429` retry. All public functions call this.

**Logging:**

- `[discord] rate limited on <url>, retrying after <N>s` — `console.warn` on first 429.
- `[discord] rate limited twice on <url>` — `console.error` on second consecutive 429.

## sendMessage

```typescript
sendMessage(token: string, channelId: string, content: string): Promise<Result<string, Error>>
```

`POST /channels/{channelId}/messages` with `Content-Type: application/json` body `{ content }`.
Returns `Result.ok(messageId)` on success, `Result.err` on non-2xx.

**Logging:**

- `[discord] message sent: channelId=... messageId=...` — on success.
- `[discord] sendMessage failed: channelId=... status=...` — `console.error` on failure.

## deleteMessage

```typescript
deleteMessage(token: string, channelId: string, messageId: string): Promise<Result<boolean, Error>>
```

`DELETE /channels/{channelId}/messages/{messageId}`.  
Returns `Result.ok(true)` on `204` (deleted) or `404` (already gone — treated as success).
Returns `Result.err` on other non-2xx.

**Logging:**

- `[discord] message deleted: channelId=... messageId=... status=...` — on success (204 or 404).
- `[discord] deleteMessage failed: channelId=... messageId=... status=...` — `console.error` on failure.

## fetchMessagesAfter

```typescript
fetchMessagesAfter(token: string, channelId: string, afterId: string): Promise<Result<DiscordMessage[], Error>>
```

`GET /channels/{channelId}/messages?after={afterId}&limit=100`.  
Returns `Result.ok(DiscordMessage[])` on success, `Result.err` on non-2xx. Used by recovery to page through channel history.

**Logging:**

- `[discord] fetched messages: channelId=... count=...` — on success.
- `[discord] fetchMessagesAfter failed: channelId=... status=...` — `console.error` on failure.

## fetchChannel

```typescript
fetchChannel(token: string, channelId: string): Promise<Result<{ id: string; name: string }, Error>>
```

`GET /channels/{channelId}`.  
Returns `Result.ok({ id, name })` on success, `Result.err` on non-2xx. Used by the `/leaderboard` slash command to resolve a channel display name.

**Logging:**

- `[discord] channel fetched: channelId=... name=...` — on success.
- `[discord] fetchChannel failed: channelId=... status=...` — `console.error` on failure.

## Related pages

- [constants.md](constants.md) — `DISCORD_API_DELAY_MS`
- [types.md](types.md) — `DiscordMessage`
- [tests-discord.md](tests-discord.md) — test coverage
- [service-leaderboard.md](service-leaderboard.md) — `formatLeaderboard`, `hashContent` (used upstream of this client)
