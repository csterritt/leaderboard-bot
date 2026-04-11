# services/processor.ts

Single authoritative message-ingestion pipeline used by both the gateway handler and recovery. Accepts the internal `NormalizedMessage` shape; provides adapters for both sources. Only `DEFAULT` (type 0) and `REPLY` (type 19) messages are accepted.

## normalizeDiscordMessage

```typescript
normalizeDiscordMessage(raw: DiscordMessage): NormalizedMessage
```

Converts a raw Discord REST API `DiscordMessage` (snake_case fields) into the internal `NormalizedMessage` (camelCase). Maps `content_type` → `contentType` on attachments; maps `bot` → `isBot`; preserves optional `guild_id` and `member`.

## normalizeGatewayMessage

```typescript
normalizeGatewayMessage(raw: GatewayMessage): NormalizedMessage
```

Converts a `discord.js` gateway message object (which uses Maps, camelCase, and `createdTimestamp` instead of `timestamp`) into `NormalizedMessage`. `createdTimestamp` (ms epoch) → `new Date(ts).toISOString()`. Attachment Map → `NormalizedAttachment[]`. `member.nickname` → `nick`. Optional fields (`guildId`, `member`) handled safely.

## processMessage

```typescript
processMessage(db: Database, message: NormalizedMessage): Result<boolean, Error>
```

Single transactional message-processing path.

**Returns:**

- `Result.ok(true)` — message was processed and stats updated.
- `Result.ok(false)` — message was filtered/skipped (bot, wrong type, no music attachment, non-monitored channel, already claimed).
- `Result.err` — DB failure; transaction was rolled back so no partial state remains.

**Algorithm:**

1. Early-exit filters (bot, message type, no music attachment) — no DB touch.
2. `isMonitoredChannel(db, channelId)` — skip if not monitored.
3. Open SQLite transaction:
   a. `claimProcessedMessage` — idempotency guard (returns `false` → skip, already claimed).
   b. `parseDiscordTimestamp(message.timestamp)` → Unix seconds.
   c. `getUserStats(db, channelId, userId)` — load existing stats (or null).
   d. `resolveUsername(author, member)` — pick display name.
   e. `computeNewStats(existing, timestamp, username, userId, channelId)` — pure streak logic.
   f. `upsertUserStats(db, newStats)` — persist.
4. If any step inside the transaction throws, the whole transaction rolls back (including the claim).
5. Does **not** advance `recovery_state`; that is recovery's responsibility.

**Logging:**

- `[processor] skipping bot message: id=...` — bot filter.
- `[processor] skipping non-default message type: id=... type=...` — type filter.
- `[processor] skipping message without music attachment: id=...` — attachment filter.
- `[processor] skipping message in non-monitored channel: id=... channelId=...` — channel filter.
- `[processor] skipping already-processed message: id=...` — idempotency guard.
- `[processor] stats updated: userId=... channelId=... runCount=...` — successful processing.
- `[processor] error processing message: id=...` — `console.error` on transaction failure.

## Related pages

- [service-tracker.md](service-tracker.md) — `hasMusicAttachment`, `computeNewStats`, `resolveUsername`
- [db-queries.md](db-queries.md) — `isMonitoredChannel`, `claimProcessedMessage`, `getUserStats`, `upsertUserStats`
- [util-time.md](util-time.md) — `parseDiscordTimestamp`
- [types.md](types.md) — `NormalizedMessage`, `DiscordMessage`, `Database`
- [constants.md](constants.md) — `ACCEPTED_MESSAGE_TYPES`
- [tests-processor.md](tests-processor.md) — test coverage
