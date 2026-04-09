import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { readFileSync } from 'fs'
import { join } from 'path'
import { setupGatewayHandler } from '../src/handlers/gateway'
import {
  addMonitoredChannel,
  upsertLeaderboardChannel,
  getUserStats,
  hasProcessedMessage,
} from '../src/db/queries'
import type { Database as DatabaseType } from '../src/types'
import { EventEmitter } from 'events'

const schema = readFileSync(join(import.meta.dirname, '../src/db/schema.sql'), 'utf8')

function makeDb(): DatabaseType {
  const db = new Database(':memory:')
  db.exec(schema)
  db.pragma('foreign_keys = ON')
  return db
}

const LC_ID = 'lc-001'
const MC_ID = 'mc-001'
const GUILD_ID = 'guild-001'
const USER_ID = 'user-001'

function seedChannels(db: DatabaseType) {
  upsertLeaderboardChannel(db, {
    channelId: LC_ID,
    guildId: GUILD_ID,
    channelName: '#leaderboard',
    addedByUserId: 'admin',
  })
  addMonitoredChannel(db, {
    channelId: MC_ID,
    guildId: GUILD_ID,
    leaderboardChannelId: LC_ID,
  })
}

function makeGatewayMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'msg-001',
    channelId: MC_ID,
    guildId: GUILD_ID,
    author: { id: USER_ID, username: 'alice', globalName: 'Alice', bot: false },
    member: { nickname: null },
    createdTimestamp: new Date('2024-01-01T12:00:00.000Z').getTime(),
    attachments: new Map([['att-1', { name: 'song.mp3', contentType: 'audio/mpeg' }]]),
    type: 0,
    ...overrides,
  }
}

class FakeClient extends EventEmitter {}

describe('setupGatewayHandler', () => {
  let db: DatabaseType
  let client: FakeClient

  beforeEach(() => {
    db = makeDb()
    seedChannels(db)
    client = new FakeClient()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('processes a valid messageCreate event and creates a DB row', () => {
    setupGatewayHandler(client as never, db)

    client.emit('messageCreate', makeGatewayMessage())

    const stats = getUserStats(db, MC_ID, USER_ID)
    expect(stats.isOk).toBe(true)
    expect(stats.value?.runCount).toBe(1)
  })

  it('claims the message ID after processing', () => {
    setupGatewayHandler(client as never, db)

    client.emit('messageCreate', makeGatewayMessage())

    const claimed = hasProcessedMessage(db, 'msg-001')
    expect(claimed.isOk).toBe(true)
    expect(claimed.value).toBe(true)
  })

  it('ignores bot messages before reaching processMessage', () => {
    setupGatewayHandler(client as never, db)

    const botMsg = makeGatewayMessage({
      author: { id: 'bot-1', username: 'mybot', globalName: null, bot: true },
    })
    client.emit('messageCreate', botMsg)

    const stats = getUserStats(db, MC_ID, USER_ID)
    expect(stats.isOk).toBe(true)
    expect(stats.value).toBeNull()
  })

  it('does not advance recovery_state on gateway processing', () => {
    setupGatewayHandler(client as never, db)

    client.emit('messageCreate', makeGatewayMessage())

    const row = db.prepare('SELECT * FROM recovery_state WHERE channel_id = ?').get(MC_ID)
    expect(row).toBeUndefined()
  })

  it('logs and does not throw when processMessage returns an error', () => {
    db.exec('DROP TABLE user_stats')
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    setupGatewayHandler(client as never, db)
    expect(() => {
      client.emit('messageCreate', makeGatewayMessage())
    }).not.toThrow()

    expect(consoleSpy).toHaveBeenCalled()
  })
})
