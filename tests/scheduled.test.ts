import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { Database } from 'bun:sqlite'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  upsertLeaderboardChannel,
  addMonitoredChannel,
  upsertLeaderboardPost,
  getLeaderboardPost,
  claimProcessedMessage,
  upsertUserStats,
} from '../src/db/queries'
import { runScheduledWork } from '../src/handlers/scheduled'
import type { Database as DatabaseType } from '../src/types'

const schema = readFileSync(join(import.meta.dirname, '../src/db/schema.sql'), 'utf8')

function makeDb(): DatabaseType {
  const db = new Database(':memory:')
  db.exec(schema)
  db.exec('PRAGMA foreign_keys = ON')
  return db
}

const TOKEN = 'Bot test-token'
const LC_ID = 'lc-001'
const MC_ID = 'mc-001'
const GUILD_ID = 'guild-001'

function seedLeaderboardChannel(db: DatabaseType, lcId = LC_ID, mcId = MC_ID) {
  upsertLeaderboardChannel(db, {
    channelId: lcId,
    guildId: GUILD_ID,
    channelName: 'leaderboard',
    addedByUserId: 'admin',
  })
  addMonitoredChannel(db, {
    channelId: mcId,
    guildId: GUILD_ID,
    leaderboardChannelId: lcId,
  })
}

// ─── runScheduledWork ─────────────────────────────────────────────────────────

describe('runScheduledWork', () => {
  let db: DatabaseType

  beforeEach(() => {
    db = makeDb()
    vi.resetAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does nothing when there are no configured leaderboard channels', async () => {
    const mockFetch = vi.fn()
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.stubGlobal('fetch', mockFetch)

    const result = await runScheduledWork(db, TOKEN)
    expect(result.isOk).toBe(true)
    expect(mockFetch).not.toHaveBeenCalled()
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('[scheduled] no leaderboard channels configured'),
    )
  })

  it('runs recovery before leaderboard posting', async () => {
    seedLeaderboardChannel(db)
    const callOrder: string[] = []

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, opts?: RequestInit) => {
        const urlStr = String(url)
        if (opts?.method === 'GET' && urlStr.includes('/messages?after=')) {
          callOrder.push('recovery')
          return new Response(JSON.stringify([]), { status: 200 })
        }
        if (opts?.method === 'POST' && urlStr.includes('/messages')) {
          callOrder.push('post')
          return new Response(JSON.stringify({ id: 'new-msg-1' }), { status: 200 })
        }
        return new Response(JSON.stringify({ id: 'new-msg-1' }), { status: 200 })
      }),
    )

    const result = await runScheduledWork(db, TOKEN)
    expect(result.isOk).toBe(true)

    const recoveryIdx = callOrder.indexOf('recovery')
    const postIdx = callOrder.indexOf('post')
    expect(recoveryIdx).toBeGreaterThanOrEqual(0)
    expect(postIdx).toBeGreaterThan(recoveryIdx)
  })

  it('processes each leaderboard channel independently', async () => {
    seedLeaderboardChannel(db, 'lc-1', 'mc-1')
    upsertLeaderboardChannel(db, {
      channelId: 'lc-2',
      guildId: GUILD_ID,
      channelName: 'lb2',
      addedByUserId: 'admin',
    })
    addMonitoredChannel(db, { channelId: 'mc-2', guildId: GUILD_ID, leaderboardChannelId: 'lc-2' })

    const postedTo: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, opts?: RequestInit) => {
        const urlStr = String(url)
        if (opts?.method === 'GET') return new Response(JSON.stringify([]), { status: 200 })
        if (opts?.method === 'POST') {
          const m = urlStr.match(/channels\/([^/]+)\/messages/)
          if (m?.[1]) postedTo.push(m[1])
          return new Response(JSON.stringify({ id: 'msg-' + postedTo.length }), { status: 200 })
        }
        return new Response('{}', { status: 200 })
      }),
    )

    const result = await runScheduledWork(db, TOKEN)
    expect(result.isOk).toBe(true)
    expect(postedTo).toContain('lc-1')
    expect(postedTo).toContain('lc-2')
  })

  it('formats leaderboard using the stored channel_name from monitored channel stats', async () => {
    seedLeaderboardChannel(db)
    upsertUserStats(db, {
      channelId: MC_ID,
      userId: 'user-1',
      username: 'alice',
      lastMusicPostAt: Date.now(),
      runCount: 3,
      highestRunSeen: 5,
    })

    let postedContent = ''
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, opts?: RequestInit) => {
        const urlStr = String(url)
        if (opts?.method === 'GET') return new Response(JSON.stringify([]), { status: 200 })
        if (opts?.method === 'POST') {
          const body = JSON.parse(opts?.body as string)
          postedContent = body.content
          return new Response(JSON.stringify({ id: 'msg-1' }), { status: 200 })
        }
        return new Response('{}', { status: 200 })
      }),
    )

    const result = await runScheduledWork(db, TOKEN)
    expect(result.isOk).toBe(true)
    expect(postedContent).toContain('leaderboard')
    expect(postedContent).toContain('alice')
  })

  it('does not merge rows across different monitored channels', async () => {
    seedLeaderboardChannel(db, 'lc-1', 'mc-1')
    upsertLeaderboardChannel(db, {
      channelId: 'lc-2',
      guildId: GUILD_ID,
      channelName: 'lb2',
      addedByUserId: 'admin',
    })
    addMonitoredChannel(db, { channelId: 'mc-2', guildId: GUILD_ID, leaderboardChannelId: 'lc-2' })

    upsertUserStats(db, {
      channelId: 'mc-1',
      userId: 'user-1',
      username: 'alice',
      lastMusicPostAt: Date.now(),
      runCount: 5,
      highestRunSeen: 5,
    })
    upsertUserStats(db, {
      channelId: 'mc-2',
      userId: 'user-2',
      username: 'bob',
      lastMusicPostAt: Date.now(),
      runCount: 3,
      highestRunSeen: 3,
    })

    const postsByChannel: Record<string, string> = {}
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, opts?: RequestInit) => {
        const urlStr = String(url)
        if (opts?.method === 'GET') return new Response(JSON.stringify([]), { status: 200 })
        if (opts?.method === 'POST') {
          const m = urlStr.match(/channels\/([^/]+)\/messages/)
          const body = JSON.parse(opts?.body as string)
          if (m?.[1]) postsByChannel[m[1]] = body.content
          return new Response(JSON.stringify({ id: 'msg-x' }), { status: 200 })
        }
        return new Response('{}', { status: 200 })
      }),
    )

    const result = await runScheduledWork(db, TOKEN)
    expect(result.isOk).toBe(true)
    expect(postsByChannel['lc-1']).toContain('alice')
    expect(postsByChannel['lc-1']).not.toContain('bob')
    expect(postsByChannel['lc-2']).toContain('bob')
    expect(postsByChannel['lc-2']).not.toContain('alice')
  })

  it('removes stored leaderboard post when leaderboard channel has no linked monitored channel', async () => {
    upsertLeaderboardChannel(db, {
      channelId: LC_ID,
      guildId: GUILD_ID,
      channelName: 'leaderboard',
      addedByUserId: 'admin',
    })
    upsertLeaderboardPost(db, { channelId: LC_ID, messageId: 'old-msg', contentHash: 'oldhash' })

    const deletedUrls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, opts?: RequestInit) => {
        if (opts?.method === 'DELETE') deletedUrls.push(String(url))
        return new Response(null, { status: 204 })
      }),
    )

    const result = await runScheduledWork(db, TOKEN)
    expect(result.isOk).toBe(true)
    expect(deletedUrls.some((u) => u.includes('old-msg'))).toBe(true)

    const post = getLeaderboardPost(db, LC_ID)
    expect(post.value).toBeNull()
  })

  it('skips posting when content hash is unchanged', async () => {
    seedLeaderboardChannel(db)

    const mockFetch = vi.fn(async (url: string, opts?: RequestInit) => {
      if (opts?.method === 'GET') return new Response(JSON.stringify([]), { status: 200 })
      if (opts?.method === 'POST')
        return new Response(JSON.stringify({ id: 'msg-1' }), { status: 200 })
      return new Response('{}', { status: 200 })
    })
    vi.stubGlobal('fetch', mockFetch)

    await runScheduledWork(db, TOKEN)

    const postCount1 = mockFetch.mock.calls.filter(([, opts]) => opts?.method === 'POST').length

    mockFetch.mockClear()

    await runScheduledWork(db, TOKEN)

    const postCount2 = mockFetch.mock.calls.filter(([, opts]) => opts?.method === 'POST').length

    expect(postCount1).toBe(1)
    expect(postCount2).toBe(0)
  })

  it('deletes the previous leaderboard message when one exists before posting new', async () => {
    seedLeaderboardChannel(db)
    upsertLeaderboardPost(db, {
      channelId: LC_ID,
      messageId: 'prev-msg',
      contentHash: 'stale-hash',
    })
    upsertUserStats(db, {
      channelId: MC_ID,
      userId: 'user-1',
      username: 'alice',
      lastMusicPostAt: Date.now(),
      runCount: 2,
      highestRunSeen: 2,
    })

    const callOrder: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, opts?: RequestInit) => {
        const urlStr = String(url)
        if (opts?.method === 'GET') return new Response(JSON.stringify([]), { status: 200 })
        if (opts?.method === 'DELETE') {
          callOrder.push('delete')
          return new Response(null, { status: 204 })
        }
        if (opts?.method === 'POST') {
          callOrder.push('post')
          return new Response(JSON.stringify({ id: 'new-msg' }), { status: 200 })
        }
        return new Response('{}', { status: 200 })
      }),
    )

    const result = await runScheduledWork(db, TOKEN)
    expect(result.isOk).toBe(true)
    expect(callOrder).toContain('delete')
    expect(callOrder).toContain('post')
    expect(callOrder.indexOf('delete')).toBeLessThan(callOrder.indexOf('post'))
  })

  it('continues gracefully when message deletion returns 404', async () => {
    seedLeaderboardChannel(db)
    upsertLeaderboardPost(db, {
      channelId: LC_ID,
      messageId: 'gone-msg',
      contentHash: 'stale-hash',
    })
    upsertUserStats(db, {
      channelId: MC_ID,
      userId: 'user-1',
      username: 'alice',
      lastMusicPostAt: Date.now(),
      runCount: 1,
      highestRunSeen: 1,
    })

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, opts?: RequestInit) => {
        if (opts?.method === 'GET') return new Response(JSON.stringify([]), { status: 200 })
        if (opts?.method === 'DELETE') return new Response('Not Found', { status: 404 })
        if (opts?.method === 'POST')
          return new Response(JSON.stringify({ id: 'new-msg' }), { status: 200 })
        return new Response('{}', { status: 200 })
      }),
    )

    const result = await runScheduledWork(db, TOKEN)
    expect(result.isOk).toBe(true)
  })

  it('posts a new leaderboard and upserts leaderboard_posts record', async () => {
    seedLeaderboardChannel(db)
    upsertUserStats(db, {
      channelId: MC_ID,
      userId: 'user-1',
      username: 'alice',
      lastMusicPostAt: Date.now(),
      runCount: 1,
      highestRunSeen: 1,
    })

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, opts?: RequestInit) => {
        if (opts?.method === 'GET') return new Response(JSON.stringify([]), { status: 200 })
        if (opts?.method === 'POST')
          return new Response(JSON.stringify({ id: 'msg-posted' }), { status: 200 })
        return new Response('{}', { status: 200 })
      }),
    )

    const result = await runScheduledWork(db, TOKEN)
    expect(result.isOk).toBe(true)

    const post = getLeaderboardPost(db, LC_ID)
    expect(post.isOk).toBe(true)
    expect(post.value?.messageId).toBe('msg-posted')
    expect(post.value?.contentHash).toBeTruthy()
  })

  it('pruneProcessedMessages runs after leaderboard posting (deletes rows older than 14 days)', async () => {
    seedLeaderboardChannel(db)

    db.prepare(`
      INSERT INTO processed_messages (message_id, channel_id, processed_at)
      VALUES (?, ?, datetime('now', '-20 days'))
    `).run('old-msg', MC_ID)

    db.prepare(`
      INSERT INTO processed_messages (message_id, channel_id, processed_at)
      VALUES (?, ?, datetime('now', '-1 days'))
    `).run('recent-msg', MC_ID)

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, opts?: RequestInit) => {
        if (opts?.method === 'GET') return new Response(JSON.stringify([]), { status: 200 })
        if (opts?.method === 'POST')
          return new Response(JSON.stringify({ id: 'msg-1' }), { status: 200 })
        return new Response('{}', { status: 200 })
      }),
    )

    const result = await runScheduledWork(db, TOKEN)
    expect(result.isOk).toBe(true)

    const oldExists = db
      .prepare('SELECT 1 FROM processed_messages WHERE message_id = ?')
      .get('old-msg')
    const recentExists = db
      .prepare('SELECT 1 FROM processed_messages WHERE message_id = ?')
      .get('recent-msg')

    expect(oldExists).toBeNull()
    expect(recentExists).not.toBeNull()
  })

  it('logs start and completion of scheduled work', async () => {
    seedLeaderboardChannel(db)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, opts?: RequestInit) => {
        if (opts?.method === 'GET') return new Response(JSON.stringify([]), { status: 200 })
        if (opts?.method === 'POST')
          return new Response(JSON.stringify({ id: 'msg-1' }), { status: 200 })
        return new Response('{}', { status: 200 })
      }),
    )

    const result = await runScheduledWork(db, TOKEN)
    expect(result.isOk).toBe(true)
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('[scheduled] starting scheduled work'),
    )
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('[scheduled] scheduled work complete'),
    )
  })

  it('logs when leaderboard content is unchanged', async () => {
    seedLeaderboardChannel(db)

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, opts?: RequestInit) => {
        if (opts?.method === 'GET') return new Response(JSON.stringify([]), { status: 200 })
        if (opts?.method === 'POST')
          return new Response(JSON.stringify({ id: 'msg-1' }), { status: 200 })
        return new Response('{}', { status: 200 })
      }),
    )

    await runScheduledWork(db, TOKEN)

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await runScheduledWork(db, TOKEN)
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('[scheduled] leaderboard unchanged'),
    )
  })

  it('logs when leaderboard post is updated', async () => {
    seedLeaderboardChannel(db)
    upsertUserStats(db, {
      channelId: MC_ID,
      userId: 'user-1',
      username: 'alice',
      lastMusicPostAt: Date.now(),
      runCount: 1,
      highestRunSeen: 1,
    })

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, opts?: RequestInit) => {
        if (opts?.method === 'GET') return new Response(JSON.stringify([]), { status: 200 })
        if (opts?.method === 'POST')
          return new Response(JSON.stringify({ id: 'msg-posted' }), { status: 200 })
        return new Response('{}', { status: 200 })
      }),
    )

    const result = await runScheduledWork(db, TOKEN)
    expect(result.isOk).toBe(true)
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('[scheduled] leaderboard post updated'),
    )
  })

  it('logs pruned processed messages', async () => {
    seedLeaderboardChannel(db)

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, opts?: RequestInit) => {
        if (opts?.method === 'GET') return new Response(JSON.stringify([]), { status: 200 })
        if (opts?.method === 'POST')
          return new Response(JSON.stringify({ id: 'msg-1' }), { status: 200 })
        return new Response('{}', { status: 200 })
      }),
    )

    const result = await runScheduledWork(db, TOKEN)
    expect(result.isOk).toBe(true)
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('[scheduled] pruned processed messages'),
    )
  })
})
