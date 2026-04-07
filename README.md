# Discord Music Leaderboard Bot

A Discord bot built with `discord.js`, `better-sqlite3`, `Bun`, and TypeScript to track music file uploads, maintain per-user streak stats, and publish scheduled leaderboard posts in Discord channels.

## Overview

This bot listens for `MESSAGE_CREATE` events from the Discord Gateway, identifies supported music file uploads in configured channels, and updates per-user streak statistics based on post timing.

Slash commands are handled through Discord Interactions over HTTP, while message ingestion happens through the gateway event stream. The bot also runs scheduled recovery and leaderboard posting work to keep statistics and leaderboard messages up to date.

## Features

- Track music uploads in configured monitored channels
- Maintain per-user streak stats for each monitored channel
- Publish scheduled leaderboard posts to configured leaderboard channels
- Support slash-command-based channel configuration
- Recover missed messages through backfill processing
- Prevent double processing through message-level idempotency
- Persist data locally with SQLite via `better-sqlite3`

## Tech Stack

- **Runtime**: Bun
- **Language**: TypeScript
- **Gateway Layer**: `discord.js`
- **HTTP Interface**: Discord Interactions endpoint
- **Database**: `better-sqlite3`
- **Discord Integration**: `discord.js` + Discord REST API + Discord Interactions

## How It Works

### Message Ingestion

The bot listens to Discord `messageCreate` gateway events and processes only messages that:

- are not from bots
- are in monitored channels
- are valid message types
- include a supported music attachment

For valid messages, the bot:

- claims the message ID for idempotency
- loads the user's current stats for that channel
- computes the next streak state from the Discord message timestamp
- resolves the display name from guild nickname, global name, or username
- persists the updated stats

### Streak Rules

The bot uses Discord message timestamps for all streak calculations.

- **First tracked post**: `run_count = 1`, `highest_run_seen = 1`
- **More than 36 hours since the last tracked post**: reset to `run_count = 1`
- **More than 8 hours and up to 36 hours since the last tracked post**: increment the streak
- **8 hours or less since the last tracked post**: do not increment the streak

`highest_run_seen` updates whenever the current active streak exceeds the user's best streak so far.

### Supported Music Detection

Music uploads are detected using attachment metadata.

- Primary check: file extension from `filename`
- Fallback: if `filename` is absent, check whether `content_type` starts with `audio/`

### Scheduled Work

The bot runs scheduled work every hour to:

1. recover missed messages for monitored channels
2. generate and post leaderboard updates
3. prune old `processed_messages` rows

Leaderboard content is hashed so unchanged leaderboards are not reposted.

## Slash Commands

### `/leaderboard [channel]`

Shows the music leaderboard for a leaderboard channel.

- Defaults to the current channel when no option is provided
- Returns an error if the target channel is not configured as a leaderboard channel
- Returns an ephemeral response

### `/setleaderboardchannel`

Marks the current channel as a leaderboard channel.

- Takes no arguments
- Requires `ADMINISTRATOR`
- Refreshes the stored channel name when re-run

### `/removeleaderboardchannel`

Removes the current channel from the configured leaderboard channels.

- Takes no arguments
- Requires `ADMINISTRATOR`
- Removes any stored leaderboard post record for that channel
- Stops future posting for that channel

### `/addmonitoredchannel <channel>`

Adds a channel to be monitored for music uploads.

- Must be run from a configured leaderboard channel
- Requires `ADMINISTRATOR`
- Is idempotent when the same channel is added again

### `/removemonitoredchannel <channel>`

Removes a monitored channel.

- Requires `ADMINISTRATOR`
- Preserves historical stats and recovery records

## Discord App Setup

1. Create an application in the Discord Developer Portal
2. Enable the **Message Content** privileged intent
3. Enable the gateway intents:
   - `GUILDS`
   - `GUILD_MESSAGES`
   - `MESSAGE_CONTENT`
4. Configure the Interactions endpoint URL
5. Install the bot with permissions to:
   - read messages
   - send messages
   - manage messages
   - read message history

## Running the Bot

### Register Slash Commands

```bash
bun run src/scripts/register-commands.ts
```

### Start the Application

```bash
bun run src/index.ts
```

## Deployment Notes

### Prerequisites

- Bun installed on the target machine
- A persistent filesystem for the SQLite database

### Typical Deployment Flow

1. Set the required environment variables
2. Create or mount persistent storage for the database file
3. Register slash commands
4. Configure the Discord Interactions endpoint
5. Start the bot process
6. Use `/setleaderboardchannel` in channels that should display leaderboards
7. Use `/addmonitoredchannel` from each leaderboard channel to configure tracking

## Operational Notes

- The gateway path and recovery path share the same message-processing logic
- Recovery is designed to safely backfill missed messages
- Old idempotency records are pruned periodically to keep table growth bounded
- The bot uses content hashing to avoid reposting unchanged leaderboard messages
- Previous leaderboard messages are deleted before posting updated leaderboard content when needed

## Status

This repository currently documents the architecture and implementation approach for the bot. See `Notes/Architecture.md` for the source architecture document.
