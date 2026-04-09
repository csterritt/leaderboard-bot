# handler-interactions.md

**Source:** `src/handlers/interactions.ts`

## Purpose

Handles Discord Interactions HTTP endpoint requests. Performs Ed25519 signature verification then routes to the appropriate slash command handler. All command responses are ephemeral (flags = 64).

## Exports

### `handleInteraction(request, db, token, publicKey): Promise<Response>`

Public entry point. Verifies the request signature using `verifyDiscordSignature` with the provided `publicKey`, then routes to `handleInteractionWithVerifier`.

### `handleInteractionWithVerifier(request, db, token, verifier): Promise<Response>`

Testable entry point that accepts an injected verifier function. Returns `401` if headers are missing or the verifier returns false. Parses the body as `DiscordInteraction` and dispatches to `routeInteraction`.

## Routing

| Interaction type          | Dispatch              |
| ------------------------- | --------------------- |
| `type = 1`                | Ping → `{ type: 1 }`  |
| `type = 2` + command name | Slash command handler |
| Unknown                   | `400`                 |

## Slash Command Handlers

### `/leaderboard [channel]`

- Defaults to `interaction.channel_id` when no `channel` option is provided.
- For a different channel option, calls `fetchChannel` to resolve the display name.
- Validates the target is in `leaderboard_channels`; returns an error message if not.
- Calls `getMonitoredChannelByLeaderboard` to find the linked monitored channel.
- Returns a helpful message if no monitored channel is linked.
- Calls `getLeaderboard` only for the linked monitored channel (no cross-channel merging).
- Passes the channel display name into `formatLeaderboard`.
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
- Rejects if the leaderboard channel already has a **different** linked monitored channel.
- Idempotent: adding the same channel again succeeds silently.

### `/removemonitoredchannel <channel>`

- Requires guild context and `ADMINISTRATOR` permission.
- Removes the specified channel from `monitored_channels`.
- Preserves all historical rows.

## Guards

- **`guildGuard`**: returns an ephemeral error if `guild_id` or `member` is absent.
- **`adminGuard`**: returns an ephemeral error if the member lacks `ADMINISTRATOR` permission.

## Cross-references

- Uses [`util-signature.md`](util-signature.md) — `verifyDiscordSignature`
- Uses [`util-permissions.md`](util-permissions.md) — `hasAdministratorPermission`
- Uses [`db-queries.md`](db-queries.md) — leaderboard channel CRUD, monitored channel CRUD, `getLeaderboard`
- Uses [`service-discord.md`](service-discord.md) — `fetchChannel`
- Uses [`service-leaderboard.md`](service-leaderboard.md) — `formatLeaderboard`
