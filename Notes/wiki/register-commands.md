# Script: register-commands.ts

**File**: `src/scripts/register-commands.ts`

## Purpose

Registers the bot's global slash commands with Discord via a single bulk `PUT` request to the application commands endpoint.

## Environment

- `DISCORD_BOT_TOKEN` — bot token used as `Authorization: Bot <token>`
- `DISCORD_APPLICATION_ID` — Discord application ID used to build the commands endpoint URL

If either value is missing, the script logs an error and exits with status `1`.

## Command Set

The script registers 5 slash commands:

- `leaderboard` — optional `channel` argument (`CHANNEL`, guild text only)
- `setleaderboardchannel`
- `removeleaderboardchannel`
- `addmonitoredchannel` — required `channel` argument (`CHANNEL`, guild text only)
- `removemonitoredchannel` — required `channel` argument (`CHANNEL`, guild text only)

## Request Flow

1. Read required environment variables.
2. Build the command payload array inline.
3. `PUT https://discord.com/api/v10/applications/{application_id}/commands`
4. Exit with status `1` and log the response body on failure.
5. Log the number of registered commands on success.

## Usage

Run with:

```bash
bun run src/scripts/register-commands.ts
```

## Cross-references

- [handler-interactions.md](handler-interactions.md) — handlers for the registered commands
- [types.md](types.md) — interaction payload shapes consumed by the HTTP handler
- [overview.md](overview.md) — where the script fits into the project lifecycle
