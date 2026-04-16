# handler-interactions.md

**Source:** `src/handlers/interactions.ts`

## Purpose

Handles Discord Interactions HTTP endpoint requests. Performs Ed25519 signature verification then routes to the appropriate slash command handler. All command responses are ephemeral (flags = 64).

## Exports

### `handleInteraction(request, db, token, publicKey): Promise<Response>`

Public entry point. Verifies the request signature using `verifyDiscordSignature` with the provided `publicKey`, then routes to `handleInteractionWithVerifier`.

### `handleInteractionWithVerifier(request, db, token, verifier): Promise<Response>`

Testable entry point that accepts an injected verifier function. Returns `401` if headers are missing or the verifier returns false. Parses the body as `DiscordInteraction` and dispatches to `routeInteraction`.

### `recoverAndRefreshLeaderboard(db, token, monitoredChannelId, leaderboardChannelId): Promise<void>`

Runs recovery for a single monitored channel, then refreshes the leaderboard post for the associated leaderboard channel. Used as fire-and-forget by `/addmonitoredchannel`. Exported for direct testing.

1. Calls `recoverChannel` for the monitored channel.
2. Gets all monitored channels for the leaderboard, builds leaderboard sections.
3. Computes content hash; skips posting if unchanged.
4. Deletes old leaderboard message (if any), posts new one, upserts `leaderboard_posts`.
5. All errors are caught and logged — never throws.

**Logging:**

- `[interactions] recovery failed for channel <id>: <error>` — on recovery failure.
- `[interactions] leaderboard unchanged for channel: <id>` — on content hash match.
- `[interactions] leaderboard post updated for channel: <id>` — after successful post.
- `[interactions] recoverAndRefreshLeaderboard error: <msg>` — on unexpected error.
- `[interactions] fire-and-forget error: <msg>` — on uncaught promise rejection from fire-and-forget call.

**Logging:**

- `[interactions] missing signature headers` — `console.warn` on missing signature/ timestamp headers.
- `[interactions] invalid signature` — `console.warn` on failed verification.
- `[interactions] signature verified` — `console.log` after successful verification.

## Routing

| Interaction type          | Dispatch              | Log message                                                                            |
| ------------------------- | --------------------- | -------------------------------------------------------------------------------------- |
| `type = 1`                | Ping → `{ type: 1 }`  | `[interactions] ping received`                                                         |
| `type = 2` + command name | Slash command handler | `[interactions] command received: <name>` / `[interactions] command completed: <name>` |
| Unknown command           | `400`                 | `[interactions] unknown command: <name>`                                               |
| Unknown type              | `400`                 | `[interactions] unknown interaction type: <type>`                                      |

## Slash Command Handlers

### `/leaderboard [channel]`

- Defaults to `interaction.channel_id` when no `channel` option is provided.
- For a different channel option, calls `fetchChannel` to resolve the display name.
- Validates the target is in `leaderboard_channels`; returns an error message if not.
- Calls `getMonitoredChannelsByLeaderboard` to find all linked monitored channels.
- Returns a helpful message if no monitored channels are linked.
- Calls `getLeaderboard` for each linked monitored channel.
- **Single channel**: uses `formatLeaderboard(lc.channelName, rows)` as before.
- **Multiple channels**: uses `formatMultiChannelLeaderboard(sections)` — concatenates per-channel sections separated by a blank line.
- Always responds as ephemeral (flags = 64).

### `/setleaderboardchannel`

- Requires guild context and `ADMINISTRATOR` permission.
- Upserts the current channel into `leaderboard_channels` (does not touch `monitored_channels`).
- Refreshes `channel_name` on re-run.

### `/removeleaderboardchannel`

- Requires guild context and `ADMINISTRATOR` permission.
- Deletes the `leaderboard_posts` row for the channel first.
- Deletes the `leaderboard_channels` row (cascades to `monitored_channels` via FK).
- Historical `user_stats`, `recovery_state`, and `processed_messages` rows are preserved.

### `/addmonitoredchannel <channel>`

- Requires guild context and `ADMINISTRATOR` permission.
- Validates the current channel is in `leaderboard_channels`.
- Allows multiple monitored channels to be linked to the same leaderboard channel (many-to-many).
- Idempotent: adding the same `(monitored_channel, leaderboard_channel)` pair again succeeds silently.
- After inserting the DB row, kicks off a **fire-and-forget** call to `recoverAndRefreshLeaderboard`, which:
  - Runs `recoverChannel` to backfill historical messages for the newly added channel.
  - Rebuilds and posts/updates the leaderboard in the leaderboard channel.
- The ephemeral response is returned immediately — recovery and leaderboard refresh happen asynchronously.

### `/removemonitoredchannel <channel>`

- Requires guild context and `ADMINISTRATOR` permission.
- Must be run from a leaderboard channel (validates via `getLeaderboardChannel`); returns an error if not.
- Removes the specific `(monitored_channel, current_leaderboard_channel)` link from `monitored_channels` — other links for the same monitored channel are preserved.
- Preserves all historical rows.

## Guards

- **`guildGuard`**: returns an ephemeral error if `guild_id` or `member` is absent.
- **`adminGuard`**: returns an ephemeral error if the member lacks `ADMINISTRATOR` permission.

## Cross-references

- Uses [`util-signature.md`](util-signature.md) — `verifyDiscordSignature`
- Uses [`util-permissions.md`](util-permissions.md) — `hasAdministratorPermission`
- Uses [`db-queries.md`](db-queries.md) — leaderboard channel CRUD, monitored channel CRUD, `getLeaderboard`, `getLeaderboardPost`, `upsertLeaderboardPost`
- Uses [`service-discord.md`](service-discord.md) — `fetchChannel`, `sendMessage`, `deleteMessage`
- Uses [`service-leaderboard.md`](service-leaderboard.md) — `formatLeaderboard`, `formatMultiChannelLeaderboard`, `hashContent`
- Uses [`service-recovery.md`](service-recovery.md) — `recoverChannel`
