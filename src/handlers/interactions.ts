import { verifyDiscordSignature } from '../utils/signature.js'
import { hasAdministratorPermission } from '../utils/permissions.js'
import {
  getLeaderboardChannel,
  upsertLeaderboardChannel,
  deleteLeaderboardChannel,
  deleteLeaderboardPost,
  addMonitoredChannel,
  deleteMonitoredChannel,
  getMonitoredChannelsByLeaderboard,
  getLeaderboard,
  getLeaderboardPost,
  upsertLeaderboardPost,
} from '../db/queries.js'
import { fetchChannel, sendMessage, deleteMessage } from '../services/discord.js'
import { formatLeaderboard, formatMultiChannelLeaderboard, hashContent } from '../services/leaderboard.js'
import { recoverChannel } from '../services/recovery.js'
import type { Database, DiscordInteraction, LeaderboardRow } from '../types.js'
import { logger } from '../utils/logger.js'

// ─── Helpers ─────────────────────────────────────────────────────────────────

type Verifier = (opts: { timestamp: string; body: string; signature: string }) => Promise<boolean>

const ephemeralMessage = (content: string) => ({
  type: 4,
  data: { content, flags: 64 },
})

const guildGuard = (interaction: DiscordInteraction): Response | null => {
  if (!interaction.guild_id || !interaction.member) {
    return Response.json(ephemeralMessage('This command can only be used inside a guild.'), {
      status: 200,
    })
  }
  return null
}

const adminGuard = (interaction: DiscordInteraction): Response | null => {
  const perms = interaction.member?.permissions
  if (!perms || !hasAdministratorPermission(perms)) {
    return Response.json(
      ephemeralMessage('You need the Administrator permission to use this command.'),
      { status: 200 },
    )
  }
  return null
}

// ─── Command handlers ─────────────────────────────────────────────────────────

async function handleLeaderboard(
  interaction: DiscordInteraction,
  db: Database,
  token: string,
): Promise<Response> {
  const channelOption = interaction.data?.options?.find((o) => o.name === 'channel')
  let targetChannelId = interaction.channel_id
  let targetChannelName = interaction.channel?.name ?? targetChannelId

  if (channelOption) {
    targetChannelId = String(channelOption.value)
    if (targetChannelId !== interaction.channel_id) {
      const fetchResult = await fetchChannel(token, targetChannelId)
      if (!fetchResult.isOk) {
        return Response.json(ephemeralMessage(`Failed to fetch channel information.`), {
          status: 200,
        })
      }
      targetChannelName = fetchResult.value.name
    }
  }

  const lcResult = getLeaderboardChannel(db, targetChannelId)
  if (!lcResult.isOk) return Response.json(ephemeralMessage('Database error.'), { status: 200 })
  if (!lcResult.value) {
    return Response.json(ephemeralMessage(`<#${targetChannelId}> is not a leaderboard channel.`), {
      status: 200,
    })
  }

  const channelName = targetChannelName ?? lcResult.value.channelName

  const monitoredResult = getMonitoredChannelsByLeaderboard(db, targetChannelId)
  if (!monitoredResult.isOk)
    return Response.json(ephemeralMessage('Database error.'), { status: 200 })
  if (monitoredResult.value.length === 0) {
    return Response.json(
      ephemeralMessage(`No monitored channel is linked to <#${targetChannelId}> yet.`),
      { status: 200 },
    )
  }

  const sections: Array<{ channelName: string; rows: LeaderboardRow[] }> = []
  for (const mc of monitoredResult.value) {
    const lbResult = getLeaderboard(db, mc.channelId)
    if (!lbResult.isOk) return Response.json(ephemeralMessage('Database error.'), { status: 200 })
    sections.push({ channelName: mc.channelId, rows: lbResult.value })
  }

  const content =
    sections.length === 1
      ? formatLeaderboard(channelName, sections[0]!.rows)
      : formatMultiChannelLeaderboard(sections)
  return Response.json(ephemeralMessage(content), { status: 200 })
}

function handleSetLeaderboardChannel(interaction: DiscordInteraction, db: Database): Response {
  const guard = guildGuard(interaction) ?? adminGuard(interaction)
  if (guard) return guard

  const channelId = interaction.channel_id
  const channelName = interaction.channel?.name ?? channelId
  const guildId = interaction.guild_id!
  const userId = interaction.member?.user?.id ?? 'unknown'

  const result = upsertLeaderboardChannel(db, {
    channelId,
    guildId,
    channelName,
    addedByUserId: userId,
  })
  if (!result.isOk) return Response.json(ephemeralMessage('Database error.'), { status: 200 })

  return Response.json(ephemeralMessage(`<#${channelId}> has been set as a leaderboard channel.`), {
    status: 200,
  })
}

function handleRemoveLeaderboardChannel(interaction: DiscordInteraction, db: Database): Response {
  const guard = guildGuard(interaction) ?? adminGuard(interaction)
  if (guard) return guard

  const channelId = interaction.channel_id

  const deletePostResult = deleteLeaderboardPost(db, channelId)
  if (!deletePostResult.isOk)
    return Response.json(ephemeralMessage('Database error.'), { status: 200 })

  const deleteResult = deleteLeaderboardChannel(db, channelId)
  if (!deleteResult.isOk) return Response.json(ephemeralMessage('Database error.'), { status: 200 })

  return Response.json(
    ephemeralMessage(`<#${channelId}> has been removed as a leaderboard channel.`),
    { status: 200 },
  )
}

// ─── Recovery + leaderboard refresh (fire-and-forget) ───────────────────────

export const recoverAndRefreshLeaderboard = async (
  db: Database,
  token: string,
  monitoredChannelId: string,
  leaderboardChannelId: string,
): Promise<void> => {
  try {
    const recoveryResult = await recoverChannel(db, token, monitoredChannelId)
    if (!recoveryResult.isOk) {
      logger.error(
        `[interactions] recovery failed for channel ${monitoredChannelId}: ${recoveryResult.error}`,
      )
      return
    }

    const lcResult = getLeaderboardChannel(db, leaderboardChannelId)
    if (!lcResult.isOk || !lcResult.value) return

    const monitoredResult = getMonitoredChannelsByLeaderboard(db, leaderboardChannelId)
    if (!monitoredResult.isOk || monitoredResult.value.length === 0) return

    const sections: Array<{ channelName: string; rows: LeaderboardRow[] }> = []
    for (const mc of monitoredResult.value) {
      const rowsResult = getLeaderboard(db, mc.channelId)
      if (!rowsResult.isOk) return
      sections.push({ channelName: mc.channelId, rows: rowsResult.value })
    }

    const content =
      sections.length === 1
        ? formatLeaderboard(lcResult.value.channelName, sections[0]!.rows)
        : formatMultiChannelLeaderboard(sections)
    const newHash = hashContent(content)

    const existingPostResult = getLeaderboardPost(db, leaderboardChannelId)
    if (!existingPostResult.isOk) return

    if (existingPostResult.value?.contentHash === newHash) {
      logger.log(`[interactions] leaderboard unchanged for channel: ${leaderboardChannelId}`)
      return
    }

    if (existingPostResult.value) {
      const delResult = await deleteMessage(
        token,
        leaderboardChannelId,
        existingPostResult.value.messageId,
      )
      if (!delResult.isOk) return
    }

    const sendResult = await sendMessage(token, leaderboardChannelId, content)
    if (!sendResult.isOk) return

    upsertLeaderboardPost(db, {
      channelId: leaderboardChannelId,
      messageId: sendResult.value,
      contentHash: newHash,
    })
    logger.log(
      `[interactions] leaderboard post updated for channel: ${leaderboardChannelId}`,
    )
  } catch (error) {
    logger.error(
      `[interactions] recoverAndRefreshLeaderboard error: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

function handleAddMonitoredChannel(
  interaction: DiscordInteraction,
  db: Database,
  token: string,
): Response {
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

  const addResult = addMonitoredChannel(db, {
    channelId: monitoredChannelId,
    guildId,
    leaderboardChannelId,
  })
  if (!addResult.isOk) return Response.json(ephemeralMessage('Database error.'), { status: 200 })

  recoverAndRefreshLeaderboard(db, token, monitoredChannelId, leaderboardChannelId).catch(
    (error) => {
      logger.error(
        `[interactions] fire-and-forget error: ${error instanceof Error ? error.message : String(error)}`,
      )
    },
  )

  return Response.json(
    ephemeralMessage(`<#${monitoredChannelId}> is now being monitored for music uploads.`),
    { status: 200 },
  )
}

function handleRemoveMonitoredChannel(interaction: DiscordInteraction, db: Database): Response {
  const guard = guildGuard(interaction) ?? adminGuard(interaction)
  if (guard) return guard

  const leaderboardChannelId = interaction.channel_id

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

  const deleteResult = deleteMonitoredChannel(db, monitoredChannelId, leaderboardChannelId)
  if (!deleteResult.isOk) return Response.json(ephemeralMessage('Database error.'), { status: 200 })

  return Response.json(ephemeralMessage(`<#${monitoredChannelId}> is no longer being monitored.`), {
    status: 200,
  })
}

// ─── Router ───────────────────────────────────────────────────────────────────

async function routeInteraction(
  interaction: DiscordInteraction,
  db: Database,
  token: string,
): Promise<Response> {
  if (interaction.type === 1) {
    logger.log('[interactions] ping received')
    return Response.json({ type: 1 }, { status: 200 })
  }

  if (interaction.type === 2) {
    const commandName = interaction.data?.name
    logger.log(`[interactions] command received: ${commandName} id=${interaction.id}`)

    let response: Response
    switch (commandName) {
      case 'leaderboard':
        response = await handleLeaderboard(interaction, db, token)
        break
      case 'setleaderboardchannel':
        response = handleSetLeaderboardChannel(interaction, db)
        break
      case 'removeleaderboardchannel':
        response = handleRemoveLeaderboardChannel(interaction, db)
        break
      case 'addmonitoredchannel':
        response = handleAddMonitoredChannel(interaction, db, token)
        break
      case 'removemonitoredchannel':
        response = handleRemoveMonitoredChannel(interaction, db)
        break
      default:
        logger.warn(`[interactions] unknown command: ${commandName}`)
        return new Response('Unknown command', { status: 400 })
    }
    logger.log(`[interactions] command completed: ${commandName} status=${response.status}`)
    return response
  }

  logger.warn(`[interactions] unknown interaction type: ${interaction.type}`)
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
    logger.warn('[interactions] missing signature headers')
    return new Response('Missing signature headers', { status: 401 })
  }

  const body = await request.text()

  const valid = await verifier({ timestamp, body, signature })
  if (!valid) {
    logger.warn('[interactions] invalid signature')
    return new Response('Invalid signature', { status: 401 })
  }
  logger.log('[interactions] signature verified')

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
