/**
 * E2E: Streak accumulation
 *
 * Exercises the full pipeline from raw message → processMessage → DB user_stats,
 * using a controllable clock to simulate the passage of time between posts.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { Database } from 'bun:sqlite'
import { readFileSync } from 'fs'
import { join } from 'path'
import { processMessage } from '../../src/services/processor'
import { addMonitoredChannel, upsertLeaderboardChannel, getUserStats } from '../../src/db/queries'
import { createClock } from '../../src/utils/clock'
import type { Database as DatabaseType, NormalizedMessage } from '../../src/types'

const schema = readFileSync(join(import.meta.dirname, '../../src/db/schema.sql'), 'utf8')

function makeDb(): DatabaseType {
  const db = new Database(':memory:')
  db.exec(schema)
  db.exec('PRAGMA foreign_keys = ON')
  return db
}

const LC_ID = 'lc-e2e-streaks'
const MC_ID = 'mc-e2e-streaks'
const GUILD_ID = 'guild-e2e'
const USER_A = 'user-alice'
const USER_B = 'user-bob'

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

function makeMsg(
  overrides: Partial<NormalizedMessage> & { id: string; timestampSecs: number },
): NormalizedMessage {
  return {
    id: overrides.id,
    channelId: MC_ID,
    guildId: GUILD_ID,
    author: { id: USER_A, username: 'alice', globalName: 'Alice', isBot: false },
    member: { nick: null },
    timestamp: new Date(overrides.timestampSecs * 1000).toISOString(),
    attachments: [{ filename: 'song.mp3' }],
    type: 0,
    ...overrides,
  }
}

describe('streak accumulation (e2e)', () => {
  let db: DatabaseType
  let clock: ReturnType<typeof createClock>

  beforeEach(() => {
    db = makeDb()
    seedChannels(db)
    clock = createClock()
    clock.set(1_700_000_000)
  })

  it('first post creates a run_count of 1 and highest_run_seen of 1', () => {
    const msg = makeMsg({ id: 'msg-1', timestampSecs: clock.now() })
    const result = processMessage(db, msg)

    expect(result.isOk).toBe(true)
    expect(result.value).toBe(true)

    const stats = getUserStats(db, MC_ID, USER_A)
    expect(stats.isOk).toBe(true)
    expect(stats.value?.runCount).toBe(1)
    expect(stats.value?.highestRunSeen).toBe(1)
  })

  it('post within 8 hours does not increment run_count (noop)', () => {
    const t0 = clock.now()
    processMessage(db, makeMsg({ id: 'msg-1', timestampSecs: t0 }))

    clock.advance(4 * 3600)
    processMessage(db, makeMsg({ id: 'msg-2', timestampSecs: clock.now() }))

    const stats = getUserStats(db, MC_ID, USER_A)
    expect(stats.value?.runCount).toBe(1)
    expect(stats.value?.highestRunSeen).toBe(1)
  })

  it('post between 8h and 36h increments the streak', () => {
    const t0 = clock.now()
    processMessage(db, makeMsg({ id: 'msg-1', timestampSecs: t0 }))

    clock.advance(12 * 3600)
    processMessage(db, makeMsg({ id: 'msg-2', timestampSecs: clock.now() }))

    const stats = getUserStats(db, MC_ID, USER_A)
    expect(stats.value?.runCount).toBe(2)
    expect(stats.value?.highestRunSeen).toBe(2)
  })

  it('post after 36 hours resets the streak to 1', () => {
    const t0 = clock.now()
    processMessage(db, makeMsg({ id: 'msg-1', timestampSecs: t0 }))

    clock.advance(12 * 3600)
    processMessage(db, makeMsg({ id: 'msg-2', timestampSecs: clock.now() }))

    clock.advance(12 * 3600)
    processMessage(db, makeMsg({ id: 'msg-3', timestampSecs: clock.now() }))

    clock.advance(37 * 3600)
    processMessage(db, makeMsg({ id: 'msg-4', timestampSecs: clock.now() }))

    const stats = getUserStats(db, MC_ID, USER_A)
    expect(stats.value?.runCount).toBe(1)
    expect(stats.value?.highestRunSeen).toBe(3)
  })

  it('highest_run_seen tracks the peak streak across resets', () => {
    let id = 0
    const nextMsg = () => {
      id++
      return makeMsg({ id: `msg-${id}`, timestampSecs: clock.now() })
    }

    processMessage(db, nextMsg())
    clock.advance(12 * 3600)
    processMessage(db, nextMsg())
    clock.advance(12 * 3600)
    processMessage(db, nextMsg())
    clock.advance(12 * 3600)
    processMessage(db, nextMsg())
    clock.advance(12 * 3600)
    processMessage(db, nextMsg())

    let stats = getUserStats(db, MC_ID, USER_A)
    expect(stats.value?.runCount).toBe(5)
    expect(stats.value?.highestRunSeen).toBe(5)

    clock.advance(48 * 3600)
    processMessage(db, nextMsg())

    stats = getUserStats(db, MC_ID, USER_A)
    expect(stats.value?.runCount).toBe(1)
    expect(stats.value?.highestRunSeen).toBe(5)
  })

  it('multiple users tracked independently in the same channel', () => {
    const t0 = clock.now()
    processMessage(db, makeMsg({ id: 'msg-alice-1', timestampSecs: t0 }))

    const bobMsg = (msgId: string, ts: number): NormalizedMessage => ({
      id: msgId,
      channelId: MC_ID,
      guildId: GUILD_ID,
      author: { id: USER_B, username: 'bob', globalName: 'Bob', isBot: false },
      member: { nick: null },
      timestamp: new Date(ts * 1000).toISOString(),
      attachments: [{ filename: 'track.flac' }],
      type: 0,
    })

    processMessage(db, bobMsg('msg-bob-1', t0))

    clock.advance(12 * 3600)
    processMessage(db, makeMsg({ id: 'msg-alice-2', timestampSecs: clock.now() }))
    processMessage(db, bobMsg('msg-bob-2', clock.now()))

    clock.advance(12 * 3600)
    processMessage(db, makeMsg({ id: 'msg-alice-3', timestampSecs: clock.now() }))

    const aliceStats = getUserStats(db, MC_ID, USER_A)
    const bobStats = getUserStats(db, MC_ID, USER_B)

    expect(aliceStats.value?.runCount).toBe(3)
    expect(bobStats.value?.runCount).toBe(2)
  })

  it('duplicate message IDs are idempotent (no double-counting)', () => {
    const t0 = clock.now()
    const msg = makeMsg({ id: 'msg-dup', timestampSecs: t0 })

    processMessage(db, msg)
    processMessage(db, msg)
    processMessage(db, msg)

    const stats = getUserStats(db, MC_ID, USER_A)
    expect(stats.value?.runCount).toBe(1)
  })

  it('bot messages are ignored and do not affect stats', () => {
    const t0 = clock.now()
    const botMsg = makeMsg({
      id: 'msg-bot',
      timestampSecs: t0,
      author: { id: 'bot-001', username: 'MusicBot', globalName: null, isBot: true },
    })

    const result = processMessage(db, botMsg)
    expect(result.isOk).toBe(true)
    expect(result.value).toBe(false)

    const stats = getUserStats(db, MC_ID, 'bot-001')
    expect(stats.value).toBeNull()
  })

  it('non-music attachments are ignored', () => {
    const t0 = clock.now()
    const txtMsg = makeMsg({
      id: 'msg-txt',
      timestampSecs: t0,
      attachments: [{ filename: 'document.txt' }],
    })

    const result = processMessage(db, txtMsg)
    expect(result.value).toBe(false)

    const stats = getUserStats(db, MC_ID, USER_A)
    expect(stats.value).toBeNull()
  })

  it('messages from non-monitored channels are ignored', () => {
    const t0 = clock.now()
    const msg: NormalizedMessage = {
      id: 'msg-wrong-ch',
      channelId: 'some-other-channel',
      guildId: GUILD_ID,
      author: { id: USER_A, username: 'alice', globalName: 'Alice', isBot: false },
      member: { nick: null },
      timestamp: new Date(t0 * 1000).toISOString(),
      attachments: [{ filename: 'song.mp3' }],
      type: 0,
    }

    const result = processMessage(db, msg)
    expect(result.value).toBe(false)
  })

  it('hasPassed correctly used for scheduling — clock advances correctly', () => {
    const nextHour = clock.now() + 3600
    expect(clock.hasPassed(nextHour)).toBe(false)
    clock.advance(3600)
    expect(clock.hasPassed(nextHour)).toBe(true)
  })
})
