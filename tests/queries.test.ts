import { describe, it, expect, beforeEach } from 'vitest'
import { Database } from 'bun:sqlite'
import { readFileSync } from 'fs'
import { join } from 'path'
import type { Database as DatabaseType } from '../src/types'
import {
  getUserStats,
  upsertUserStats,
  getLeaderboard,
  getLeaderboardChannels,
  upsertLeaderboardChannel,
  deleteLeaderboardChannel,
  getLeaderboardChannel,
  getLeaderboardPost,
  upsertLeaderboardPost,
  deleteLeaderboardPost,
  getRecoveryState,
  upsertRecoveryState,
  getMonitoredChannels,
  addMonitoredChannel,
  deleteMonitoredChannel,
  isMonitoredChannel,
  getMonitoredChannelByLeaderboard,
  claimProcessedMessage,
  hasProcessedMessage,
  pruneProcessedMessages,
} from '../src/db/queries'

const schema = readFileSync(join(import.meta.dirname, '../src/db/schema.sql'), 'utf-8')

function makeDb(): DatabaseType {
  const db = new Database(':memory:')
  db.exec(schema)
  return db
}

const CHANNEL_A = 'ch-001'
const CHANNEL_B = 'ch-002'
const LEADERBOARD_CHANNEL = 'lb-001'
const GUILD_ID = 'guild-001'
const USER_A = 'user-001'

describe('getUserStats', () => {
  it('returns Result.ok(null) for an unknown user', () => {
    const db = makeDb()
    const result = getUserStats(db, CHANNEL_A, USER_A)
    expect(result.isOk).toBe(true)
    expect(result.value).toBeNull()
  })

  it('returns Result.ok(UserStats) for a known user', () => {
    const db = makeDb()
    upsertUserStats(db, {
      channelId: CHANNEL_A,
      userId: USER_A,
      username: 'Alice',
      lastMusicPostAt: 1000,
      runCount: 3,
      highestRunSeen: 5,
    })
    const result = getUserStats(db, CHANNEL_A, USER_A)
    expect(result.isOk).toBe(true)
    expect(result.value).toMatchObject({
      channelId: CHANNEL_A,
      userId: USER_A,
      username: 'Alice',
      lastMusicPostAt: 1000,
      runCount: 3,
      highestRunSeen: 5,
    })
  })
})

describe('upsertUserStats', () => {
  it('inserts a new row when no record exists', () => {
    const db = makeDb()
    const r = upsertUserStats(db, {
      channelId: CHANNEL_A,
      userId: USER_A,
      username: 'Alice',
      lastMusicPostAt: 500,
      runCount: 1,
      highestRunSeen: 1,
    })
    expect(r.isOk).toBe(true)
    const fetched = getUserStats(db, CHANNEL_A, USER_A)
    expect(fetched.value).not.toBeNull()
    expect(fetched.value?.runCount).toBe(1)
  })

  it('updates an existing row using UPSERT semantics', () => {
    const db = makeDb()
    upsertUserStats(db, {
      channelId: CHANNEL_A,
      userId: USER_A,
      username: 'Alice',
      lastMusicPostAt: 500,
      runCount: 1,
      highestRunSeen: 1,
    })
    upsertUserStats(db, {
      channelId: CHANNEL_A,
      userId: USER_A,
      username: 'Alice',
      lastMusicPostAt: 2000,
      runCount: 4,
      highestRunSeen: 4,
    })
    const fetched = getUserStats(db, CHANNEL_A, USER_A)
    expect(fetched.value?.runCount).toBe(4)
    expect(fetched.value?.lastMusicPostAt).toBe(2000)
  })

  it('sets updated_at on insert', () => {
    const db = makeDb()
    upsertUserStats(db, {
      channelId: CHANNEL_A,
      userId: USER_A,
      username: 'Alice',
      lastMusicPostAt: 500,
      runCount: 1,
      highestRunSeen: 1,
    })
    const row = db
      .prepare('SELECT updated_at FROM user_stats WHERE channel_id = ? AND user_id = ?')
      .get(CHANNEL_A, USER_A) as { updated_at: string } | undefined
    expect(row?.updated_at).toBeTruthy()
  })

  it('refreshes updated_at on update', () => {
    const db = makeDb()
    upsertUserStats(db, {
      channelId: CHANNEL_A,
      userId: USER_A,
      username: 'Alice',
      lastMusicPostAt: 500,
      runCount: 1,
      highestRunSeen: 1,
    })
    const row1 = db
      .prepare('SELECT updated_at FROM user_stats WHERE channel_id = ? AND user_id = ?')
      .get(CHANNEL_A, USER_A) as { updated_at: string }

    upsertUserStats(db, {
      channelId: CHANNEL_A,
      userId: USER_A,
      username: 'Alice',
      lastMusicPostAt: 2000,
      runCount: 2,
      highestRunSeen: 2,
    })
    const row2 = db
      .prepare('SELECT updated_at FROM user_stats WHERE channel_id = ? AND user_id = ?')
      .get(CHANNEL_A, USER_A) as { updated_at: string }

    expect(row2.updated_at).toBeTruthy()
    expect(typeof row2.updated_at).toBe('string')
  })
})

describe('getLeaderboard', () => {
  it('returns an empty array for a channel with no data', () => {
    const db = makeDb()
    const result = getLeaderboard(db, CHANNEL_A)
    expect(result.isOk).toBe(true)
    expect(result.value).toEqual([])
  })

  it('returns rows sorted by run_count DESC, highest_run_seen DESC, max 50', () => {
    const db = makeDb()
    for (let i = 1; i <= 55; i++) {
      upsertUserStats(db, {
        channelId: CHANNEL_A,
        userId: `user-${i}`,
        username: `User${i}`,
        lastMusicPostAt: 1000,
        runCount: i,
        highestRunSeen: i * 2,
      })
    }
    const result = getLeaderboard(db, CHANNEL_A)
    expect(result.isOk).toBe(true)
    expect(result.value!.length).toBe(50)
    expect(result.value![0].runCount).toBe(55)
    expect(result.value![1].runCount).toBe(54)
  })

  it('excludes rows where both run_count = 0 and highest_run_seen = 0', () => {
    const db = makeDb()
    upsertUserStats(db, {
      channelId: CHANNEL_A,
      userId: 'user-zero',
      username: 'Zero',
      lastMusicPostAt: 1000,
      runCount: 0,
      highestRunSeen: 0,
    })
    upsertUserStats(db, {
      channelId: CHANNEL_A,
      userId: USER_A,
      username: 'Alice',
      lastMusicPostAt: 1000,
      runCount: 1,
      highestRunSeen: 1,
    })
    const result = getLeaderboard(db, CHANNEL_A)
    expect(result.value!.length).toBe(1)
    expect(result.value![0].username).toBe('Alice')
  })
})

describe('getLeaderboardChannels / upsertLeaderboardChannel / deleteLeaderboardChannel / getLeaderboardChannel', () => {
  it('getLeaderboardChannels returns empty array initially', () => {
    const db = makeDb()
    const result = getLeaderboardChannels(db)
    expect(result.isOk).toBe(true)
    expect(result.value).toEqual([])
  })

  it('upsertLeaderboardChannel inserts a new channel row', () => {
    const db = makeDb()
    const r = upsertLeaderboardChannel(db, {
      channelId: LEADERBOARD_CHANNEL,
      guildId: GUILD_ID,
      channelName: 'music-leaderboard',
      addedByUserId: USER_A,
    })
    expect(r.isOk).toBe(true)
    const channels = getLeaderboardChannels(db)
    expect(channels.value!.length).toBe(1)
    expect(channels.value![0].channelId).toBe(LEADERBOARD_CHANNEL)
  })

  it('upsertLeaderboardChannel updates channel_name and updated_at on conflict', () => {
    const db = makeDb()
    upsertLeaderboardChannel(db, {
      channelId: LEADERBOARD_CHANNEL,
      guildId: GUILD_ID,
      channelName: 'old-name',
      addedByUserId: USER_A,
    })
    upsertLeaderboardChannel(db, {
      channelId: LEADERBOARD_CHANNEL,
      guildId: GUILD_ID,
      channelName: 'new-name',
      addedByUserId: USER_A,
    })
    const ch = getLeaderboardChannel(db, LEADERBOARD_CHANNEL)
    expect(ch.value?.channelName).toBe('new-name')
  })

  it('deleteLeaderboardChannel removes the row', () => {
    const db = makeDb()
    upsertLeaderboardChannel(db, {
      channelId: LEADERBOARD_CHANNEL,
      guildId: GUILD_ID,
      channelName: 'music-lb',
      addedByUserId: USER_A,
    })
    deleteLeaderboardChannel(db, LEADERBOARD_CHANNEL)
    const channels = getLeaderboardChannels(db)
    expect(channels.value).toEqual([])
  })

  it('getLeaderboardChannel returns null for unknown channel', () => {
    const db = makeDb()
    const result = getLeaderboardChannel(db, 'nonexistent')
    expect(result.isOk).toBe(true)
    expect(result.value).toBeNull()
  })

  it('getLeaderboardChannel returns the row for a known channel', () => {
    const db = makeDb()
    upsertLeaderboardChannel(db, {
      channelId: LEADERBOARD_CHANNEL,
      guildId: GUILD_ID,
      channelName: 'music-lb',
      addedByUserId: USER_A,
    })
    const result = getLeaderboardChannel(db, LEADERBOARD_CHANNEL)
    expect(result.isOk).toBe(true)
    expect(result.value?.channelId).toBe(LEADERBOARD_CHANNEL)
    expect(result.value?.channelName).toBe('music-lb')
  })
})

describe('getLeaderboardPost / upsertLeaderboardPost / deleteLeaderboardPost', () => {
  it('getLeaderboardPost returns null for a channel with no stored post', () => {
    const db = makeDb()
    const result = getLeaderboardPost(db, LEADERBOARD_CHANNEL)
    expect(result.isOk).toBe(true)
    expect(result.value).toBeNull()
  })

  it('upsertLeaderboardPost overwrites the stored message for the same channel_id', () => {
    const db = makeDb()
    upsertLeaderboardPost(db, {
      channelId: LEADERBOARD_CHANNEL,
      messageId: 'msg-1',
      contentHash: 'hash1',
    })
    upsertLeaderboardPost(db, {
      channelId: LEADERBOARD_CHANNEL,
      messageId: 'msg-2',
      contentHash: 'hash2',
    })
    const result = getLeaderboardPost(db, LEADERBOARD_CHANNEL)
    expect(result.value?.messageId).toBe('msg-2')
  })

  it('upsertLeaderboardPost persists the content hash', () => {
    const db = makeDb()
    upsertLeaderboardPost(db, {
      channelId: LEADERBOARD_CHANNEL,
      messageId: 'msg-1',
      contentHash: 'abc123',
    })
    const result = getLeaderboardPost(db, LEADERBOARD_CHANNEL)
    expect(result.value?.contentHash).toBe('abc123')
  })

  it('deleteLeaderboardPost removes the row', () => {
    const db = makeDb()
    upsertLeaderboardPost(db, {
      channelId: LEADERBOARD_CHANNEL,
      messageId: 'msg-1',
      contentHash: 'h1',
    })
    deleteLeaderboardPost(db, LEADERBOARD_CHANNEL)
    const result = getLeaderboardPost(db, LEADERBOARD_CHANNEL)
    expect(result.value).toBeNull()
  })
})

describe('getRecoveryState / upsertRecoveryState', () => {
  it('returns null for an unknown channel', () => {
    const db = makeDb()
    const result = getRecoveryState(db, CHANNEL_A)
    expect(result.isOk).toBe(true)
    expect(result.value).toBeNull()
  })

  it('round-trips last_processed_message_id', () => {
    const db = makeDb()
    upsertRecoveryState(db, { channelId: CHANNEL_A, lastProcessedMessageId: 'msg-99' })
    const result = getRecoveryState(db, CHANNEL_A)
    expect(result.value?.lastProcessedMessageId).toBe('msg-99')
  })

  it('updated_at is set on insert and refreshed on update', () => {
    const db = makeDb()
    upsertRecoveryState(db, { channelId: CHANNEL_A, lastProcessedMessageId: 'msg-1' })
    const row1 = db
      .prepare('SELECT updated_at FROM recovery_state WHERE channel_id = ?')
      .get(CHANNEL_A) as { updated_at: string }
    expect(row1.updated_at).toBeTruthy()

    upsertRecoveryState(db, { channelId: CHANNEL_A, lastProcessedMessageId: 'msg-2' })
    const row2 = db
      .prepare('SELECT updated_at FROM recovery_state WHERE channel_id = ?')
      .get(CHANNEL_A) as { updated_at: string }
    expect(row2.updated_at).toBeTruthy()
  })
})

describe('getMonitoredChannels / addMonitoredChannel / deleteMonitoredChannel / isMonitoredChannel / getMonitoredChannelByLeaderboard', () => {
  beforeEach(() => {})

  it('monitored channels are empty initially', () => {
    const db = makeDb()
    const result = getMonitoredChannels(db)
    expect(result.isOk).toBe(true)
    expect(result.value).toEqual([])
  })

  it('adding a monitored channel with a leaderboardChannelId inserts a row', () => {
    const db = makeDb()
    upsertLeaderboardChannel(db, {
      channelId: LEADERBOARD_CHANNEL,
      guildId: GUILD_ID,
      channelName: 'lb',
      addedByUserId: USER_A,
    })
    const r = addMonitoredChannel(db, {
      channelId: CHANNEL_A,
      guildId: GUILD_ID,
      leaderboardChannelId: LEADERBOARD_CHANNEL,
    })
    expect(r.isOk).toBe(true)
    const all = getMonitoredChannels(db)
    expect(all.value!.length).toBe(1)
    expect(all.value![0].channelId).toBe(CHANNEL_A)
  })

  it('adding the same channel again is idempotent', () => {
    const db = makeDb()
    upsertLeaderboardChannel(db, {
      channelId: LEADERBOARD_CHANNEL,
      guildId: GUILD_ID,
      channelName: 'lb',
      addedByUserId: USER_A,
    })
    addMonitoredChannel(db, {
      channelId: CHANNEL_A,
      guildId: GUILD_ID,
      leaderboardChannelId: LEADERBOARD_CHANNEL,
    })
    const r2 = addMonitoredChannel(db, {
      channelId: CHANNEL_A,
      guildId: GUILD_ID,
      leaderboardChannelId: LEADERBOARD_CHANNEL,
    })
    expect(r2.isOk).toBe(true)
    const all = getMonitoredChannels(db)
    expect(all.value!.length).toBe(1)
  })

  it('adding a different monitored channel to a leaderboard channel that already has one is rejected', () => {
    const db = makeDb()
    upsertLeaderboardChannel(db, {
      channelId: LEADERBOARD_CHANNEL,
      guildId: GUILD_ID,
      channelName: 'lb',
      addedByUserId: USER_A,
    })
    addMonitoredChannel(db, {
      channelId: CHANNEL_A,
      guildId: GUILD_ID,
      leaderboardChannelId: LEADERBOARD_CHANNEL,
    })
    const r2 = addMonitoredChannel(db, {
      channelId: CHANNEL_B,
      guildId: GUILD_ID,
      leaderboardChannelId: LEADERBOARD_CHANNEL,
    })
    expect(r2.isErr).toBe(true)
  })

  it('deleting the channel removes it', () => {
    const db = makeDb()
    upsertLeaderboardChannel(db, {
      channelId: LEADERBOARD_CHANNEL,
      guildId: GUILD_ID,
      channelName: 'lb',
      addedByUserId: USER_A,
    })
    addMonitoredChannel(db, {
      channelId: CHANNEL_A,
      guildId: GUILD_ID,
      leaderboardChannelId: LEADERBOARD_CHANNEL,
    })
    deleteMonitoredChannel(db, CHANNEL_A)
    const all = getMonitoredChannels(db)
    expect(all.value).toEqual([])
  })

  it('isMonitoredChannel returns true for a monitored channel', () => {
    const db = makeDb()
    upsertLeaderboardChannel(db, {
      channelId: LEADERBOARD_CHANNEL,
      guildId: GUILD_ID,
      channelName: 'lb',
      addedByUserId: USER_A,
    })
    addMonitoredChannel(db, {
      channelId: CHANNEL_A,
      guildId: GUILD_ID,
      leaderboardChannelId: LEADERBOARD_CHANNEL,
    })
    const result = isMonitoredChannel(db, CHANNEL_A)
    expect(result.isOk).toBe(true)
    expect(result.value).toBe(true)
  })

  it('isMonitoredChannel returns false for a non-monitored channel', () => {
    const db = makeDb()
    const result = isMonitoredChannel(db, CHANNEL_A)
    expect(result.isOk).toBe(true)
    expect(result.value).toBe(false)
  })

  it('getMonitoredChannelByLeaderboard returns null when a leaderboard channel has no linked monitored channel', () => {
    const db = makeDb()
    upsertLeaderboardChannel(db, {
      channelId: LEADERBOARD_CHANNEL,
      guildId: GUILD_ID,
      channelName: 'lb',
      addedByUserId: USER_A,
    })
    const result = getMonitoredChannelByLeaderboard(db, LEADERBOARD_CHANNEL)
    expect(result.isOk).toBe(true)
    expect(result.value).toBeNull()
  })

  it('getMonitoredChannelByLeaderboard returns the linked monitored channel', () => {
    const db = makeDb()
    upsertLeaderboardChannel(db, {
      channelId: LEADERBOARD_CHANNEL,
      guildId: GUILD_ID,
      channelName: 'lb',
      addedByUserId: USER_A,
    })
    addMonitoredChannel(db, {
      channelId: CHANNEL_A,
      guildId: GUILD_ID,
      leaderboardChannelId: LEADERBOARD_CHANNEL,
    })
    const result = getMonitoredChannelByLeaderboard(db, LEADERBOARD_CHANNEL)
    expect(result.isOk).toBe(true)
    expect(result.value?.channelId).toBe(CHANNEL_A)
    expect(result.value?.leaderboardChannelId).toBe(LEADERBOARD_CHANNEL)
  })
})

describe('claimProcessedMessage / hasProcessedMessage / pruneProcessedMessages', () => {
  it('first claim for a message ID succeeds', () => {
    const db = makeDb()
    const result = claimProcessedMessage(db, { messageId: 'msg-1', channelId: CHANNEL_A })
    expect(result.isOk).toBe(true)
    expect(result.value).toBe(true)
  })

  it('second claim for the same message ID is rejected', () => {
    const db = makeDb()
    claimProcessedMessage(db, { messageId: 'msg-1', channelId: CHANNEL_A })
    const result = claimProcessedMessage(db, { messageId: 'msg-1', channelId: CHANNEL_A })
    expect(result.isOk).toBe(true)
    expect(result.value).toBe(false)
  })

  it('hasProcessedMessage returns true after a successful claim', () => {
    const db = makeDb()
    claimProcessedMessage(db, { messageId: 'msg-1', channelId: CHANNEL_A })
    const result = hasProcessedMessage(db, 'msg-1')
    expect(result.isOk).toBe(true)
    expect(result.value).toBe(true)
  })

  it('hasProcessedMessage returns false for an unclaimed message', () => {
    const db = makeDb()
    const result = hasProcessedMessage(db, 'msg-1')
    expect(result.isOk).toBe(true)
    expect(result.value).toBe(false)
  })

  it('pruneProcessedMessages deletes rows older than the provided threshold', () => {
    const db = makeDb()
    db.exec(`
      INSERT INTO processed_messages (message_id, channel_id, processed_at)
      VALUES ('old-msg', '${CHANNEL_A}', datetime('now', '-15 days'))
    `)
    pruneProcessedMessages(db, 14)
    const result = hasProcessedMessage(db, 'old-msg')
    expect(result.value).toBe(false)
  })

  it('pruneProcessedMessages preserves rows newer than the threshold', () => {
    const db = makeDb()
    claimProcessedMessage(db, { messageId: 'new-msg', channelId: CHANNEL_A })
    pruneProcessedMessages(db, 14)
    const result = hasProcessedMessage(db, 'new-msg')
    expect(result.value).toBe(true)
  })
})
