import type { Client } from 'discord.js'
import { normalizeGatewayMessage, processMessage } from '../services/processor'
import type { Database } from '../types'

// ─── 8.1 Gateway event dispatch ───────────────────────────────────────────────

export const setupGatewayHandler = (client: Client, db: Database): void => {
  client.on('messageCreate', (message) => {
    const normalized = normalizeGatewayMessage(message as never)
    console.log(
      `[gateway] message received: id=${normalized.id} channelId=${normalized.channelId} authorId=${normalized.author.id}`,
    )
    const result = processMessage(db, normalized)
    if (!result.isOk) {
      console.error(`[gateway] processMessage error: id=${normalized.id}`, result.error)
    } else if (result.value) {
      console.log(`[gateway] message processed: id=${normalized.id}`)
    } else {
      console.log(`[gateway] message skipped: id=${normalized.id}`)
    }
  })
}
