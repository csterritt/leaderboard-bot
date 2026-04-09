import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  addMonitoredChannel,
  upsertLeaderboardChannel,
  getRecoveryState,
  hasProcessedMessage,
  getMonitoredChannels,
} from '../src/db/queries'
import { recoverChannel, recoverAllChannels } from '../src/services/recovery'
import type { Database as DatabaseType, DiscordMessage } from '../src/types'

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
const TOKEN = 'Bot test-token'

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

function makeDiscordMessage(overrides: Partial<DiscordMessage> = {}): DiscordMessage {
  return {
    id: 'msg-001',
    channel_id: MC_ID,
    guild_id: GUILD_ID,
    author: { id: 'user-001', username: 'alice', global_name: 'Alice', bot: false },
    timestamp: '2024-01-01T12:00:00.000Z',
    attachments: [{ id: 'att-1', filename: 'song.mp3' }],
    type: 0,
    ...overrides,
  }
}

// ─── recoverChannel ───────────────────────────────────────────────────────────

describe('recoverChannel', () => {
  let db: DatabaseType

  beforeEach(() => {
    db = makeDb()
    seedChannels(db)
    vi.resetAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('begins from after=0 when last_processed_message_id is null (no prior state)', async () => {
    const capturedUrls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        capturedUrls.push(String(url))
        return new Response(JSON.stringify([]), { status: 200 })
      }),
    )

    await recoverChannel(db, TOKEN, MC_ID)
    expect(capturedUrls[0]).toContain('after=0')
  })

  it('begins from last_processed_message_id when recovery state exists', async () => {
    db.prepare(`
      INSERT INTO recovery_state (channel_id, last_processed_message_id)
      VALUES (?, ?)
    `).run(MC_ID, 'msg-checkpoint-99')

    const capturedUrls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        capturedUrls.push(String(url))
        return new Response(JSON.stringify([]), { status: 200 })
      }),
    )

    await recoverChannel(db, TOKEN, MC_ID)
    expect(capturedUrls[0]).toContain('after=msg-checkpoint-99')
  })

  it('processes messages from oldest to newest (sorted by id ascending)', async () => {
    const processedOrder: string[] = []
    const msgs: DiscordMessage[] = [
      makeDiscordMessage({ id: 'msg-300', timestamp: '2024-01-03T12:00:00.000Z' }),
      makeDiscordMessage({ id: 'msg-100', timestamp: '2024-01-01T12:00:00.000Z' }),
      makeDiscordMessage({ id: 'msg-200', timestamp: '2024-01-02T12:00:00.000Z' }),
    ]

    let callCount = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        callCount++
        if (callCount === 1) {
          return new Response(JSON.stringify(msgs), { status: 200 })
        }
        return new Response(JSON.stringify([]), { status: 200 })
      }),
    )

    await recoverChannel(db, TOKEN, MC_ID)

    const state = getRecoveryState(db, MC_ID)
    expect(state.isOk).toBe(true)
    expect(state.value?.lastProcessedMessageId).toBe('msg-300')
  })

  it('processes numeric Discord snowflake IDs in numeric order rather than lexicographic order', async () => {
    const msgs: DiscordMessage[] = [
      makeDiscordMessage({ id: '10', timestamp: '2024-01-03T12:00:00.000Z' }),
      makeDiscordMessage({ id: '2', timestamp: '2024-01-02T12:00:00.000Z' }),
      makeDiscordMessage({ id: '1', timestamp: '2024-01-01T12:00:00.000Z' }),
    ]

    let callCount = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        callCount++
        if (callCount === 1) {
          return new Response(JSON.stringify(msgs), { status: 200 })
        }
        return new Response(JSON.stringify([]), { status: 200 })
      }),
    )

    const result = await recoverChannel(db, TOKEN, MC_ID)
    expect(result.isOk).toBe(true)

    const state = getRecoveryState(db, MC_ID)
    expect(state.isOk).toBe(true)
    expect(state.value?.lastProcessedMessageId).toBe('10')
  })

  it('skips already-processed message IDs safely (idempotent)', async () => {
    const msg = makeDiscordMessage({ id: 'msg-already-done' })
    db.prepare(`
      INSERT INTO processed_messages (message_id, channel_id)
      VALUES (?, ?)
    `).run('msg-already-done', MC_ID)

    let callCount = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        callCount++
        if (callCount === 1) return new Response(JSON.stringify([msg]), { status: 200 })
        return new Response(JSON.stringify([]), { status: 200 })
      }),
    )

    const result = await recoverChannel(db, TOKEN, MC_ID)
    expect(result.isOk).toBe(true)
    const state = getRecoveryState(db, MC_ID)
    expect(state.value?.lastProcessedMessageId).toBe('msg-already-done')
  })

  it('advances recovery_state with the highest successfully processed message ID', async () => {
    const msgs: DiscordMessage[] = [
      makeDiscordMessage({ id: 'msg-001', timestamp: '2024-01-01T12:00:00.000Z' }),
      makeDiscordMessage({ id: 'msg-002', timestamp: '2024-01-02T12:00:00.000Z' }),
    ]

    let callCount = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        callCount++
        if (callCount === 1) return new Response(JSON.stringify(msgs), { status: 200 })
        return new Response(JSON.stringify([]), { status: 200 })
      }),
    )

    const result = await recoverChannel(db, TOKEN, MC_ID)
    expect(result.isOk).toBe(true)
    const state = getRecoveryState(db, MC_ID)
    expect(state.value?.lastProcessedMessageId).toBe('msg-002')
  })

  it('does not advance the checkpoint beyond a failed message', async () => {
    const msgs: DiscordMessage[] = [
      makeDiscordMessage({ id: 'msg-001', timestamp: '2024-01-01T12:00:00.000Z' }),
      makeDiscordMessage({ id: 'msg-002', timestamp: '2024-01-02T12:00:00.000Z' }),
    ]

    let callCount = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        callCount++
        if (callCount === 1) return new Response(JSON.stringify(msgs), { status: 200 })
        return new Response(JSON.stringify([]), { status: 200 })
      }),
    )

    db.exec('DROP TABLE user_stats')

    const result = await recoverChannel(db, TOKEN, MC_ID)
    expect(result.isOk).toBe(false)
    const state = getRecoveryState(db, MC_ID)
    expect(state.value).toBeNull()
  })

  it('loops through multiple pages until an empty page is returned', async () => {
    const page1: DiscordMessage[] = [
      makeDiscordMessage({ id: 'msg-001', timestamp: '2024-01-01T12:00:00.000Z' }),
    ]
    const page2: DiscordMessage[] = [
      makeDiscordMessage({ id: 'msg-002', timestamp: '2024-01-02T12:00:00.000Z' }),
    ]

    let callCount = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        callCount++
        if (callCount === 1) return new Response(JSON.stringify(page1), { status: 200 })
        if (callCount === 2) return new Response(JSON.stringify(page2), { status: 200 })
        return new Response(JSON.stringify([]), { status: 200 })
      }),
    )

    const result = await recoverChannel(db, TOKEN, MC_ID)
    expect(result.isOk).toBe(true)
    expect(callCount).toBe(3)
    const state = getRecoveryState(db, MC_ID)
    expect(state.value?.lastProcessedMessageId).toBe('msg-002')
  })

  it('uses the last processed message ID as the cursor for the next page fetch', async () => {
    const page1: DiscordMessage[] = [makeDiscordMessage({ id: 'msg-page1' })]

    const capturedUrls: string[] = []
    let callCount = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        capturedUrls.push(String(url))
        callCount++
        if (callCount === 1) return new Response(JSON.stringify(page1), { status: 200 })
        return new Response(JSON.stringify([]), { status: 200 })
      }),
    )

    await recoverChannel(db, TOKEN, MC_ID)
    expect(capturedUrls[1]).toContain('after=msg-page1')
  })

  it('returns Result.err when fetchMessagesAfter fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response('Server Error', { status: 500 })
      }),
    )

    const result = await recoverChannel(db, TOKEN, MC_ID)
    expect(result.isOk).toBe(false)
  })
})

// ─── recoverAllChannels ───────────────────────────────────────────────────────

describe('recoverAllChannels', () => {
  let db: DatabaseType

  beforeEach(() => {
    db = makeDb()
    vi.resetAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls recoverChannel for each monitored channel', async () => {
    upsertLeaderboardChannel(db, {
      channelId: 'lc-1',
      guildId: GUILD_ID,
      channelName: '#lb1',
      addedByUserId: 'admin',
    })
    upsertLeaderboardChannel(db, {
      channelId: 'lc-2',
      guildId: GUILD_ID,
      channelName: '#lb2',
      addedByUserId: 'admin',
    })
    addMonitoredChannel(db, { channelId: 'mc-1', guildId: GUILD_ID, leaderboardChannelId: 'lc-1' })
    addMonitoredChannel(db, { channelId: 'mc-2', guildId: GUILD_ID, leaderboardChannelId: 'lc-2' })

    const capturedUrls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        capturedUrls.push(String(url))
        return new Response(JSON.stringify([]), { status: 200 })
      }),
    )

    const result = await recoverAllChannels(db, TOKEN)
    expect(result.isOk).toBe(true)

    const touchedChannels = capturedUrls.map((u) => {
      const m = u.match(/channels\/([^/]+)\/messages/)
      return m?.[1]
    })
    expect(touchedChannels).toContain('mc-1')
    expect(touchedChannels).toContain('mc-2')
  })

  it('succeeds when there are no monitored channels', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify([]), { status: 200 })),
    )

    const result = await recoverAllChannels(db, TOKEN)
    expect(result.isOk).toBe(true)
  })
})
