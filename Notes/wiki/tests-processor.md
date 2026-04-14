# tests/processor.test.ts

30 tests covering `services/processor.ts`.

## normalizeDiscordMessage (3 tests)

- Normalizes a REST `DiscordMessage` (snake_case) into `NormalizedMessage` (camelCase), including member nick and attachment content type.
- Handles missing optional fields (`guild_id`, `member`, `bot`).
- Preserves `timestamp` and attachment `filename`/`contentType` for streak logic and attachment detection.

## normalizeDiscordMessage content passthrough (2 tests)

- Maps `content` field from `DiscordMessage` into `NormalizedMessage.content`.
- Leaves `content` undefined when absent from source message.

## normalizeGatewayMessage (3 tests)

- Normalizes a `discord.js` gateway message (camelCase Map-based attachments, `createdTimestamp`) into `NormalizedMessage`.
- Handles missing member and guild.
- `createdTimestamp` (ms) → ISO 8601 timestamp; attachment `name` → `filename`.

## normalizeGatewayMessage content passthrough (2 tests)

- Maps `content` field from gateway message into `NormalizedMessage.content`.
- Leaves `content` undefined when absent.

## processMessage (14 tests)

- Ignores non-monitored channels.
- Ignores messages with no music attachment and no YouTube link.
- Ignores bot messages (`isBot === true`).
- Ignores messages with types outside `ACCEPTED_MESSAGE_TYPES` (e.g. type 7).
- Skips duplicate message IDs (already claimed).
- Processes a valid message: claims ID, computes stats, upserts stats — returns `Result.ok(true)`.
- Does not write to `recovery_state`.
- Claim + stats mutation is atomic (verified by checking both tables after success).
- Rolls back the claim when `user_stats` table is missing — no orphaned claim row.
- Accumulates `run_count` on successive valid messages from the same user.
- Accepts type 19 (`REPLY`) messages.
- Processes a message with a YouTube link in `content` but no attachment — returns `Result.ok(true)`.
- Processes a message with both a YouTube link and an attachment — returns `Result.ok(true)`.
- Does not process a `music.youtube.com` link with no attachment — returns `Result.ok(false)`.

## Related pages

- [service-processor.md](service-processor.md) — implementation
