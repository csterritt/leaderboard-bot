import { Client, GatewayIntentBits } from 'discord.js'
import { Database } from 'bun:sqlite'
import { readFileSync } from 'fs'
import { join } from 'path'
import { setupGatewayHandler } from './handlers/gateway.js'
import { handleInteraction } from './handlers/interactions.js'
import { runScheduledWork } from './handlers/scheduled.js'
import { createShutdown } from './utils/shutdown.js'
import { logger } from './utils/logger.js'

// ─── 11.1 Environment ─────────────────────────────────────────────────────────

logger.log('[startup] reading environment configuration')
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN ?? ''
const DISCORD_PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY ?? ''
const DATABASE_PATH = process.env.DATABASE_PATH ?? 'leaderboard.db'
const HTTP_PORT = parseInt(process.env.PORT ?? '3000', 10)
logger.log(`[startup] DATABASE_PATH=${DATABASE_PATH} PORT=${HTTP_PORT}`)

// ─── 11.2 Database ────────────────────────────────────────────────────────────

logger.log('[startup] opening database')
const db = new Database(DATABASE_PATH)
db.exec('PRAGMA foreign_keys = ON')
const schema = readFileSync(join(import.meta.dirname, 'db/schema.sql'), 'utf8')
db.exec(schema)
logger.log('[startup] database schema applied')

// ─── 11.2a Migration: monitored_channels composite PK ────────────────────────

logger.log('[startup] checking monitored_channels schema migration')
{
  const cols = db
    .prepare('PRAGMA table_info(monitored_channels)')
    .all() as Array<{ name: string; pk: number }>
  const pkCols = cols.filter((c) => c.pk > 0).map((c) => c.name)
  const needsMigration =
    pkCols.length === 1 && pkCols[0] === 'channel_id'
  if (needsMigration) {
    logger.log('[startup] migrating monitored_channels to composite PK')
    db.exec(`
      BEGIN;
      CREATE TABLE IF NOT EXISTS monitored_channels_new (
        channel_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        leaderboard_channel_id TEXT NOT NULL
          REFERENCES leaderboard_channels(channel_id) ON DELETE CASCADE,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (channel_id, leaderboard_channel_id)
      );
      INSERT INTO monitored_channels_new (channel_id, guild_id, leaderboard_channel_id, added_at)
        SELECT channel_id, guild_id, leaderboard_channel_id, added_at FROM monitored_channels;
      DROP TABLE monitored_channels;
      ALTER TABLE monitored_channels_new RENAME TO monitored_channels;
      COMMIT;
    `)
    logger.log('[startup] monitored_channels migration complete')
  } else {
    logger.log('[startup] monitored_channels schema already up to date')
  }
}

// ─── 11.1 Discord client ──────────────────────────────────────────────────────

logger.log('[startup] creating Discord client')
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
})

// ─── 11.3 Gateway handler ─────────────────────────────────────────────────────

logger.log('[startup] setting up gateway handler')
setupGatewayHandler(client, db)

// ─── 11.5a Bot token ──────────────────────────────────────────────────────────

const token = `Bot ${DISCORD_BOT_TOKEN}`

// ─── 11.4 HTTP interactions server ────────────────────────────────────────────

logger.log(`[startup] starting HTTP server on port ${HTTP_PORT}`)
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

logger.log(`[startup] HTTP server listening on port ${server.port}`)

// ─── 11.5 Startup recovery pass ───────────────────────────────────────────────

logger.log('[startup] starting scheduled work pass (recovery + leaderboard refresh)')
runScheduledWork(db, token).then((result) => {
  if (!result.isOk) {
    logger.error('[startup] scheduled work failed:', result.error)
  } else {
    logger.log('[startup] startup scheduled work pass complete')
  }
})

// ─── 11.6 Hourly scheduled work ───────────────────────────────────────────────

logger.log('[startup] registering hourly scheduled work interval')
const intervalId = setInterval(() => {
  logger.log('[scheduled] hourly interval triggered')
  runScheduledWork(db, token).then((result) => {
    if (!result.isOk) {
      logger.error('[scheduled] hourly work failed:', result.error)
    }
  })
}, 3_600_000)

// ─── 11.7 Login ───────────────────────────────────────────────────────────────

logger.log('[startup] logging in to Discord')
client.login(DISCORD_BOT_TOKEN)

// ─── 11.8 Graceful shutdown ──────────────────────────────────────────────────

const shutdown = createShutdown({ server, client, db, intervalId })
process.on('SIGTERM', () => {
  logger.log('[startup] received SIGTERM')
  shutdown()
})
process.on('SIGINT', () => {
  logger.log('[startup] received SIGINT')
  shutdown()
})
logger.log('[startup] bot is ready')
