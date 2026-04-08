import { verifyDiscordSignature } from '../utils/signature'
import { hasAdministratorPermission } from '../utils/permissions'
import {
  getLeaderboardChannel,
  upsertLeaderboardChannel,
  deleteLeaderboardChannel,
  deleteLeaderboardPost,
  addMonitoredChannel,
  deleteMonitoredChannel,
  getMonitoredChannelByLeaderboard,
  getLeaderboard,
} from '../db/queries'
import { fetchChannel } from '../services/discord'
import { formatLeaderboard } from '../services/leaderboard'
import type { Database, DiscordInteraction } from '../types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

type Verifier = (opts: { publicKey: string; timestamp: string; body: string; signature: string }) => Promise<boolean>

const ephemeralMessage = (content: string) => ({
  type: 4,
  data: { content, flags: 64 },
})

const guildGuard = (interaction: DiscordInteraction): Response | null => {
  if (!interaction.guild_id || !interaction.member) {
    return Response.json(ephemeralMessage('This command can only be used inside a guild.'), { status: 200 })
  }
  return null
}

const adminGuard = (interaction: DiscordInteraction): Response | null => {
  const perms = interaction.member?.permissions
  if (!perms || !hasAdministratorPermission(perms)) {
    return Response.json(ephemeralMessage('You need the Administrator permission to use this command.'), { status: 200 })
  }
  return null
}

// ─── Command handlers ─────────────────────────────────────────────────────────

async function handleLeaderboard(interaction: DiscordInteraction, db: Database, token: string): Promise<Response> {
  const channelOption = interaction.data?.options?.find((o) => o.name === 'channel')
  let targetChannelId = interaction.channel_id
  let targetChannelName = interaction.channel?.name ?? targetChannelId

  if (channelOption) {
    targetChannelId = String(channelOption.value)
    if (targetChannelId !== interaction.channel_id) {
      const fetchResult = await fetchChannel(token, targetChannelId)
      if (!fetchResult.isOk) {
        return Response.json(
          ephemeralMessage(`Failed to fetch channel information.`),
          { status: 200 },
        )
      }
      targetChannelName = fetchResult.value.name
    }
  }

  const lcResult = getLeaderboardChannel(db, targetChannelId)
  if (!lcResult.isOk) return Response.json(ephemeralMessage('Database error.'), { status: 200 })
  if (!lcResult.value) {
    return Response.json(
      ephemeralMessage(`<#${targetChannelId}> is not a leaderboard channel.`),
      { status: 200 },
    )
  }

  const channelName = targetChannelName ?? lcResult.value.channelName

  const monitoredResult = getMonitoredChannelByLeaderboard(db, targetChannelId)
  if (!monitoredResult.isOk) return Response.json(ephemeralMessage('Database error.'), { status: 200 })
  if (!monitoredResult.value) {
    return Response.json(
      ephemeralMessage(`No monitored channel is linked to <#${targetChannelId}> yet.`),
      { status: 200 },
    )
  }

  const lbResult = getLeaderboard(db, monitoredResult.value.channelId)
  if (!lbResult.isOk) return Response.json(ephemeralMessage('Database error.'), { status: 200 })

  const content = formatLeaderboard(channelName, lbResult.value)
  return Response.json(ephemeralMessage(content), { status: 200 })
}

function handleSetLeaderboardChannel(interaction: DiscordInteraction, db: Database): Response {
  const guard = guildGuard(interaction) ?? adminGuard(interaction)
  if (guard) return guard

  const channelId = interaction.channel_id
  const channelName = interaction.channel?.name ?? channelId
  const guildId = interaction.guild_id!
  const userId = 'unknown'

  const result = upsertLeaderboardChannel(db, { channelId, guildId, channelName, addedByUserId: userId })
  if (!result.isOk) return Response.json(ephemeralMessage('Database error.'), { status: 200 })

  return Response.json(
    ephemeralMessage(`<#${channelId}> has been set as a leaderboard channel.`),
    { status: 200 },
  )
}

function handleRemoveLeaderboardChannel(interaction: DiscordInteraction, db: Database): Response {
  const guard = guildGuard(interaction) ?? adminGuard(interaction)
  if (guard) return guard

  const channelId = interaction.channel_id

  const deletePostResult = deleteLeaderboardPost(db, channelId)
  if (!deletePostResult.isOk) return Response.json(ephemeralMessage('Database error.'), { status: 200 })

  const deleteResult = deleteLeaderboardChannel(db, channelId)
  if (!deleteResult.isOk) return Response.json(ephemeralMessage('Database error.'), { status: 200 })

  return Response.json(
    ephemeralMessage(`<#${channelId}> has been removed as a leaderboard channel.`),
    { status: 200 },
  )
}

function handleAddMonitoredChannel(interaction: DiscordInteraction, db: Database): Response {
  const guard = guildGuard(interaction) ?? adminGuard(interaction)
  if (guard) return guard

  const leaderboardChannelId = interaction.channel_id
  const guildId = interaction.guild_id!

  const lcResult = getLeaderboardChannel(db, leaderboardChannelId)
  if (!lcResult.isOk) return Response.json(ephemeralMessage('Database error.'), { status: 200 })
  if (!lcResult.value) {
    return Response.json(
      ephemeralMessage(
        `<#${leaderboardChannelId}> is not a leaderboard channel. Run /setleaderboardchannel first.`,
      ),
      { status: 200 },
    )
  }

  const channelOption = interaction.data?.options?.find((o) => o.name === 'channel')
  if (!channelOption) {
    return Response.json(ephemeralMessage('Missing channel option.'), { status: 200 })
  }
  const monitoredChannelId = String(channelOption.value)

  const existingResult = getMonitoredChannelByLeaderboard(db, leaderboardChannelId)
  if (!existingResult.isOk) return Response.json(ephemeralMessage('Database error.'), { status: 200 })
  if (existingResult.value && existingResult.value.channelId !== monitoredChannelId) {
    return Response.json(
      ephemeralMessage(
        `This leaderboard channel is already linked to <#${existingResult.value.channelId}>. Remove it first.`,
      ),
      { status: 200 },
    )
  }

  const addResult = addMonitoredChannel(db, { channelId: monitoredChannelId, guildId, leaderboardChannelId })
  if (!addResult.isOk) return Response.json(ephemeralMessage('Database error.'), { status: 200 })

  return Response.json(
    ephemeralMessage(`<#${monitoredChannelId}> is now being monitored for music uploads.`),
    { status: 200 },
  )
}

function handleRemoveMonitoredChannel(interaction: DiscordInteraction, db: Database): Response {
  const guard = guildGuard(interaction) ?? adminGuard(interaction)
  if (guard) return guard

  const channelOption = interaction.data?.options?.find((o) => o.name === 'channel')
  if (!channelOption) {
    return Response.json(ephemeralMessage('Missing channel option.'), { status: 200 })
  }
  const monitoredChannelId = String(channelOption.value)

  const deleteResult = deleteMonitoredChannel(db, monitoredChannelId)
  if (!deleteResult.isOk) return Response.json(ephemeralMessage('Database error.'), { status: 200 })

  return Response.json(
    ephemeralMessage(`<#${monitoredChannelId}> is no longer being monitored.`),
    { status: 200 },
  )
}

// ─── Router ───────────────────────────────────────────────────────────────────

async function routeInteraction(interaction: DiscordInteraction, db: Database, token: string): Promise<Response> {
  if (interaction.type === 1) {
    return Response.json({ type: 1 }, { status: 200 })
  }

  if (interaction.type === 2) {
    const commandName = interaction.data?.name

    switch (commandName) {
      case 'leaderboard':
        return handleLeaderboard(interaction, db, token)
      case 'setleaderboardchannel':
        return handleSetLeaderboardChannel(interaction, db)
      case 'removeleaderboardchannel':
        return handleRemoveLeaderboardChannel(interaction, db)
      case 'addmonitoredchannel':
        return handleAddMonitoredChannel(interaction, db)
      case 'removemonitoredchannel':
        return handleRemoveMonitoredChannel(interaction, db)
      default:
        return new Response('Unknown command', { status: 400 })
    }
  }

  return new Response('Unknown interaction type', { status: 400 })
}

// ─── 9.1 Signature verification ───────────────────────────────────────────────

export const handleInteractionWithVerifier = async (
  request: Request,
  db: Database,
  token: string,
  verifier: Verifier,
): Promise<Response> => {
  const signature = request.headers.get('x-signature-ed25519')
  const timestamp = request.headers.get('x-signature-timestamp')

  if (!signature || !timestamp) {
    return new Response('Missing signature headers', { status: 401 })
  }

  const body = await request.text()

  const valid = await verifier({ publicKey: '', timestamp, body, signature })
  if (!valid) {
    return new Response('Invalid signature', { status: 401 })
  }

  const interaction = JSON.parse(body) as DiscordInteraction
  return routeInteraction(interaction, db, token)
}

export const handleInteraction = async (
  request: Request,
  db: Database,
  token: string,
  publicKey: string,
): Promise<Response> => {
  return handleInteractionWithVerifier(request, db, token, ({ timestamp, body, signature }) =>
    verifyDiscordSignature({ publicKey, timestamp, body, signature }),
  )
}
