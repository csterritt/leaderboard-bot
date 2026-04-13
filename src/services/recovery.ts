import { Result } from 'true-myth'
import { getRecoveryState, upsertRecoveryState, getMonitoredChannels } from '../db/queries.js'
import { fetchMessagesAfter } from './discord.js'
import { processMessage } from './processor.js'
import { normalizeDiscordMessage } from './processor.js'
import type { Database } from '../types.js'
import { logger } from '../utils/logger.js'

const compareDiscordMessageIds = (left: string, right: string): number => {
  const numericPattern = /^\d+$/
  if (numericPattern.test(left) && numericPattern.test(right)) {
    const leftId = BigInt(left)
    const rightId = BigInt(right)
    if (leftId < rightId) return -1
    if (leftId > rightId) return 1
    return 0
  }

  if (left < right) return -1
  if (left > right) return 1
  return 0
}

// ─── 7.1 recoverChannel ───────────────────────────────────────────────────────

export const recoverChannel = async (
  db: Database,
  token: string,
  channelId: string,
): Promise<Result<number, Error>> => {
  logger.log(`[recovery] starting recovery for channel: ${channelId}`)
  const stateResult = getRecoveryState(db, channelId)
  if (!stateResult.isOk) {
    logger.error(`[recovery] failed to get recovery state for channel ${channelId}: ${stateResult.error}`)
    return Result.err(stateResult.error)
  }

  let cursor = stateResult.value?.lastProcessedMessageId ?? '0'
  let totalProcessed = 0

  while (true) {
    const fetchResult = await fetchMessagesAfter(token, channelId, cursor)
    if (!fetchResult.isOk) {
      logger.error(`[recovery] failed to fetch messages for channel ${channelId}: ${fetchResult.error}`)
      return Result.err(fetchResult.error)
    }

    const messages = fetchResult.value
    if (messages.length === 0) break

    const sorted = [...messages].sort((a, b) => compareDiscordMessageIds(a.id, b.id))

    for (const raw of sorted) {
      const msg = normalizeDiscordMessage(raw)
      const processResult = processMessage(db, msg)
      if (!processResult.isOk) {
        logger.error(`[recovery] failed to process message ${raw.id} in channel ${channelId}: ${processResult.error}`)
        return Result.err(processResult.error)
      }

      const advanceResult = upsertRecoveryState(db, {
        channelId,
        lastProcessedMessageId: raw.id,
      })
      if (!advanceResult.isOk) {
        logger.error(`[recovery] failed to advance recovery state for channel ${channelId}: ${advanceResult.error}`)
        return Result.err(advanceResult.error)
      }

      cursor = raw.id
      if (processResult.value) totalProcessed++
    }
  }

  logger.log(`[recovery] channel ${channelId}: processed ${totalProcessed} message(s)`)
  return Result.ok(totalProcessed)
}

// ─── 7.2 recoverAllChannels ───────────────────────────────────────────────────

export const recoverAllChannels = async (
  db: Database,
  token: string,
): Promise<Result<void, Error>> => {
  const channelsResult = getMonitoredChannels(db)
  if (!channelsResult.isOk) {
    logger.error(`[recovery] failed to get monitored channels: ${channelsResult.error}`)
    return Result.err(channelsResult.error)
  }

  logger.log(`[recovery] recovering ${channelsResult.value.length} channel(s)`)
  for (const channel of channelsResult.value) {
    const result = await recoverChannel(db, token, channel.channelId)
    if (!result.isOk) {
      logger.error(`[recovery] failed to recover channel ${channel.channelId}: ${result.error}`)
      return Result.err(result.error)
    }
  }

  logger.log('[recovery] all channels recovery complete')
  return Result.ok(undefined)
}
