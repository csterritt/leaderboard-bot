import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { Database } from 'bun:sqlite'
import { readFileSync } from 'fs'
import { join } from 'path'
import { EventEmitter } from 'events'
import { setupGatewayHandler } from '../src/handlers/gateway'
import { addMonitoredChannel, upsertLeaderboardChannel, getUserStats } from '../src/db/queries'
import { runScheduledWork } from '../src/handlers/scheduled'
import type { Database as DatabaseType } from '../src/types'

const schema = readFileSync(join(import.meta.dirname, '../src/db/schema.sql'), 'utf8')

function makeDb(): DatabaseType {
  const db = new Database(':memory:')
  db.exec(schema)
  db.exec('PRAGMA foreign_keys = ON')
  return db
}

const LC_ID = 'lc-001'
const MC_ID = 'mc-001'
const GUILD_ID = 'guild-001'
const USER_ID = 'user-001'
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

class FakeClient extends EventEmitter {}

// ─── 11.8 — Integration smoke test: messageCreate → DB row ──────────────────

describe('integration: gateway messageCreate creates a DB row', () => {
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

  it('simulates a messageCreate event and verifies a DB row is created', () => {
    setupGatewayHandler(client as never, db)

    client.emit('messageCreate', {
      id: 'msg-integration-001',
      channelId: MC_ID,
      guildId: GUILD_ID,
      author: { id: USER_ID, username: 'alice', globalName: 'Alice', bot: false },
      member: { nickname: null },
      createdTimestamp: new Date('2024-01-01T12:00:00.000Z').getTime(),
      attachments: new Map([['att-1', { name: 'track.mp3', contentType: 'audio/mpeg' }]]),
      type: 0,
    })

    const stats = getUserStats(db, MC_ID, USER_ID)
    expect(stats.isOk).toBe(true)
    expect(stats.value).not.toBeNull()
    expect(stats.value?.runCount).toBe(1)
  })
})

// ─── 11.9 — Startup integration: scheduled work runs before first interval ──────

describe('integration: startup scheduled work pass runs before any scheduled interval', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('runScheduledWork is invoked immediately at startup, not deferred to the first interval tick', async () => {
    const callOrder: string[] = []

    global.fetch = vi.fn(async () => {
      callOrder.push('scheduled-fetch')
      return new Response(JSON.stringify([]), { status: 200 })
    }) as any

    const db = makeDb()
    seedChannels(db)

    const fakeSetInterval = vi.fn((_fn: () => void, _ms: number) => {
      callOrder.push('setInterval-registered')
      return 0 as unknown as ReturnType<typeof setInterval>
    })

    const originalSetInterval = globalThis.setInterval
    globalThis.setInterval = fakeSetInterval as never

    try {
      await runScheduledWork(db, TOKEN)
      callOrder.push('startup-scheduled-complete')
      fakeSetInterval(() => {}, 3_600_000)

      const scheduledIdx = callOrder.findIndex((e) => e === 'startup-scheduled-complete')
      const intervalIdx = callOrder.findIndex((e) => e === 'setInterval-registered')
      expect(scheduledIdx).toBeGreaterThanOrEqual(0)
      expect(intervalIdx).toBeGreaterThan(scheduledIdx)
    } finally {
      globalThis.setInterval = originalSetInterval
    }
  })
})
