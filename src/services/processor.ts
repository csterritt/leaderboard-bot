import { Result } from 'true-myth'
import { ACCEPTED_MESSAGE_TYPES } from '../constants'
import { parseDiscordTimestamp } from '../utils/time'
import {
  isMonitoredChannel,
  getUserStats,
  upsertUserStats,
  claimProcessedMessage,
} from '../db/queries'
import { hasMusicAttachment, computeNewStats, resolveUsername } from './tracker'
import type { Database, NormalizedMessage, NormalizedAttachment, DiscordMessage } from '../types'

// ─── 4.1 Normalization helpers ────────────────────────────────────────────────

export const normalizeDiscordMessage = (raw: DiscordMessage): NormalizedMessage => ({
  id: raw.id,
  channelId: raw.channel_id,
  guildId: raw.guild_id,
  author: {
    id: raw.author.id,
    username: raw.author.username,
    globalName: raw.author.global_name,
    isBot: raw.author.bot === true,
  },
  member: raw.member ? { nick: raw.member.nick } : undefined,
  timestamp: raw.timestamp,
  attachments: raw.attachments.map((a) => ({
    filename: a.filename,
    contentType: a.content_type,
  })),
  type: raw.type,
})

interface GatewayAttachment {
  name?: string | null
  contentType?: string | null
}

interface GatewayAuthor {
  id: string
  username: string
  globalName: string | null
  bot?: boolean
}

interface GatewayMember {
  nickname?: string | null
}

interface GatewayMessage {
  id: string
  channelId: string
  guildId?: string
  author: GatewayAuthor
  member?: GatewayMember | null
  createdTimestamp: number
  attachments: Map<string, GatewayAttachment>
  type: number
}

export const normalizeGatewayMessage = (raw: GatewayMessage): NormalizedMessage => {
  const attachments: NormalizedAttachment[] = []
  for (const att of raw.attachments.values()) {
    attachments.push({
      filename: att.name ?? undefined,
      contentType: att.contentType ?? undefined,
    })
  }

  return {
    id: raw.id,
    channelId: raw.channelId,
    guildId: raw.guildId,
    author: {
      id: raw.author.id,
      username: raw.author.username,
      globalName: raw.author.globalName,
      isBot: raw.author.bot === true,
    },
    member: raw.member ? { nick: raw.member.nickname ?? null } : undefined,
    timestamp: new Date(raw.createdTimestamp).toISOString(),
    attachments,
    type: raw.type,
  }
}

// ─── 4.2 processMessage ───────────────────────────────────────────────────────

export const processMessage = (
  db: Database,
  message: NormalizedMessage,
): Result<boolean, Error> => {
  if (message.author.isBot) return Result.ok(false)
  if (!(ACCEPTED_MESSAGE_TYPES as readonly number[]).includes(message.type)) return Result.ok(false)
  if (!hasMusicAttachment(message.attachments)) return Result.ok(false)

  const monitoredResult = isMonitoredChannel(db, message.channelId)
  if (!monitoredResult.isOk) return Result.err(monitoredResult.error)
  if (!monitoredResult.value) return Result.ok(false)

  try {
    let processed = false

    db.transaction(() => {
      const claimResult = claimProcessedMessage(db, {
        messageId: message.id,
        channelId: message.channelId,
      })
      if (!claimResult.isOk) throw claimResult.error
      if (!claimResult.value) {
        return
      }

      const timestamp = parseDiscordTimestamp(message.timestamp)

      const existingResult = getUserStats(db, message.channelId, message.author.id)
      if (!existingResult.isOk) throw existingResult.error

      const username = resolveUsername(message.author, message.member)
      const newStats = computeNewStats(
        existingResult.value,
        timestamp,
        username,
        message.author.id,
        message.channelId,
      )

      const upsertResult = upsertUserStats(db, newStats)
      if (!upsertResult.isOk) throw upsertResult.error

      processed = true
    })()

    return Result.ok(processed)
  } catch (error) {
    return Result.err(error instanceof Error ? error : new Error(String(error)))
  }
}
