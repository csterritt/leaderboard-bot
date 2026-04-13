// ─── 12.1 register-commands.ts ────────────────────────────────────────────────
// Run via: bun run src/scripts/register-commands.ts
// Registers all slash commands via PUT /applications/{application_id}/commands

import { logger } from '../utils/logger.js'

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN ?? ''
const DISCORD_APPLICATION_ID = process.env.DISCORD_APPLICATION_ID ?? ''

if (!DISCORD_BOT_TOKEN || !DISCORD_APPLICATION_ID) {
  logger.error('DISCORD_BOT_TOKEN and DISCORD_APPLICATION_ID must be set')
  process.exit(1)
}

const commands = [
  {
    name: 'leaderboard',
    description: 'Show the music leaderboard for a channel',
    options: [
      {
        name: 'channel',
        description: 'The leaderboard channel to display (defaults to current channel)',
        type: 7, // CHANNEL
        required: false,
        channel_types: [0], // GUILD_TEXT
      },
    ],
  },
  {
    name: 'setleaderboardchannel',
    description: 'Designate the current channel as a leaderboard channel',
  },
  {
    name: 'removeleaderboardchannel',
    description: 'Remove the current channel as a leaderboard channel',
  },
  {
    name: 'addmonitoredchannel',
    description:
      'Add a channel to monitor for music uploads, linked to the current leaderboard channel',
    options: [
      {
        name: 'channel',
        description: 'The channel to monitor for music uploads',
        type: 7, // CHANNEL
        required: true,
        channel_types: [0], // GUILD_TEXT
      },
    ],
  },
  {
    name: 'removemonitoredchannel',
    description: 'Stop monitoring a channel for music uploads',
    options: [
      {
        name: 'channel',
        description: 'The channel to stop monitoring',
        type: 7, // CHANNEL
        required: true,
        channel_types: [0], // GUILD_TEXT
      },
    ],
  },
]

const url = `https://discord.com/api/v10/applications/${DISCORD_APPLICATION_ID}/commands`

const response = await fetch(url, {
  method: 'PUT',
  headers: {
    Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(commands),
})

if (!response.ok) {
  const body = await response.text()
  logger.error(`Failed to register commands: ${response.status}`, body)
  process.exit(1)
}

const registered = await response.json()
logger.log(`Registered ${(registered as unknown[]).length} slash command(s) successfully`)
