import type { Client } from 'discord.js'
import { normalizeGatewayMessage, processMessage } from '../services/processor'
import type { Database } from '../types'

// ─── 8.1 Gateway event dispatch ───────────────────────────────────────────────

export const setupGatewayHandler = (client: Client, db: Database): void => {
  client.on('messageCreate', (message) => {
    const normalized = normalizeGatewayMessage(message as never)
    const result = processMessage(db, normalized)
    if (!result.isOk) {
      console.error('processMessage error in gateway handler', result.error)
    }
  })
}
