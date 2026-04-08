import { Result } from 'true-myth'
import {
  getRecoveryState,
  upsertRecoveryState,
  getMonitoredChannels,
} from '../db/queries'
import { fetchMessagesAfter } from './discord'
import { processMessage } from './processor'
import { normalizeDiscordMessage } from './processor'
import type { Database } from '../types'

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
  const stateResult = getRecoveryState(db, channelId)
  if (!stateResult.isOk) return Result.err(stateResult.error)

  let cursor = stateResult.value?.lastProcessedMessageId ?? '0'
  let totalProcessed = 0

  while (true) {
    const fetchResult = await fetchMessagesAfter(token, channelId, cursor)
    if (!fetchResult.isOk) return Result.err(fetchResult.error)

    const messages = fetchResult.value
    if (messages.length === 0) break

    const sorted = [...messages].sort((a, b) => compareDiscordMessageIds(a.id, b.id))

    for (const raw of sorted) {
      const msg = normalizeDiscordMessage(raw)
      const processResult = processMessage(db, msg)
      if (!processResult.isOk) return Result.err(processResult.error)

      const advanceResult = upsertRecoveryState(db, {
        channelId,
        lastProcessedMessageId: raw.id,
      })
      if (!advanceResult.isOk) return Result.err(advanceResult.error)

      cursor = raw.id
      if (processResult.value) totalProcessed++
    }
  }

  return Result.ok(totalProcessed)
}

// ─── 7.2 recoverAllChannels ───────────────────────────────────────────────────

export const recoverAllChannels = async (
  db: Database,
  token: string,
): Promise<Result<void, Error>> => {
  const channelsResult = getMonitoredChannels(db)
  if (!channelsResult.isOk) return Result.err(channelsResult.error)

  for (const channel of channelsResult.value) {
    const result = await recoverChannel(db, token, channel.channelId)
    if (!result.isOk) return Result.err(result.error)
  }

  return Result.ok(undefined)
}
