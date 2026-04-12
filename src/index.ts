import { Client, GatewayIntentBits } from 'discord.js'
import { Database } from 'bun:sqlite'
import { readFileSync } from 'fs'
import { join } from 'path'
import { setupGatewayHandler } from './handlers/gateway'
import { handleInteraction } from './handlers/interactions'
import { runScheduledWork } from './handlers/scheduled'
import { recoverAllChannels } from './services/recovery'
import { createShutdown } from './utils/shutdown'

// ─── 11.1 Environment ─────────────────────────────────────────────────────────

console.log('[startup] reading environment configuration')
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN ?? ''
const DISCORD_PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY ?? ''
const DATABASE_PATH = process.env.DATABASE_PATH ?? 'leaderboard.db'
const HTTP_PORT = parseInt(process.env.PORT ?? '3000', 10)
console.log(`[startup] DATABASE_PATH=${DATABASE_PATH} PORT=${HTTP_PORT}`)

// ─── 11.2 Database ────────────────────────────────────────────────────────────

console.log('[startup] opening database')
const db = new Database(DATABASE_PATH)
db.exec('PRAGMA foreign_keys = ON')
const schema = readFileSync(join(import.meta.dirname, 'db/schema.sql'), 'utf8')
db.exec(schema)
console.log('[startup] database schema applied')

// ─── 11.1 Discord client ──────────────────────────────────────────────────────

console.log('[startup] creating Discord client')
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
})

// ─── 11.3 Gateway handler ─────────────────────────────────────────────────────

console.log('[startup] setting up gateway handler')
setupGatewayHandler(client, db)

// ─── 11.5a Bot token ──────────────────────────────────────────────────────────

const token = `Bot ${DISCORD_BOT_TOKEN}`

// ─── 11.4 HTTP interactions server ────────────────────────────────────────────

console.log(`[startup] starting HTTP server on port ${HTTP_PORT}`)
const server = Bun.serve({
  port: HTTP_PORT,
  async fetch(req) {
    const url = new URL(req.url)
    if (req.method === 'POST' && url.pathname === '/interactions') {
      return handleInteraction(req, db, token, DISCORD_PUBLIC_KEY)
    }
    return new Response('Not Found', { status: 404 })
  },
})

console.log(`[startup] HTTP server listening on port ${server.port}`)

// ─── 11.5 Startup recovery pass ───────────────────────────────────────────────

console.log('[startup] starting recovery pass')
recoverAllChannels(db, token).then((result) => {
  if (!result.isOk) {
    console.error('[startup] recovery failed:', result.error)
  } else {
    console.log('[startup] recovery pass complete')
  }
})

// ─── 11.6 Hourly scheduled work ───────────────────────────────────────────────

console.log('[startup] registering hourly scheduled work interval')
const intervalId = setInterval(() => {
  console.log('[scheduled] hourly interval triggered')
  runScheduledWork(db, token).then((result) => {
    if (!result.isOk) {
      console.error('[scheduled] hourly work failed:', result.error)
    }
  })
}, 3_600_000)

// ─── 11.7 Login ───────────────────────────────────────────────────────────────

console.log('[startup] logging in to Discord')
client.login(DISCORD_BOT_TOKEN)

// ─── 11.8 Graceful shutdown ──────────────────────────────────────────────────

const shutdown = createShutdown({ server, client, db, intervalId })
process.on('SIGTERM', () => {
  console.log('[startup] received SIGTERM')
  shutdown()
})
process.on('SIGINT', () => {
  console.log('[startup] received SIGINT')
  shutdown()
})
console.log('[startup] bot is ready')
