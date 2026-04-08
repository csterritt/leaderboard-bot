import { Result } from 'true-myth'
import {
  getLeaderboardChannels,
  getMonitoredChannelByLeaderboard,
  getLeaderboard,
  getLeaderboardPost,
  upsertLeaderboardPost,
  deleteLeaderboardPost,
  pruneProcessedMessages,
} from '../db/queries'
import { recoverAllChannels } from '../services/recovery'
import { formatLeaderboard, hashContent } from '../services/leaderboard'
import { sendMessage, deleteMessage } from '../services/discord'
import { PRUNE_THRESHOLD_DAYS } from '../constants'
import type { Database } from '../types'

// ─── 10.1 runScheduledWork ────────────────────────────────────────────────────

export const runScheduledWork = async (
  db: Database,
  token: string,
): Promise<Result<void, Error>> => {
  const channelsResult = getLeaderboardChannels(db)
  if (!channelsResult.isOk) return Result.err(channelsResult.error)

  if (channelsResult.value.length === 0) return Result.ok(undefined)

  const recoveryResult = await recoverAllChannels(db, token)
  if (!recoveryResult.isOk) return Result.err(recoveryResult.error)

  for (const lc of channelsResult.value) {
    const monitoredResult = getMonitoredChannelByLeaderboard(db, lc.channelId)
    if (!monitoredResult.isOk) return Result.err(monitoredResult.error)

    const existingPostResult = getLeaderboardPost(db, lc.channelId)
    if (!existingPostResult.isOk) return Result.err(existingPostResult.error)

    if (!monitoredResult.value) {
      if (existingPostResult.value) {
        const delResult = await deleteMessage(token, lc.channelId, existingPostResult.value.messageId)
        if (!delResult.isOk) return Result.err(delResult.error)
        const dbDelResult = deleteLeaderboardPost(db, lc.channelId)
        if (!dbDelResult.isOk) return Result.err(dbDelResult.error)
      }
      continue
    }

    const monitoredChannelId = monitoredResult.value.channelId
    const rowsResult = getLeaderboard(db, monitoredChannelId)
    if (!rowsResult.isOk) return Result.err(rowsResult.error)

    const content = formatLeaderboard(lc.channelName, rowsResult.value)
    const newHash = hashContent(content)

    if (existingPostResult.value?.contentHash === newHash) continue

    if (existingPostResult.value) {
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
  }

  const pruneResult = pruneProcessedMessages(db, PRUNE_THRESHOLD_DAYS)
  if (!pruneResult.isOk) return Result.err(pruneResult.error)

  return Result.ok(undefined)
}
