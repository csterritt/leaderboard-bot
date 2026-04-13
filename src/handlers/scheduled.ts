import { Result } from 'true-myth'
import {
  getLeaderboardChannels,
  getMonitoredChannelByLeaderboard,
  getLeaderboard,
  getLeaderboardPost,
  upsertLeaderboardPost,
  deleteLeaderboardPost,
  pruneProcessedMessages,
} from '../db/queries.js'
import { recoverAllChannels } from '../services/recovery.js'
import { formatLeaderboard, hashContent } from '../services/leaderboard.js'
import { sendMessage, deleteMessage } from '../services/discord.js'
import { PRUNE_THRESHOLD_DAYS } from '../constants.js'
import type { Database } from '../types.js'
import { logger } from '../utils/logger.js'

// ─── 10.1 runScheduledWork ────────────────────────────────────────────────────

export const runScheduledWork = async (
  db: Database,
  token: string,
): Promise<Result<void, Error>> => {
  logger.log('[scheduled] starting scheduled work')
  const channelsResult = getLeaderboardChannels(db)
  if (!channelsResult.isOk) return Result.err(channelsResult.error)

  if (channelsResult.value.length === 0) {
    logger.log('[scheduled] no leaderboard channels configured, skipping')
    return Result.ok(undefined)
  }

  logger.log(`[scheduled] found ${channelsResult.value.length} leaderboard channel(s)`)
  const recoveryResult = await recoverAllChannels(db, token)
  if (!recoveryResult.isOk) return Result.err(recoveryResult.error)

  for (const lc of channelsResult.value) {
    logger.log(`[scheduled] processing leaderboard channel: ${lc.channelId} (${lc.channelName})`)
    const monitoredResult = getMonitoredChannelByLeaderboard(db, lc.channelId)
    if (!monitoredResult.isOk) return Result.err(monitoredResult.error)

    const existingPostResult = getLeaderboardPost(db, lc.channelId)
    if (!existingPostResult.isOk) return Result.err(existingPostResult.error)

    if (!monitoredResult.value) {
      if (existingPostResult.value) {
        logger.log(`[scheduled] removing orphaned leaderboard post for channel: ${lc.channelId}`)
        const delResult = await deleteMessage(
          token,
          lc.channelId,
          existingPostResult.value.messageId,
        )
        if (!delResult.isOk) return Result.err(delResult.error)
        const dbDelResult = deleteLeaderboardPost(db, lc.channelId)
        if (!dbDelResult.isOk) return Result.err(dbDelResult.error)
      } else {
        logger.log(`[scheduled] channel ${lc.channelId} has no linked monitored channel, skipping`)
      }
      continue
    }

    const monitoredChannelId = monitoredResult.value.channelId
    const rowsResult = getLeaderboard(db, monitoredChannelId)
    if (!rowsResult.isOk) return Result.err(rowsResult.error)

    const content = formatLeaderboard(lc.channelName, rowsResult.value)
    const newHash = hashContent(content)

    if (existingPostResult.value?.contentHash === newHash) {
      logger.log(`[scheduled] leaderboard unchanged for channel: ${lc.channelId}`)
      continue
    }

    if (existingPostResult.value) {
      logger.log(`[scheduled] deleting stale leaderboard message for channel: ${lc.channelId}`)
      const delResult = await deleteMessage(token, lc.channelId, existingPostResult.value.messageId)
      if (!delResult.isOk) return Result.err(delResult.error)
    }

    const sendResult = await sendMessage(token, lc.channelId, content)
    if (!sendResult.isOk) return Result.err(sendResult.error)

    const upsertResult = upsertLeaderboardPost(db, {
      channelId: lc.channelId,
      messageId: sendResult.value,
      contentHash: newHash,
    })
    if (!upsertResult.isOk) return Result.err(upsertResult.error)
    logger.log(`[scheduled] leaderboard post updated for channel: ${lc.channelId}`)
  }

  const pruneResult = pruneProcessedMessages(db, PRUNE_THRESHOLD_DAYS)
  if (!pruneResult.isOk) return Result.err(pruneResult.error)
  logger.log('[scheduled] pruned processed messages')

  logger.log('[scheduled] scheduled work complete')
  return Result.ok(undefined)
}
