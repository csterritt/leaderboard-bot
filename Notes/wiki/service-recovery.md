# service-recovery.md

**Source:** `src/services/recovery.ts`

## Purpose

Performs backfill recovery for monitored channels by fetching messages from the Discord REST API and processing them through the shared `processMessage` pipeline. Owns checkpoint advancement via `recovery_state`.

## Functions

### `recoverChannel(db, token, channelId): Promise<Result<number, Error>>`

- Reads `recovery_state` for the channel; starts from `after=0` if no prior state.
- Calls `fetchMessagesAfter` in a loop until an empty page is returned.
- **Sorts each page from oldest to newest** (ascending ID) before processing.
- For each message: calls `processMessage`, then advances `recovery_state` with `upsertRecoveryState`.
- If `processMessage` returns `Result.err`, immediately returns that error (checkpoint is not advanced beyond the failing message).
- Returns `Result.ok(totalProcessed)` — count of messages that were actually processed (not skipped).

### `recoverAllChannels(db, token): Promise<Result<void, Error>>`

- Calls `getMonitoredChannels` and iterates, calling `recoverChannel` for each.
- Returns `Result.err` on the first channel that fails.
- Succeeds with `Result.ok(undefined)` when there are no monitored channels.

## Key Design Rules

- Recovery does **not** merge channels — each monitored channel is processed independently.
- `recovery_state` is only updated by recovery, never by the gateway handler.
- `processMessage` owns idempotency (via `processed_messages`); recovery advances the cursor regardless of whether a message was skipped or processed.
- The Discord `after` parameter is exclusive — the checkpoint message itself is not re-fetched.

## Cross-references

- Uses [`service-processor.md`](service-processor.md) — `normalizeDiscordMessage`, `processMessage`
- Uses [`service-discord.md`](service-discord.md) — `fetchMessagesAfter`
- Uses [`db-queries.md`](db-queries.md) — `getRecoveryState`, `upsertRecoveryState`, `getMonitoredChannels`
