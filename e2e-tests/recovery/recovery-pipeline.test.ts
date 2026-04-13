/**
 * E2E: Recovery pipeline
 *
 * Tests the full recovery flow: fetching historical messages from the Discord REST API
 * (stubbed), processing them through processMessage, advancing the checkpoint, and
 * correctly building user_stats in the DB — all exercised together end-to-end.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Database } from 'bun:sqlite'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  addMonitoredChannel,
  upsertLeaderboardChannel,
  getUserStats,
  getRecoveryState,
  hasProcessedMessage,
} from '../../src/db/queries.js'
import { recoverChannel, recoverAllChannels } from '../../src/services/recovery.js'
import { _resetRateLimit } from '../../src/services/discord.js'
import { createClock } from '../../src/utils/clock.js'
import type { Database as DatabaseType, DiscordMessage } from '../../src/types.js'
import { logger } from '../../src/utils/logger.js'

const schema = readFileSync(join(import.meta.dirname, '../../src/db/schema.sql'), 'utf8')

function makeDb(): DatabaseType {
  const db = new Database(':memory:')
  db.exec(schema)
  db.exec('PRAGMA foreign_keys = ON')
  return db
}

const LC_ID = 'lc-e2e-recovery'
const MC_ID = 'mc-e2e-recovery'
const GUILD_ID = 'guild-e2e'
const TOKEN = 'Bot e2e-test-token'

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

function makeDiscordMessage(
  id: string,
  userId: string,
  timestampSecs: number,
  overrides: Partial<DiscordMessage> = {},
): DiscordMessage {
  return {
    id,
    channel_id: MC_ID,
    guild_id: GUILD_ID,
    author: { id: userId, username: userId, global_name: userId, bot: false },
    timestamp: new Date(timestampSecs * 1000).toISOString(),
    attachments: [{ id: `att-${id}`, filename: 'track.mp3' }],
    type: 0,
    ...overrides,
  }
}

describe('recovery pipeline (e2e)', () => {
  let db: DatabaseType
  let clock: ReturnType<typeof createClock>

  beforeEach(() => {
    db = makeDb()
    seedChannels(db)
    clock = createClock()
    clock.set(1_700_000_000)
    _resetRateLimit()
    vi.resetAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('recovers a single-page channel: builds stats and sets checkpoint', async () => {
    const t0 = clock.now()
    const messages: DiscordMessage[] = [
      makeDiscordMessage('msg-001', 'alice', t0),
      makeDiscordMessage('msg-002', 'alice', t0 + 12 * 3600),
      makeDiscordMessage('msg-003', 'alice', t0 + 24 * 3600),
    ]

    let call = 0
    global.fetch = vi.fn(async () => {
      call++
      return call === 1
        ? new Response(JSON.stringify(messages), { status: 200 })
        : new Response(JSON.stringify([]), { status: 200 })
    }) as any

    const result = await recoverChannel(db, TOKEN, MC_ID)
    expect(result.isOk).toBe(true)
    expect(result.value).toBe(3)

    const stats = getUserStats(db, MC_ID, 'alice')
    expect(stats.isOk).toBe(true)
    expect(stats.value?.runCount).toBe(3)
    expect(stats.value?.highestRunSeen).toBe(3)

    const checkpoint = getRecoveryState(db, MC_ID)
    expect(checkpoint.value?.lastProcessedMessageId).toBe('msg-003')
  })

  it('recovers a paginated channel across multiple pages', async () => {
    const t0 = clock.now()
    const page1: DiscordMessage[] = [makeDiscordMessage('msg-100', 'bob', t0)]
    const page2: DiscordMessage[] = [makeDiscordMessage('msg-200', 'bob', t0 + 12 * 3600)]
    const page3: DiscordMessage[] = [makeDiscordMessage('msg-300', 'bob', t0 + 24 * 3600)]

    let call = 0
    global.fetch = vi.fn(async () => {
      call++
      if (call === 1) return new Response(JSON.stringify(page1), { status: 200 })
      if (call === 2) return new Response(JSON.stringify(page2), { status: 200 })
      if (call === 3) return new Response(JSON.stringify(page3), { status: 200 })
      return new Response(JSON.stringify([]), { status: 200 })
    }) as any

    const result = await recoverChannel(db, TOKEN, MC_ID)
    expect(result.isOk).toBe(true)
    expect(result.value).toBe(3)
    expect(call).toBe(4)

    const stats = getUserStats(db, MC_ID, 'bob')
    expect(stats.value?.runCount).toBe(3)

    const checkpoint = getRecoveryState(db, MC_ID)
    expect(checkpoint.value?.lastProcessedMessageId).toBe('msg-300')
  })

  it('resumes from saved checkpoint on a second recovery pass', async () => {
    const t0 = clock.now()
    const firstBatch: DiscordMessage[] = [
      makeDiscordMessage('msg-001', 'carol', t0),
      makeDiscordMessage('msg-002', 'carol', t0 + 12 * 3600),
    ]

    let call = 0
    global.fetch = vi.fn(async () => {
      call++
      return call === 1
        ? new Response(JSON.stringify(firstBatch), { status: 200 })
        : new Response(JSON.stringify([]), { status: 200 })
    }) as any

    await recoverChannel(db, TOKEN, MC_ID)
    vi.restoreAllMocks()

    const secondBatch: DiscordMessage[] = [makeDiscordMessage('msg-003', 'carol', t0 + 24 * 3600)]
    const capturedUrls: string[] = []
    global.fetch = vi.fn(async (url: string) => {
      capturedUrls.push(String(url))
      call++
      return call === 3
        ? new Response(JSON.stringify(secondBatch), { status: 200 })
        : new Response(JSON.stringify([]), { status: 200 })
    }) as any

    const result = await recoverChannel(db, TOKEN, MC_ID)
    expect(result.isOk).toBe(true)

    expect(capturedUrls[0]).toContain('after=msg-002')

    const stats = getUserStats(db, MC_ID, 'carol')
    expect(stats.value?.runCount).toBe(3)
  })

  it('skips already-processed messages and still advances checkpoint', async () => {
    const t0 = clock.now()
    const msg = makeDiscordMessage('msg-pre-claimed', 'dave', t0)
    db.prepare('INSERT INTO processed_messages (message_id, channel_id) VALUES (?, ?)').run(
      'msg-pre-claimed',
      MC_ID,
    )

    let call = 0
    global.fetch = vi.fn(async () => {
      call++
      return call === 1
        ? new Response(JSON.stringify([msg]), { status: 200 })
        : new Response(JSON.stringify([]), { status: 200 })
    }) as any

    const result = await recoverChannel(db, TOKEN, MC_ID)
    expect(result.isOk).toBe(true)
    expect(result.value).toBe(0)

    const checkpoint = getRecoveryState(db, MC_ID)
    expect(checkpoint.value?.lastProcessedMessageId).toBe('msg-pre-claimed')

    const stats = getUserStats(db, MC_ID, 'dave')
    expect(stats.value).toBeNull()
  })

  it('handles a mix of music and non-music messages: only music is processed', async () => {
    const t0 = clock.now()
    const messages: DiscordMessage[] = [
      makeDiscordMessage('msg-music', 'eve', t0),
      makeDiscordMessage('msg-image', 'eve', t0 + 12 * 3600, {
        attachments: [{ id: 'img-att', filename: 'photo.png' }],
      }),
      makeDiscordMessage('msg-music-2', 'eve', t0 + 24 * 3600),
    ]

    let call = 0
    global.fetch = vi.fn(async () => {
      call++
      return call === 1
        ? new Response(JSON.stringify(messages), { status: 200 })
        : new Response(JSON.stringify([]), { status: 200 })
    }) as any

    const result = await recoverChannel(db, TOKEN, MC_ID)
    expect(result.isOk).toBe(true)
    expect(result.value).toBe(2)

    const stats = getUserStats(db, MC_ID, 'eve')
    expect(stats.value?.runCount).toBe(2)

    const imageClaimed = hasProcessedMessage(db, 'msg-image')
    expect(imageClaimed.value).toBe(false)
  })

  it('builds stats for multiple users from a mixed recovery batch', async () => {
    const t0 = clock.now()
    const messages: DiscordMessage[] = [
      makeDiscordMessage('msg-alice-1', 'alice', t0),
      makeDiscordMessage('msg-bob-1', 'bob', t0 + 1),
      makeDiscordMessage('msg-alice-2', 'alice', t0 + 12 * 3600),
      makeDiscordMessage('msg-bob-2', 'bob', t0 + 12 * 3600 + 1),
      makeDiscordMessage('msg-alice-3', 'alice', t0 + 24 * 3600),
    ]

    let call = 0
    global.fetch = vi.fn(async () => {
      call++
      return call === 1
        ? new Response(JSON.stringify(messages), { status: 200 })
        : new Response(JSON.stringify([]), { status: 200 })
    }) as any

    await recoverChannel(db, TOKEN, MC_ID)

    const alice = getUserStats(db, MC_ID, 'alice')
    const bob = getUserStats(db, MC_ID, 'bob')

    expect(alice.value?.runCount).toBe(3)
    expect(bob.value?.runCount).toBe(2)
  })

  it('recoverAllChannels processes every monitored channel', async () => {
    const LC2 = 'lc-e2e-recovery-2'
    const MC2 = 'mc-e2e-recovery-2'
    upsertLeaderboardChannel(db, {
      channelId: LC2,
      guildId: GUILD_ID,
      channelName: '#lb2',
      addedByUserId: 'admin',
    })
    addMonitoredChannel(db, { channelId: MC2, guildId: GUILD_ID, leaderboardChannelId: LC2 })

    const t0 = clock.now()
    global.fetch = vi.fn(async (url: string) => {
      const channelId = (url as string).match(/channels\/([^/]+)\/messages/)?.[1]
      const msg = makeDiscordMessage('msg-x', 'userx', t0, { channel_id: channelId ?? MC_ID })
      return new Response(JSON.stringify([msg]), { status: 200 })
    }) as any

    let call = 0
    global.fetch = vi.fn(async (url: string) => {
      call++
      const channelId = (url as string).match(/channels\/([^/]+)\/messages/)?.[1] ?? MC_ID
      if (call % 2 === 1) {
        const msg = makeDiscordMessage(`msg-${channelId}`, 'frank', t0, {
          channel_id: channelId,
        })
        return new Response(JSON.stringify([msg]), { status: 200 })
      }
      return new Response(JSON.stringify([]), { status: 200 })
    }) as any

    const result = await recoverAllChannels(db, TOKEN)
    expect(result.isOk).toBe(true)

    const mc1State = getRecoveryState(db, MC_ID)
    const mc2State = getRecoveryState(db, MC2)
    expect(mc1State.value?.lastProcessedMessageId).toBe(`msg-${MC_ID}`)
    expect(mc2State.value?.lastProcessedMessageId).toBe(`msg-${MC2}`)
  })

  it('recovery is idempotent: running twice on the same data produces the same result', async () => {
    const t0 = clock.now()
    const messages: DiscordMessage[] = [
      makeDiscordMessage('msg-001', 'grace', t0),
      makeDiscordMessage('msg-002', 'grace', t0 + 12 * 3600),
    ]

    global.fetch = vi.fn(async (url: string, _opts: unknown) => {
      const afterMatch = (url as string).match(/after=([^&]+)/)
      const after = afterMatch?.[1] ?? '0'
      const unprocessed = messages.filter((m) => m.id > after)
      if (unprocessed.length === 0) return new Response(JSON.stringify([]), { status: 200 })
      return new Response(JSON.stringify(unprocessed), { status: 200 })
    }) as any

    await recoverChannel(db, TOKEN, MC_ID)
    const resultSecond = await recoverChannel(db, TOKEN, MC_ID)
    expect(resultSecond.isOk).toBe(true)
    expect(resultSecond.value).toBe(0)

    const stats = getUserStats(db, MC_ID, 'grace')
    expect(stats.value?.runCount).toBe(2)
  })
})
