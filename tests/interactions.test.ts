import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { readFileSync } from 'fs'
import { join } from 'path'
import { handleInteraction } from '../src/handlers/interactions'
import {
  upsertLeaderboardChannel,
  addMonitoredChannel,
  getLeaderboardChannel,
  getMonitoredChannels,
  getMonitoredChannelByLeaderboard,
  upsertUserStats,
} from '../src/db/queries'
import type { Database as DatabaseType, DiscordInteraction } from '../src/types'

const schema = readFileSync(join(import.meta.dirname, '../src/db/schema.sql'), 'utf8')

function makeDb(): DatabaseType {
  const db = new Database(':memory:')
  db.exec(schema)
  db.pragma('foreign_keys = ON')
  return db
}

const GUILD_ID = 'guild-001'
const LC_ID = 'lc-channel'
const MC_ID = 'mc-channel'
const ADMIN_USER_ID = 'admin-001'
const REGULAR_USER_ID = 'user-001'
const ADMIN_PERMISSIONS = '8'
const NO_PERMISSIONS = '0'
const TOKEN = 'Bot test-token'
const PUBLIC_KEY = 'deadbeef'

function makeInteraction(overrides: Partial<DiscordInteraction> = {}): DiscordInteraction {
  return {
    id: 'interaction-001',
    type: 2,
    guild_id: GUILD_ID,
    channel_id: LC_ID,
    member: { nick: null, permissions: ADMIN_PERMISSIONS },
    channel: { id: LC_ID, name: 'leaderboard' },
    data: { name: 'leaderboard' },
    ...overrides,
  }
}

function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/interactions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-signature-ed25519': 'aabbcc',
      'x-signature-timestamp': '1234567890',
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

// ─── 9.1 Signature verification ───────────────────────────────────────────────

describe('interaction signature verification', () => {
  let db: DatabaseType

  beforeEach(() => {
    db = makeDb()
  })

  it('returns 401 when signature headers are missing', async () => {
    const req = new Request('http://localhost/interactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 1 }),
    })
    const res = await handleInteraction(req, db, TOKEN, PUBLIC_KEY)
    expect(res.status).toBe(401)
  })

  it('returns 401 when signature is invalid', async () => {
    const req = makeRequest({ type: 1 })
    const res = await handleInteraction(req, db, TOKEN, PUBLIC_KEY)
    expect(res.status).toBe(401)
  })
})

// We need to bypass signature verification for the rest of the tests.
// We do this by injecting a verifier override.
import { handleInteractionWithVerifier } from '../src/handlers/interactions'

function makeVerifiedRequest(body: unknown): Request {
  return makeRequest(body)
}

async function dispatch(db: DatabaseType, body: unknown): Promise<Response> {
  return handleInteractionWithVerifier(makeVerifiedRequest(body), db, TOKEN, async () => true)
}

async function dispatchFetch(
  db: DatabaseType,
  body: unknown,
  mockFetch: typeof fetch,
): Promise<Response> {
  vi.stubGlobal('fetch', mockFetch)
  const res = await handleInteractionWithVerifier(
    makeVerifiedRequest(body),
    db,
    TOKEN,
    async () => true,
  )
  vi.restoreAllMocks()
  return res
}

// ─── 9.2 Ping/pong ───────────────────────────────────────────────────────────

describe('ping', () => {
  let db: DatabaseType
  beforeEach(() => {
    db = makeDb()
  })

  it('returns { type: 1 } for type = 1 (ping)', async () => {
    const res = await dispatch(db, { type: 1 })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { type: number }
    expect(body.type).toBe(1)
  })
})

// ─── 9.3 /leaderboard ────────────────────────────────────────────────────────

describe('/leaderboard', () => {
  let db: DatabaseType

  beforeEach(() => {
    db = makeDb()
    upsertLeaderboardChannel(db, {
      channelId: LC_ID,
      guildId: GUILD_ID,
      channelName: 'leaderboard',
      addedByUserId: ADMIN_USER_ID,
    })
    addMonitoredChannel(db, {
      channelId: MC_ID,
      guildId: GUILD_ID,
      leaderboardChannelId: LC_ID,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uses current channel_id when no channel option is provided', async () => {
    const res = await dispatch(
      db,
      makeInteraction({
        data: { name: 'leaderboard' },
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: { content: string } }
    expect(body.data.content).toBeDefined()
  })

  it('uses the provided channel option when given', async () => {
    const res = await dispatch(
      db,
      makeInteraction({
        data: {
          name: 'leaderboard',
          options: [{ name: 'channel', value: LC_ID }],
        },
      }),
    )
    expect(res.status).toBe(200)
  })

  it('returns an error message when the target channel is not a leaderboard channel', async () => {
    const res = await dispatch(
      db,
      makeInteraction({
        channel_id: 'not-a-lb-channel',
        channel: { id: 'not-a-lb-channel', name: 'general' },
        data: { name: 'leaderboard' },
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: { content: string } }
    expect(body.data.content).toContain('not a leaderboard channel')
  })

  it('uses fetchChannel for a different channel option', async () => {
    const otherLcId = 'other-lc'
    upsertLeaderboardChannel(db, {
      channelId: otherLcId,
      guildId: GUILD_ID,
      channelName: 'other-lb',
      addedByUserId: ADMIN_USER_ID,
    })
    addMonitoredChannel(db, {
      channelId: 'other-mc',
      guildId: GUILD_ID,
      leaderboardChannelId: otherLcId,
    })

    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: otherLcId, name: 'other-lb' }), { status: 200 }),
    )

    const res = await dispatchFetch(
      db,
      makeInteraction({
        data: {
          name: 'leaderboard',
          options: [{ name: 'channel', value: otherLcId }],
        },
      }),
      fetchMock as never,
    )
    expect(res.status).toBe(200)
  })

  it('returns ephemeral response (flags = 64)', async () => {
    const res = await dispatch(
      db,
      makeInteraction({
        data: { name: 'leaderboard' },
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: { flags: number } }
    expect(body.data.flags).toBe(64)
  })

  it('returns a helpful message when leaderboard channel has no linked monitored channel', async () => {
    const lonelyLcId = 'lonely-lc'
    upsertLeaderboardChannel(db, {
      channelId: lonelyLcId,
      guildId: GUILD_ID,
      channelName: 'lonely-lb',
      addedByUserId: ADMIN_USER_ID,
    })
    const res = await dispatch(
      db,
      makeInteraction({
        channel_id: lonelyLcId,
        channel: { id: lonelyLcId, name: 'lonely-lb' },
        data: { name: 'leaderboard' },
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: { content: string } }
    expect(body.data.content).toContain('No monitored channel')
  })

  it('returns a no-data message when linked monitored channel has no stats', async () => {
    const res = await dispatch(
      db,
      makeInteraction({
        data: { name: 'leaderboard' },
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: { content: string } }
    expect(body.data.content).toContain('No data')
  })

  it('returns an error when fetchChannel fails for a provided channel option', async () => {
    const otherLcId = 'other-lc-2'
    upsertLeaderboardChannel(db, {
      channelId: otherLcId,
      guildId: GUILD_ID,
      channelName: 'other-lb-2',
      addedByUserId: ADMIN_USER_ID,
    })

    const fetchMock = vi.fn(async () => new Response('Error', { status: 500 }))
    const res = await dispatchFetch(
      db,
      makeInteraction({
        data: {
          name: 'leaderboard',
          options: [{ name: 'channel', value: otherLcId }],
        },
      }),
      fetchMock as never,
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: { content: string } }
    expect(body.data.content).toContain('Failed to fetch')
  })

  it('queries only the linked monitored channel and does not merge across channels', async () => {
    upsertUserStats(db, {
      channelId: MC_ID,
      userId: 'user-a',
      username: 'Alice',
      lastMusicPostAt: 1704067200,
      runCount: 5,
      highestRunSeen: 5,
    })
    const res = await dispatch(
      db,
      makeInteraction({
        data: { name: 'leaderboard' },
      }),
    )
    const body = (await res.json()) as { data: { content: string } }
    expect(body.data.content).toContain('Alice')
  })
})

// ─── 9.4 /setleaderboardchannel ──────────────────────────────────────────────

describe('/setleaderboardchannel', () => {
  let db: DatabaseType
  beforeEach(() => {
    db = makeDb()
  })

  it('rejects interactions with no member', async () => {
    const res = await dispatch(
      db,
      makeInteraction({ member: undefined, data: { name: 'setleaderboardchannel' } }),
    )
    const body = (await res.json()) as { data: { content: string } }
    expect(body.data.content).toContain('guild')
  })

  it('rejects interactions outside a guild context (no guild_id)', async () => {
    const res = await dispatch(
      db,
      makeInteraction({
        guild_id: undefined,
        data: { name: 'setleaderboardchannel' },
      }),
    )
    const body = (await res.json()) as { data: { content: string } }
    expect(body.data.content).toContain('guild')
  })

  it('rejects a user without ADMINISTRATOR permission', async () => {
    const res = await dispatch(
      db,
      makeInteraction({
        member: { nick: null, permissions: NO_PERMISSIONS },
        data: { name: 'setleaderboardchannel' },
      }),
    )
    const body = (await res.json()) as { data: { content: string } }
    expect(body.data.content).toContain('permission')
  })

  it('treats a malformed permissions string as non-admin instead of crashing', async () => {
    const res = await dispatch(
      db,
      makeInteraction({
        member: { nick: null, permissions: 'not-a-number' },
        data: { name: 'setleaderboardchannel' },
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: { content: string } }
    expect(body.data.content).toContain('permission')
  })

  it('accepts a user with ADMINISTRATOR permission and upserts the channel', async () => {
    const res = await dispatch(
      db,
      makeInteraction({
        member: { nick: null, permissions: ADMIN_PERMISSIONS },
        data: { name: 'setleaderboardchannel' },
      }),
    )
    expect(res.status).toBe(200)
    const lc = getLeaderboardChannel(db, LC_ID)
    expect(lc.isOk).toBe(true)
    expect(lc.value?.channelId).toBe(LC_ID)
  })

  it('refreshes channel_name when run again for the same channel', async () => {
    await dispatch(
      db,
      makeInteraction({
        channel: { id: LC_ID, name: 'old-name' },
        data: { name: 'setleaderboardchannel' },
      }),
    )
    await dispatch(
      db,
      makeInteraction({
        channel: { id: LC_ID, name: 'new-name' },
        data: { name: 'setleaderboardchannel' },
      }),
    )
    const lc = getLeaderboardChannel(db, LC_ID)
    expect(lc.value?.channelName).toBe('new-name')
  })

  it('stores the invoking user ID as addedByUserId', async () => {
    await dispatch(
      db,
      makeInteraction({
        member: { nick: null, permissions: ADMIN_PERMISSIONS, user: { id: 'admin-user-42' } },
        data: { name: 'setleaderboardchannel' },
      }),
    )
    const lc = getLeaderboardChannel(db, LC_ID)
    expect(lc.value?.addedByUserId).toBe('admin-user-42')
  })

  it('does not add the channel to monitored_channels', async () => {
    await dispatch(db, makeInteraction({ data: { name: 'setleaderboardchannel' } }))
    const monitored = getMonitoredChannels(db)
    expect(monitored.value).toHaveLength(0)
  })
})

// ─── 9.5 /removeleaderboardchannel ───────────────────────────────────────────

describe('/removeleaderboardchannel', () => {
  let db: DatabaseType

  beforeEach(() => {
    db = makeDb()
    upsertLeaderboardChannel(db, {
      channelId: LC_ID,
      guildId: GUILD_ID,
      channelName: 'leaderboard',
      addedByUserId: ADMIN_USER_ID,
    })
    addMonitoredChannel(db, {
      channelId: MC_ID,
      guildId: GUILD_ID,
      leaderboardChannelId: LC_ID,
    })
    db.prepare(`
      INSERT INTO leaderboard_posts (channel_id, message_id, content_hash)
      VALUES (?, ?, ?)
    `).run(LC_ID, 'msg-lb', 'hash-lb')
  })

  it('rejects interactions with no member', async () => {
    const res = await dispatch(
      db,
      makeInteraction({ member: undefined, data: { name: 'removeleaderboardchannel' } }),
    )
    const body = (await res.json()) as { data: { content: string } }
    expect(body.data.content).toContain('guild')
  })

  it('rejects interactions outside a guild context', async () => {
    const res = await dispatch(
      db,
      makeInteraction({
        guild_id: undefined,
        data: { name: 'removeleaderboardchannel' },
      }),
    )
    const body = (await res.json()) as { data: { content: string } }
    expect(body.data.content).toContain('guild')
  })

  it('rejects a user without ADMINISTRATOR permission', async () => {
    const res = await dispatch(
      db,
      makeInteraction({
        member: { nick: null, permissions: NO_PERMISSIONS },
        data: { name: 'removeleaderboardchannel' },
      }),
    )
    const body = (await res.json()) as { data: { content: string } }
    expect(body.data.content).toContain('permission')
  })

  it('removes the current channel from leaderboard_channels', async () => {
    await dispatch(db, makeInteraction({ data: { name: 'removeleaderboardchannel' } }))
    const lc = getLeaderboardChannel(db, LC_ID)
    expect(lc.value).toBeNull()
  })

  it('removes all monitored_channels rows referencing this leaderboard channel (cascade)', async () => {
    await dispatch(db, makeInteraction({ data: { name: 'removeleaderboardchannel' } }))
    const monitored = getMonitoredChannelByLeaderboard(db, LC_ID)
    expect(monitored.value).toBeNull()
  })

  it('deletes the stored leaderboard_posts row for the channel', async () => {
    await dispatch(db, makeInteraction({ data: { name: 'removeleaderboardchannel' } }))
    const row = db.prepare('SELECT * FROM leaderboard_posts WHERE channel_id = ?').get(LC_ID)
    expect(row).toBeUndefined()
  })

  it('does not delete historical user_stats rows', async () => {
    upsertUserStats(db, {
      channelId: MC_ID,
      userId: 'user-a',
      username: 'Alice',
      lastMusicPostAt: 1704067200,
      runCount: 3,
      highestRunSeen: 3,
    })
    await dispatch(db, makeInteraction({ data: { name: 'removeleaderboardchannel' } }))
    const row = db.prepare('SELECT * FROM user_stats WHERE channel_id = ?').get(MC_ID)
    expect(row).toBeDefined()
  })
})

// ─── 9.6 /addmonitoredchannel ────────────────────────────────────────────────

describe('/addmonitoredchannel', () => {
  let db: DatabaseType

  beforeEach(() => {
    db = makeDb()
    upsertLeaderboardChannel(db, {
      channelId: LC_ID,
      guildId: GUILD_ID,
      channelName: 'leaderboard',
      addedByUserId: ADMIN_USER_ID,
    })
  })

  it('rejects interactions with no member', async () => {
    const res = await dispatch(
      db,
      makeInteraction({
        member: undefined,
        data: { name: 'addmonitoredchannel', options: [{ name: 'channel', value: MC_ID }] },
      }),
    )
    const body = (await res.json()) as { data: { content: string } }
    expect(body.data.content).toContain('guild')
  })

  it('rejects interactions outside guild context', async () => {
    const res = await dispatch(
      db,
      makeInteraction({
        guild_id: undefined,
        data: { name: 'addmonitoredchannel', options: [{ name: 'channel', value: MC_ID }] },
      }),
    )
    const body = (await res.json()) as { data: { content: string } }
    expect(body.data.content).toContain('guild')
  })

  it('rejects a user without ADMINISTRATOR permission', async () => {
    const res = await dispatch(
      db,
      makeInteraction({
        member: { nick: null, permissions: NO_PERMISSIONS },
        data: { name: 'addmonitoredchannel', options: [{ name: 'channel', value: MC_ID }] },
      }),
    )
    const body = (await res.json()) as { data: { content: string } }
    expect(body.data.content).toContain('permission')
  })

  it('rejects if the current channel is not a leaderboard channel', async () => {
    const res = await dispatch(
      db,
      makeInteraction({
        channel_id: 'not-a-lb',
        channel: { id: 'not-a-lb', name: 'general' },
        data: { name: 'addmonitoredchannel', options: [{ name: 'channel', value: MC_ID }] },
      }),
    )
    const body = (await res.json()) as { data: { content: string } }
    expect(body.data.content).toContain('leaderboard channel')
  })

  it('adds the provided channel to monitored_channels linked to current leaderboard channel', async () => {
    await dispatch(
      db,
      makeInteraction({
        data: { name: 'addmonitoredchannel', options: [{ name: 'channel', value: MC_ID }] },
      }),
    )
    const linked = getMonitoredChannelByLeaderboard(db, LC_ID)
    expect(linked.value?.channelId).toBe(MC_ID)
  })

  it('is idempotent — adding same channel again does not error', async () => {
    await dispatch(
      db,
      makeInteraction({
        data: { name: 'addmonitoredchannel', options: [{ name: 'channel', value: MC_ID }] },
      }),
    )
    const res = await dispatch(
      db,
      makeInteraction({
        data: { name: 'addmonitoredchannel', options: [{ name: 'channel', value: MC_ID }] },
      }),
    )
    expect(res.status).toBe(200)
  })

  it('rejects linking a different monitored channel when this leaderboard channel already has one', async () => {
    await dispatch(
      db,
      makeInteraction({
        data: { name: 'addmonitoredchannel', options: [{ name: 'channel', value: MC_ID }] },
      }),
    )
    const res = await dispatch(
      db,
      makeInteraction({
        data: { name: 'addmonitoredchannel', options: [{ name: 'channel', value: 'other-mc' }] },
      }),
    )
    const body = (await res.json()) as { data: { content: string } }
    expect(body.data.content).toContain('already linked')
  })
})

// ─── 9.7 /removemonitoredchannel ─────────────────────────────────────────────

describe('/removemonitoredchannel', () => {
  let db: DatabaseType

  beforeEach(() => {
    db = makeDb()
    upsertLeaderboardChannel(db, {
      channelId: LC_ID,
      guildId: GUILD_ID,
      channelName: 'leaderboard',
      addedByUserId: ADMIN_USER_ID,
    })
    addMonitoredChannel(db, {
      channelId: MC_ID,
      guildId: GUILD_ID,
      leaderboardChannelId: LC_ID,
    })
  })

  it('rejects interactions with no member', async () => {
    const res = await dispatch(
      db,
      makeInteraction({
        member: undefined,
        data: { name: 'removemonitoredchannel', options: [{ name: 'channel', value: MC_ID }] },
      }),
    )
    const body = (await res.json()) as { data: { content: string } }
    expect(body.data.content).toContain('guild')
  })

  it('rejects interactions outside guild context', async () => {
    const res = await dispatch(
      db,
      makeInteraction({
        guild_id: undefined,
        data: { name: 'removemonitoredchannel', options: [{ name: 'channel', value: MC_ID }] },
      }),
    )
    const body = (await res.json()) as { data: { content: string } }
    expect(body.data.content).toContain('guild')
  })

  it('rejects a user without ADMINISTRATOR permission', async () => {
    const res = await dispatch(
      db,
      makeInteraction({
        member: { nick: null, permissions: NO_PERMISSIONS },
        data: { name: 'removemonitoredchannel', options: [{ name: 'channel', value: MC_ID }] },
      }),
    )
    const body = (await res.json()) as { data: { content: string } }
    expect(body.data.content).toContain('permission')
  })

  it('removes the provided channel from monitored_channels', async () => {
    await dispatch(
      db,
      makeInteraction({
        data: { name: 'removemonitoredchannel', options: [{ name: 'channel', value: MC_ID }] },
      }),
    )
    const monitored = getMonitoredChannels(db)
    expect(monitored.value).toHaveLength(0)
  })

  it('does not delete historical user_stats rows', async () => {
    upsertUserStats(db, {
      channelId: MC_ID,
      userId: 'user-a',
      username: 'Alice',
      lastMusicPostAt: 1704067200,
      runCount: 3,
      highestRunSeen: 3,
    })
    await dispatch(
      db,
      makeInteraction({
        data: { name: 'removemonitoredchannel', options: [{ name: 'channel', value: MC_ID }] },
      }),
    )
    const row = db.prepare('SELECT * FROM user_stats WHERE channel_id = ?').get(MC_ID)
    expect(row).toBeDefined()
  })
})

// ─── Token format ──────────────────────────────────────────────────────────

describe('interaction token format', () => {
  let db: DatabaseType

  beforeEach(() => {
    db = makeDb()
    upsertLeaderboardChannel(db, {
      channelId: 'other-lc',
      guildId: GUILD_ID,
      channelName: 'other-lb',
      addedByUserId: ADMIN_USER_ID,
    })
    addMonitoredChannel(db, {
      channelId: 'other-mc',
      guildId: GUILD_ID,
      leaderboardChannelId: 'other-lc',
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('passes the token with Bot prefix to Discord API calls', async () => {
    let capturedAuthHeader: string | undefined
    const fetchMock = vi.fn(async (url: string, opts?: RequestInit) => {
      capturedAuthHeader = (opts?.headers as Record<string, string>)?.['Authorization']
      return new Response(JSON.stringify({ id: 'other-lc', name: 'other-lb' }), { status: 200 })
    })

    const res = await dispatchFetch(
      db,
      makeInteraction({
        channel_id: 'lc-channel',
        channel: { id: 'lc-channel', name: 'lc-channel' },
        data: {
          name: 'leaderboard',
          options: [{ name: 'channel', value: 'other-lc' }],
        },
      }),
      fetchMock as never,
    )
    expect(res.status).toBe(200)
    expect(capturedAuthHeader).toMatch(/^Bot /)
  })
})

// ─── 9.8 Interaction router ───────────────────────────────────────────────

describe('interaction router', () => {
  let db: DatabaseType
  beforeEach(() => {
    db = makeDb()
  })

  it('returns 400 for unknown command names', async () => {
    const res = await dispatch(
      db,
      makeInteraction({
        data: { name: 'unknowncommand' },
      }),
    )
    expect(res.status).toBe(400)
  })
})
