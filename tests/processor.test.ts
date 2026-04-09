import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  processMessage,
  normalizeGatewayMessage,
  normalizeDiscordMessage,
} from '../src/services/processor'
import {
  addMonitoredChannel,
  upsertLeaderboardChannel,
  getUserStats,
  hasProcessedMessage,
} from '../src/db/queries'
import type { Database as DatabaseType, NormalizedMessage, DiscordMessage } from '../src/types'

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
    channelName: '#music-leaderboard',
    addedByUserId: 'admin',
  })
  addMonitoredChannel(db, {
    channelId: MC_ID,
    guildId: GUILD_ID,
    leaderboardChannelId: LC_ID,
  })
}

function makeMsg(overrides: Partial<NormalizedMessage> = {}): NormalizedMessage {
  return {
    id: 'msg-001',
    channelId: MC_ID,
    guildId: GUILD_ID,
    author: { id: USER_ID, username: 'alice', globalName: 'Alice', isBot: false },
    member: { nick: null },
    timestamp: '2024-01-01T12:00:00.000Z',
    attachments: [{ filename: 'song.mp3' }],
    type: 0,
    ...overrides,
  }
}

// ─── normalizeDiscordMessage ──────────────────────────────────────────────────

describe('normalizeDiscordMessage', () => {
  it('normalizes a REST DiscordMessage into a NormalizedMessage', () => {
    const raw: DiscordMessage = {
      id: 'msg-rest-001',
      channel_id: 'ch-001',
      guild_id: 'guild-001',
      author: { id: 'u1', username: 'bob', global_name: 'Bob', bot: false },
      member: { nick: 'B', permissions: '8' },
      timestamp: '2024-01-02T00:00:00.000Z',
      attachments: [{ id: 'att1', filename: 'track.ogg', content_type: 'audio/ogg' }],
      type: 0,
    }
    const msg = normalizeDiscordMessage(raw)
    expect(msg.id).toBe('msg-rest-001')
    expect(msg.channelId).toBe('ch-001')
    expect(msg.guildId).toBe('guild-001')
    expect(msg.author.id).toBe('u1')
    expect(msg.author.username).toBe('bob')
    expect(msg.author.globalName).toBe('Bob')
    expect(msg.author.isBot).toBe(false)
    expect(msg.member?.nick).toBe('B')
    expect(msg.timestamp).toBe('2024-01-02T00:00:00.000Z')
    expect(msg.attachments[0].filename).toBe('track.ogg')
    expect(msg.attachments[0].contentType).toBe('audio/ogg')
    expect(msg.type).toBe(0)
  })

  it('handles missing optional fields gracefully', () => {
    const raw: DiscordMessage = {
      id: 'msg-002',
      channel_id: 'ch-002',
      author: { id: 'u2', username: 'carol', global_name: null },
      timestamp: '2024-01-03T00:00:00.000Z',
      attachments: [],
      type: 19,
    }
    const msg = normalizeDiscordMessage(raw)
    expect(msg.guildId).toBeUndefined()
    expect(msg.member).toBeUndefined()
    expect(msg.author.isBot).toBe(false)
    expect(msg.author.globalName).toBeNull()
    expect(msg.attachments).toHaveLength(0)
    expect(msg.type).toBe(19)
  })

  it('preserves fields used by streak logic and attachment detection', () => {
    const raw: DiscordMessage = {
      id: 'msg-003',
      channel_id: 'ch-003',
      author: { id: 'u3', username: 'dave', global_name: null },
      timestamp: '2024-06-15T08:30:00.000Z',
      attachments: [{ id: 'att2', filename: 'mix.flac' }],
      type: 0,
    }
    const msg = normalizeDiscordMessage(raw)
    expect(msg.timestamp).toBe('2024-06-15T08:30:00.000Z')
    expect(msg.attachments[0].filename).toBe('mix.flac')
    expect(msg.attachments[0].contentType).toBeUndefined()
  })
})

// ─── normalizeGatewayMessage ──────────────────────────────────────────────────

describe('normalizeGatewayMessage', () => {
  it('normalizes a gateway-style message into the internal shape', () => {
    const gatewayMsg = {
      id: 'gw-001',
      channelId: 'ch-gw-001',
      guildId: 'guild-gw-001',
      author: { id: 'ua', username: 'eve', globalName: 'Eve', bot: false },
      member: { nickname: 'E-Nick', permissions: { has: () => true } },
      createdTimestamp: 1704067200000,
      attachments: new Map([['att-1', { name: 'beat.wav', contentType: 'audio/wav' }]]),
      type: 0,
    }
    const msg = normalizeGatewayMessage(gatewayMsg)
    expect(msg.id).toBe('gw-001')
    expect(msg.channelId).toBe('ch-gw-001')
    expect(msg.guildId).toBe('guild-gw-001')
    expect(msg.author.id).toBe('ua')
    expect(msg.author.username).toBe('eve')
    expect(msg.author.globalName).toBe('Eve')
    expect(msg.author.isBot).toBe(false)
    expect(msg.member?.nick).toBe('E-Nick')
    expect(msg.attachments[0].filename).toBe('beat.wav')
    expect(msg.attachments[0].contentType).toBe('audio/wav')
    expect(msg.type).toBe(0)
  })

  it('handles missing member and guild', () => {
    const gatewayMsg = {
      id: 'gw-002',
      channelId: 'ch-gw-002',
      guildId: undefined,
      author: { id: 'ub', username: 'frank', globalName: null, bot: false },
      member: null,
      createdTimestamp: 1704153600000,
      attachments: new Map(),
      type: 0,
    }
    const msg = normalizeGatewayMessage(gatewayMsg)
    expect(msg.guildId).toBeUndefined()
    expect(msg.member).toBeUndefined()
    expect(msg.attachments).toHaveLength(0)
  })

  it('preserves fields used by streak logic and attachment detection', () => {
    const ts = 1704240000000
    const gatewayMsg = {
      id: 'gw-003',
      channelId: 'ch-gw-003',
      guildId: 'g3',
      author: { id: 'uc', username: 'grace', globalName: null, bot: false },
      member: null,
      createdTimestamp: ts,
      attachments: new Map([['a1', { name: 'track.aac', contentType: null }]]),
      type: 0,
    }
    const msg = normalizeGatewayMessage(gatewayMsg)
    expect(msg.timestamp).toBe(new Date(ts).toISOString())
    expect(msg.attachments[0].filename).toBe('track.aac')
    expect(msg.attachments[0].contentType).toBeUndefined()
  })
})

// ─── processMessage ───────────────────────────────────────────────────────────

describe('processMessage', () => {
  let db: DatabaseType

  beforeEach(() => {
    db = makeDb()
    seedChannels(db)
  })

  it('ignores a message from a non-monitored channel', () => {
    const msg = makeMsg({ channelId: 'ch-not-monitored' })
    const result = processMessage(db, msg)
    expect(result.isOk).toBe(true)
    expect(result.value).toBe(false)
  })

  it('ignores a message with no supported music attachment', () => {
    const msg = makeMsg({ attachments: [{ filename: 'image.png' }] })
    const result = processMessage(db, msg)
    expect(result.isOk).toBe(true)
    expect(result.value).toBe(false)
  })

  it('ignores bot messages (author.isBot === true)', () => {
    const msg = makeMsg({
      author: { id: USER_ID, username: 'bot', globalName: null, isBot: true },
    })
    const result = processMessage(db, msg)
    expect(result.isOk).toBe(true)
    expect(result.value).toBe(false)
  })

  it('ignores messages with types not in ACCEPTED_MESSAGE_TYPES', () => {
    const msg = makeMsg({ type: 7 })
    const result = processMessage(db, msg)
    expect(result.isOk).toBe(true)
    expect(result.value).toBe(false)
  })

  it('skips processing when the message ID is already claimed', () => {
    const msg = makeMsg()
    processMessage(db, msg)
    const result = processMessage(db, msg)
    expect(result.isOk).toBe(true)
    expect(result.value).toBe(false)
  })

  it('processes a valid music message: claims ID, computes stats, upserts stats', () => {
    const msg = makeMsg()
    const result = processMessage(db, msg)
    expect(result.isOk).toBe(true)
    expect(result.value).toBe(true)

    const claimed = hasProcessedMessage(db, msg.id)
    expect(claimed.isOk).toBe(true)
    expect(claimed.value).toBe(true)

    const stats = getUserStats(db, MC_ID, USER_ID)
    expect(stats.isOk).toBe(true)
    expect(stats.value?.runCount).toBe(1)
    expect(stats.value?.highestRunSeen).toBe(1)
  })

  it('does not advance recovery_state', () => {
    const msg = makeMsg()
    processMessage(db, msg)
    const row = db.prepare('SELECT * FROM recovery_state WHERE channel_id = ?').get(MC_ID)
    expect(row).toBeUndefined()
  })

  it('performs claim + stats mutation in a single transaction (atomically)', () => {
    const msg = makeMsg()
    const result = processMessage(db, msg)
    expect(result.isOk).toBe(true)
    const claimedAfter = hasProcessedMessage(db, msg.id)
    const statsAfter = getUserStats(db, MC_ID, USER_ID)
    expect(claimedAfter.value).toBe(true)
    expect(statsAfter.value).not.toBeNull()
  })

  it('rolls back the claim when stats mutation fails (broken DB state)', () => {
    db.exec('DROP TABLE user_stats')
    const msg = makeMsg()
    const result = processMessage(db, msg)
    expect(result.isOk).toBe(false)
    const claimed = db.prepare('SELECT 1 FROM processed_messages WHERE message_id = ?').get(msg.id)
    expect(claimed).toBeUndefined()
  })

  it('accumulates run_count on successive valid messages from same user', () => {
    const msg1 = makeMsg({ id: 'msg-a', timestamp: '2024-01-01T12:00:00.000Z' })
    const msg2 = makeMsg({ id: 'msg-b', timestamp: '2024-01-02T00:00:01.000Z' })
    processMessage(db, msg1)
    processMessage(db, msg2)
    const stats = getUserStats(db, MC_ID, USER_ID)
    expect(stats.value?.runCount).toBe(2)
  })

  it('accepts type 19 (REPLY) messages', () => {
    const msg = makeMsg({ type: 19 })
    const result = processMessage(db, msg)
    expect(result.isOk).toBe(true)
    expect(result.value).toBe(true)
  })
})
