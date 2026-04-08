# tests/processor.test.ts

17 tests covering `services/processor.ts`.

## normalizeDiscordMessage (3 tests)

- Normalizes a REST `DiscordMessage` (snake_case) into `NormalizedMessage` (camelCase), including member nick and attachment content type.
- Handles missing optional fields (`guild_id`, `member`, `bot`).
- Preserves `timestamp` and attachment `filename`/`contentType` for streak logic and attachment detection.

## normalizeGatewayMessage (3 tests)

- Normalizes a `discord.js` gateway message (camelCase Map-based attachments, `createdTimestamp`) into `NormalizedMessage`.
- Handles missing member and guild.
- `createdTimestamp` (ms) → ISO 8601 timestamp; attachment `name` → `filename`.

## processMessage (11 tests)

- Ignores non-monitored channels.
- Ignores messages with no music attachment.
- Ignores bot messages (`isBot === true`).
- Ignores messages with types outside `ACCEPTED_MESSAGE_TYPES` (e.g. type 7).
- Skips duplicate message IDs (already claimed).
- Processes a valid message: claims ID, computes stats, upserts stats — returns `Result.ok(true)`.
- Does not write to `recovery_state`.
- Claim + stats mutation is atomic (verified by checking both tables after success).
- Rolls back the claim when `user_stats` table is missing — no orphaned claim row.
- Accumulates `run_count` on successive valid messages from the same user.
- Accepts type 19 (`REPLY`) messages.

## Related pages

- [service-processor.md](service-processor.md) — implementation
