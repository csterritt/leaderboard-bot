import { Client, GatewayIntentBits } from 'discord.js'
import Database from 'better-sqlite3'
import { readFileSync } from 'fs'
import { join } from 'path'
import { setupGatewayHandler } from './handlers/gateway'
import { handleInteraction } from './handlers/interactions'
import { runScheduledWork } from './handlers/scheduled'
import { recoverAllChannels } from './services/recovery'

// ─── 11.1 Environment ─────────────────────────────────────────────────────────

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN ?? ''
const DISCORD_PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY ?? ''
const DATABASE_PATH = process.env.DATABASE_PATH ?? 'leaderboard.db'
const HTTP_PORT = parseInt(process.env.PORT ?? '3000', 10)

// ─── 11.2 Database ────────────────────────────────────────────────────────────

const db = new Database(DATABASE_PATH)
db.pragma('foreign_keys = ON')
const schema = readFileSync(join(import.meta.dirname, 'db/schema.sql'), 'utf8')
db.exec(schema)

// ─── 11.1 Discord client ──────────────────────────────────────────────────────

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
})

// ─── 11.3 Gateway handler ─────────────────────────────────────────────────────

setupGatewayHandler(client, db)

// ─── 11.4 HTTP interactions server ────────────────────────────────────────────

const server = Bun.serve({
  port: HTTP_PORT,
  async fetch(req) {
    const url = new URL(req.url)
    if (req.method === 'POST' && url.pathname === '/interactions') {
      return handleInteraction(req, db, DISCORD_BOT_TOKEN, DISCORD_PUBLIC_KEY)
    }
    return new Response('Not Found', { status: 404 })
  },
})

console.log(`HTTP server listening on port ${server.port}`)

// ─── 11.5 Startup recovery pass ───────────────────────────────────────────────

const token = `Bot ${DISCORD_BOT_TOKEN}`

recoverAllChannels(db, token).then((result) => {
  if (!result.isOk) {
    console.error('Startup recovery failed:', result.error)
  } else {
    console.log('Startup recovery complete')
  }
})

// ─── 11.6 Hourly scheduled work ───────────────────────────────────────────────

setInterval(() => {
  runScheduledWork(db, token).then((result) => {
    if (!result.isOk) {
      console.error('Scheduled work failed:', result.error)
    }
  })
}, 3_600_000)

// ─── 11.7 Login ───────────────────────────────────────────────────────────────

client.login(DISCORD_BOT_TOKEN)
