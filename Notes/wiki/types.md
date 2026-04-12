# TypeScript Types

**File**: `src/types.ts`

## Database types

| Type                   | Purpose                                                                 |
| ---------------------- | ----------------------------------------------------------------------- |
| `Database`             | Re-export of `Database` from `bun:sqlite`                               |
| `UserStats`            | Row shape returned from `user_stats` queries                            |
| `UpsertUserStatsInput` | Input shape for `upsertUserStats` (requires non-null `lastMusicPostAt`) |
| `LeaderboardRow`       | `{ username, runCount, highestRunSeen }` — leaderboard display row      |
| `LeaderboardChannel`   | Row from `leaderboard_channels`                                         |
| `LeaderboardPost`      | Row from `leaderboard_posts`                                            |
| `MonitoredChannel`     | Row from `monitored_channels`                                           |
| `RecoveryState`        | Row from `recovery_state`; `lastProcessedMessageId` nullable            |
| `ProcessedMessage`     | Row from `processed_messages`                                           |

## Discord API types

| Type                       | Purpose                                                              |
| -------------------------- | -------------------------------------------------------------------- |
| `DiscordUser`              | Discord user object (`id`, `username`, `global_name`, `bot?`)        |
| `DiscordMember`            | Guild member object (`nick`, `permissions?`)                         |
| `DiscordAttachment`        | Raw attachment from Discord API (`id`, `filename?`, `content_type?`) |
| `DiscordMessage`           | Full Discord message object                                          |
| `DiscordInteraction`       | Interaction payload from slash commands                              |
| `DiscordInteractionData`   | Slash command name + options                                         |
| `DiscordInteractionOption` | Single slash command option                                          |

## Normalized message types

| Type                   | Purpose                                                             |
| ---------------------- | ------------------------------------------------------------------- |
| `NormalizedAttachment` | `{ filename?, contentType? }` — normalized from `DiscordAttachment` |
| `NormalizedAuthor`     | `{ id, username, globalName, isBot }`                               |
| `NormalizedMember`     | `{ nick }`                                                          |
| `NormalizedMessage`    | Internal message shape used by `processMessage`                     |

## Other

| Type              | Purpose                                                                                                               |
| ----------------- | --------------------------------------------------------------------------------------------------------------------- |
| `StreakDeltaKind` | `'first' \| 'noop' \| 'increment' \| 'reset'`                                                                         |
| `Env`             | Environment variable interface (`DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY`, `DISCORD_APPLICATION_ID`, `DATABASE_PATH`) |

## Cross-references

- [overview.md](overview.md)
- [util-time.md](util-time.md) — uses `StreakDeltaKind`
- [schema.md](schema.md) — DB row shapes mirror schema columns
