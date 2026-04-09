/**
 * E2E: Scheduled work
 *
 * Tests the full runScheduledWork pipeline: recovery → leaderboard posting →
 * pruning, exercised end-to-end with an in-memory DB and stubbed Discord API.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  addMonitoredChannel,
  upsertLeaderboardChannel,
  getUserStats,
  getLeaderboardPost,
  upsertUserStats,
} from '../../src/db/queries'
import { runScheduledWork } from '../../src/handlers/scheduled'
import { _resetRateLimit } from '../../src/services/discord'
import { createClock } from '../../src/utils/clock'
import type { Database as DatabaseType, DiscordMessage } from '../../src/types'

const schema = readFileSync(join(import.meta.dirname, '../../src/db/schema.sql'), 'utf8')

function makeDb(): DatabaseType {
  const db = new Database(':memory:')
  db.exec(schema)
  db.pragma('foreign_keys = ON')
  return db
}

const LC_ID = 'lc-e2e-scheduled'
const MC_ID = 'mc-e2e-scheduled'
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

function makeDiscordMessage(id: string, userId: string, timestampSecs: number): DiscordMessage {
  return {
    id,
    channel_id: MC_ID,
    guild_id: GUILD_ID,
    author: { id: userId, username: userId, global_name: userId, bot: false },
    timestamp: new Date(timestampSecs * 1000).toISOString(),
    attachments: [{ id: `att-${id}`, filename: 'track.mp3' }],
    type: 0,
  }
}

function seedUserStats(db: DatabaseType, userId: string, runCount: number, highestRunSeen: number) {
  upsertUserStats(db, {
    channelId: MC_ID,
    userId,
    username: userId,
    lastMusicPostAt: 1_700_000_000,
    runCount,
    highestRunSeen,
  })
}

describe('scheduled work (e2e)', () => {
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

  it('posts a new leaderboard message when no previous post exists', async () => {
    seedUserStats(db, 'alice', 5, 7)

    let postedChannelId: string | null = null
    let postedContent: string | null = null

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, opts: RequestInit) => {
        const u = String(url)
        if (u.includes('/messages') && opts.method === 'POST') {
          postedChannelId = u.match(/channels\/([^/]+)\/messages/)?.[1] ?? null
          postedContent = JSON.parse(opts.body as string).content
          return new Response(JSON.stringify({ id: 'new-msg-id' }), { status: 200 })
        }
        return new Response(JSON.stringify([]), { status: 200 })
      }),
    )

    const result = await runScheduledWork(db, TOKEN)
    expect(result.isOk).toBe(true)

    expect(postedChannelId).toBe(LC_ID)
    expect(postedContent).toContain('alice')

    const post = getLeaderboardPost(db, LC_ID)
    expect(post.value?.messageId).toBe('new-msg-id')
  })

  it('skips posting when the leaderboard content has not changed (same hash)', async () => {
    seedUserStats(db, 'bob', 3, 5)

    let postCallCount = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, opts: RequestInit) => {
        const u = String(url)
        if (u.includes('/messages') && opts.method === 'POST') {
          postCallCount++
          return new Response(JSON.stringify({ id: `msg-${postCallCount}` }), { status: 200 })
        }
        if (u.includes('/messages/') && opts.method === 'DELETE') {
          return new Response(null, { status: 204 })
        }
        return new Response(JSON.stringify([]), { status: 200 })
      }),
    )

    await runScheduledWork(db, TOKEN)
    const firstPost = getLeaderboardPost(db, LC_ID)
    expect(firstPost.value?.messageId).toBe('msg-1')

    await runScheduledWork(db, TOKEN)
    expect(postCallCount).toBe(1)

    const secondPost = getLeaderboardPost(db, LC_ID)
    expect(secondPost.value?.messageId).toBe('msg-1')
  })

  it('deletes the old post and sends a new one when content changes', async () => {
    seedUserStats(db, 'carol', 1, 1)

    const deletedMsgIds: string[] = []
    let postCallCount = 0

    const makeStub = () =>
      vi.fn(async (url: string, opts: RequestInit) => {
        const u = String(url)
        const method = opts?.method ?? 'GET'
        if (method === 'POST' && u.includes('/messages')) {
          postCallCount++
          return new Response(JSON.stringify({ id: `msg-post-${postCallCount}` }), { status: 200 })
        }
        if (method === 'DELETE' && u.includes('/messages/')) {
          const parts = u.split('/messages/')
          deletedMsgIds.push(parts[parts.length - 1]!)
          return new Response(null, { status: 204 })
        }
        return new Response(JSON.stringify([]), { status: 200 })
      })

    vi.stubGlobal('fetch', makeStub())
    await runScheduledWork(db, TOKEN)
    const post1 = getLeaderboardPost(db, LC_ID)
    expect(post1.value?.messageId).toBe('msg-post-1')

    upsertUserStats(db, {
      channelId: MC_ID,
      userId: 'dave',
      username: 'dave',
      lastMusicPostAt: 1_700_000_001,
      runCount: 10,
      highestRunSeen: 10,
    })

    vi.stubGlobal('fetch', makeStub())
    await runScheduledWork(db, TOKEN)

    expect(deletedMsgIds).toContain('msg-post-1')
    expect(postCallCount).toBe(2)

    const post2 = getLeaderboardPost(db, LC_ID)
    expect(post2.value?.messageId).toBe('msg-post-2')
    expect(post2.value?.contentHash).not.toBe(post1.value?.contentHash)
  })

  it('does nothing when there are no leaderboard channels configured', async () => {
    const emptyDb = makeDb()
    let fetchCalled = false
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        fetchCalled = true
        return new Response(JSON.stringify([]), { status: 200 })
      }),
    )

    const result = await runScheduledWork(emptyDb, TOKEN)
    expect(result.isOk).toBe(true)
    expect(fetchCalled).toBe(false)
  })

  it('processes each leaderboard channel independently', async () => {
    const LC2 = 'lc-e2e-scheduled-2'
    const MC2 = 'mc-e2e-scheduled-2'
    upsertLeaderboardChannel(db, {
      channelId: LC2,
      guildId: GUILD_ID,
      channelName: '#lb2',
      addedByUserId: 'admin',
    })
    addMonitoredChannel(db, { channelId: MC2, guildId: GUILD_ID, leaderboardChannelId: LC2 })

    upsertUserStats(db, {
      channelId: MC_ID,
      userId: 'alice',
      username: 'alice',
      lastMusicPostAt: clock.now(),
      runCount: 3,
      highestRunSeen: 3,
    })
    upsertUserStats(db, {
      channelId: MC2,
      userId: 'bob',
      username: 'bob',
      lastMusicPostAt: clock.now(),
      runCount: 7,
      highestRunSeen: 9,
    })

    const postedChannels: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, opts: RequestInit) => {
        const u = String(url)
        if (u.includes('/messages') && opts.method === 'POST') {
          const ch = u.match(/channels\/([^/]+)\/messages/)?.[1]
          if (ch) postedChannels.push(ch)
          return new Response(JSON.stringify({ id: `msg-${ch}` }), { status: 200 })
        }
        return new Response(JSON.stringify([]), { status: 200 })
      }),
    )

    const result = await runScheduledWork(db, TOKEN)
    expect(result.isOk).toBe(true)

    expect(postedChannels).toContain(LC_ID)
    expect(postedChannels).toContain(LC2)

    const post1 = getLeaderboardPost(db, LC_ID)
    const post2 = getLeaderboardPost(db, LC2)
    expect(post1.value?.messageId).toBe(`msg-${LC_ID}`)
    expect(post2.value?.messageId).toBe(`msg-${LC2}`)
  })

  it('runs recovery before leaderboard posting: new messages appear in the post', async () => {
    const t0 = clock.now()
    const newMessage: DiscordMessage = makeDiscordMessage('msg-from-recovery', 'helen', t0)
    let recoveryCallCount = 0

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, opts: RequestInit) => {
        const u = String(url)
        const method = opts?.method ?? 'GET'
        if (u.includes(`/channels/${MC_ID}/messages`) && method === 'GET') {
          recoveryCallCount++
          if (recoveryCallCount === 1) {
            return new Response(JSON.stringify([newMessage]), { status: 200 })
          }
          return new Response(JSON.stringify([]), { status: 200 })
        }
        if (method === 'POST' && u.includes('/messages')) {
          return new Response(JSON.stringify({ id: 'posted-msg' }), { status: 200 })
        }
        return new Response(JSON.stringify([]), { status: 200 })
      }),
    )

    const result = await runScheduledWork(db, TOKEN)
    expect(result.isOk).toBe(true)

    const stats = getUserStats(db, MC_ID, 'helen')
    expect(stats.value?.runCount).toBe(1)
  })

  it('removes leaderboard post when leaderboard channel loses its monitored channel link', async () => {
    seedUserStats(db, 'ivan', 5, 5)

    let deletedMsgId: string | null = null
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, opts: RequestInit) => {
        const u = String(url)
        if (u.includes('/messages') && opts.method === 'POST') {
          return new Response(JSON.stringify({ id: 'posted-msg-ivan' }), { status: 200 })
        }
        if (u.match(/messages\/[^/]+$/) && opts.method === 'DELETE') {
          deletedMsgId = u.split('/messages/')[1]
          return new Response(null, { status: 204 })
        }
        return new Response(JSON.stringify([]), { status: 200 })
      }),
    )

    await runScheduledWork(db, TOKEN)
    const post = getLeaderboardPost(db, LC_ID)
    expect(post.value?.messageId).toBe('posted-msg-ivan')

    db.prepare('DELETE FROM monitored_channels WHERE leaderboard_channel_id = ?').run(LC_ID)

    await runScheduledWork(db, TOKEN)

    expect(deletedMsgId).toBe('posted-msg-ivan')
    const postAfter = getLeaderboardPost(db, LC_ID)
    expect(postAfter.value).toBeNull()
  })

  it('prunes old processed_messages entries during scheduled work', async () => {
    seedUserStats(db, 'judy', 1, 1)

    const oldDate = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString()
    db.prepare(`
      INSERT INTO processed_messages (message_id, channel_id, processed_at)
      VALUES ('old-msg', ?, ?)
    `).run(MC_ID, oldDate)

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, opts: RequestInit) => {
        const u = String(url)
        if (u.includes('/messages') && opts.method === 'POST') {
          return new Response(JSON.stringify({ id: 'new-post' }), { status: 200 })
        }
        return new Response(JSON.stringify([]), { status: 200 })
      }),
    )

    await runScheduledWork(db, TOKEN)

    const oldRow = db
      .prepare('SELECT 1 FROM processed_messages WHERE message_id = ?')
      .get('old-msg')
    expect(oldRow).toBeUndefined()
  })
})
