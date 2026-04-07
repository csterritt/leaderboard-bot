import { Result } from 'true-myth'
import { toResult, withRetry } from '../utils/db-helpers'
import { LEADERBOARD_MAX_ROWS } from '../constants'
import type {
  Database,
  UserStats,
  UpsertUserStatsInput,
  LeaderboardRow,
  LeaderboardChannel,
  LeaderboardPost,
  MonitoredChannel,
  RecoveryState,
  ProcessedMessage,
} from '../types'

// ─── Row types (DB snake_case) ───────────────────────────────────────────────

interface UserStatsRow {
  channel_id: string
  user_id: string
  username: string
  last_music_post_at: number | null
  run_count: number
  highest_run_seen: number
}

interface LeaderboardChannelRow {
  channel_id: string
  guild_id: string
  channel_name: string
  added_by_user_id: string
}

interface LeaderboardPostRow {
  channel_id: string
  message_id: string
  content_hash: string
}

interface RecoveryStateRow {
  channel_id: string
  last_processed_message_id: string | null
}

interface MonitoredChannelRow {
  channel_id: string
  guild_id: string
  leaderboard_channel_id: string
}

// ─── Mappers ─────────────────────────────────────────────────────────────────

const mapUserStats = (row: UserStatsRow): UserStats => ({
  channelId: row.channel_id,
  userId: row.user_id,
  username: row.username,
  lastMusicPostAt: row.last_music_post_at,
  runCount: row.run_count,
  highestRunSeen: row.highest_run_seen,
})

const mapLeaderboardChannel = (row: LeaderboardChannelRow): LeaderboardChannel => ({
  channelId: row.channel_id,
  guildId: row.guild_id,
  channelName: row.channel_name,
  addedByUserId: row.added_by_user_id,
})

const mapLeaderboardPost = (row: LeaderboardPostRow): LeaderboardPost => ({
  channelId: row.channel_id,
  messageId: row.message_id,
  contentHash: row.content_hash,
})

const mapRecoveryState = (row: RecoveryStateRow): RecoveryState => ({
  channelId: row.channel_id,
  lastProcessedMessageId: row.last_processed_message_id,
})

const mapMonitoredChannel = (row: MonitoredChannelRow): MonitoredChannel => ({
  channelId: row.channel_id,
  guildId: row.guild_id,
  leaderboardChannelId: row.leaderboard_channel_id,
})

// ─── 2.1 getUserStats ────────────────────────────────────────────────────────

const getUserStatsActual = (
  db: Database,
  channelId: string,
  userId: string,
): Result<UserStats | null, Error> =>
  toResult(() => {
    const row = db
      .prepare('SELECT * FROM user_stats WHERE channel_id = ? AND user_id = ?')
      .get(channelId, userId) as UserStatsRow | undefined
    return row ? mapUserStats(row) : null
  })

export const getUserStats = (
  db: Database,
  channelId: string,
  userId: string,
): Result<UserStats | null, Error> =>
  withRetry('getUserStats', () => getUserStatsActual(db, channelId, userId))

// ─── 2.2 upsertUserStats ─────────────────────────────────────────────────────

const upsertUserStatsActual = (
  db: Database,
  stats: UpsertUserStatsInput,
): Result<void, Error> =>
  toResult(() => {
    db.prepare(`
      INSERT INTO user_stats (channel_id, user_id, username, last_music_post_at, run_count, highest_run_seen, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(channel_id, user_id) DO UPDATE SET
        username = excluded.username,
        last_music_post_at = excluded.last_music_post_at,
        run_count = excluded.run_count,
        highest_run_seen = excluded.highest_run_seen,
        updated_at = CURRENT_TIMESTAMP
    `).run(stats.channelId, stats.userId, stats.username, stats.lastMusicPostAt, stats.runCount, stats.highestRunSeen)
  })

export const upsertUserStats = (
  db: Database,
  stats: UpsertUserStatsInput,
): Result<void, Error> =>
  withRetry('upsertUserStats', () => upsertUserStatsActual(db, stats))

// ─── 2.3 getLeaderboard ──────────────────────────────────────────────────────

const getLeaderboardActual = (
  db: Database,
  channelId: string,
): Result<LeaderboardRow[], Error> =>
  toResult(() => {
    const rows = db.prepare(`
      SELECT username, run_count, highest_run_seen
      FROM user_stats
      WHERE channel_id = ? AND NOT (run_count = 0 AND highest_run_seen = 0)
      ORDER BY run_count DESC, highest_run_seen DESC
      LIMIT ?
    `).all(channelId, LEADERBOARD_MAX_ROWS) as Array<{ username: string; run_count: number; highest_run_seen: number }>
    return rows.map((r) => ({ username: r.username, runCount: r.run_count, highestRunSeen: r.highest_run_seen }))
  })

export const getLeaderboard = (
  db: Database,
  channelId: string,
): Result<LeaderboardRow[], Error> =>
  withRetry('getLeaderboard', () => getLeaderboardActual(db, channelId))

// ─── 2.4 leaderboard_channels ────────────────────────────────────────────────

const getLeaderboardChannelsActual = (db: Database): Result<LeaderboardChannel[], Error> =>
  toResult(() => {
    const rows = db.prepare('SELECT * FROM leaderboard_channels').all() as LeaderboardChannelRow[]
    return rows.map(mapLeaderboardChannel)
  })

export const getLeaderboardChannels = (db: Database): Result<LeaderboardChannel[], Error> =>
  withRetry('getLeaderboardChannels', () => getLeaderboardChannelsActual(db))

const upsertLeaderboardChannelActual = (
  db: Database,
  channel: LeaderboardChannel,
): Result<void, Error> =>
  toResult(() => {
    db.prepare(`
      INSERT INTO leaderboard_channels (channel_id, guild_id, channel_name, added_by_user_id, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(channel_id) DO UPDATE SET
        channel_name = excluded.channel_name,
        updated_at = CURRENT_TIMESTAMP
    `).run(channel.channelId, channel.guildId, channel.channelName, channel.addedByUserId)
  })

export const upsertLeaderboardChannel = (
  db: Database,
  channel: LeaderboardChannel,
): Result<void, Error> =>
  withRetry('upsertLeaderboardChannel', () => upsertLeaderboardChannelActual(db, channel))

const deleteLeaderboardChannelActual = (db: Database, channelId: string): Result<void, Error> =>
  toResult(() => {
    db.prepare('DELETE FROM leaderboard_channels WHERE channel_id = ?').run(channelId)
  })

export const deleteLeaderboardChannel = (db: Database, channelId: string): Result<void, Error> =>
  withRetry('deleteLeaderboardChannel', () => deleteLeaderboardChannelActual(db, channelId))

const getLeaderboardChannelActual = (
  db: Database,
  channelId: string,
): Result<LeaderboardChannel | null, Error> =>
  toResult(() => {
    const row = db
      .prepare('SELECT * FROM leaderboard_channels WHERE channel_id = ?')
      .get(channelId) as LeaderboardChannelRow | undefined
    return row ? mapLeaderboardChannel(row) : null
  })

export const getLeaderboardChannel = (
  db: Database,
  channelId: string,
): Result<LeaderboardChannel | null, Error> =>
  withRetry('getLeaderboardChannel', () => getLeaderboardChannelActual(db, channelId))

// ─── 2.5 leaderboard_posts ───────────────────────────────────────────────────

const getLeaderboardPostActual = (
  db: Database,
  channelId: string,
): Result<LeaderboardPost | null, Error> =>
  toResult(() => {
    const row = db
      .prepare('SELECT * FROM leaderboard_posts WHERE channel_id = ?')
      .get(channelId) as LeaderboardPostRow | undefined
    return row ? mapLeaderboardPost(row) : null
  })

export const getLeaderboardPost = (
  db: Database,
  channelId: string,
): Result<LeaderboardPost | null, Error> =>
  withRetry('getLeaderboardPost', () => getLeaderboardPostActual(db, channelId))

const upsertLeaderboardPostActual = (
  db: Database,
  post: LeaderboardPost,
): Result<void, Error> =>
  toResult(() => {
    db.prepare(`
      INSERT INTO leaderboard_posts (channel_id, message_id, content_hash)
      VALUES (?, ?, ?)
      ON CONFLICT(channel_id) DO UPDATE SET
        message_id = excluded.message_id,
        content_hash = excluded.content_hash,
        posted_at = CURRENT_TIMESTAMP
    `).run(post.channelId, post.messageId, post.contentHash)
  })

export const upsertLeaderboardPost = (
  db: Database,
  post: LeaderboardPost,
): Result<void, Error> =>
  withRetry('upsertLeaderboardPost', () => upsertLeaderboardPostActual(db, post))

const deleteLeaderboardPostActual = (db: Database, channelId: string): Result<void, Error> =>
  toResult(() => {
    db.prepare('DELETE FROM leaderboard_posts WHERE channel_id = ?').run(channelId)
  })

export const deleteLeaderboardPost = (db: Database, channelId: string): Result<void, Error> =>
  withRetry('deleteLeaderboardPost', () => deleteLeaderboardPostActual(db, channelId))

// ─── 2.6 recovery_state ──────────────────────────────────────────────────────

const getRecoveryStateActual = (
  db: Database,
  channelId: string,
): Result<RecoveryState | null, Error> =>
  toResult(() => {
    const row = db
      .prepare('SELECT * FROM recovery_state WHERE channel_id = ?')
      .get(channelId) as RecoveryStateRow | undefined
    return row ? mapRecoveryState(row) : null
  })

export const getRecoveryState = (
  db: Database,
  channelId: string,
): Result<RecoveryState | null, Error> =>
  withRetry('getRecoveryState', () => getRecoveryStateActual(db, channelId))

const upsertRecoveryStateActual = (
  db: Database,
  state: RecoveryState,
): Result<void, Error> =>
  toResult(() => {
    db.prepare(`
      INSERT INTO recovery_state (channel_id, last_processed_message_id, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(channel_id) DO UPDATE SET
        last_processed_message_id = excluded.last_processed_message_id,
        updated_at = CURRENT_TIMESTAMP
    `).run(state.channelId, state.lastProcessedMessageId)
  })

export const upsertRecoveryState = (
  db: Database,
  state: RecoveryState,
): Result<void, Error> =>
  withRetry('upsertRecoveryState', () => upsertRecoveryStateActual(db, state))

// ─── 2.7 monitored_channels ──────────────────────────────────────────────────

const getMonitoredChannelsActual = (db: Database): Result<MonitoredChannel[], Error> =>
  toResult(() => {
    const rows = db.prepare('SELECT * FROM monitored_channels').all() as MonitoredChannelRow[]
    return rows.map(mapMonitoredChannel)
  })

export const getMonitoredChannels = (db: Database): Result<MonitoredChannel[], Error> =>
  withRetry('getMonitoredChannels', () => getMonitoredChannelsActual(db))

const addMonitoredChannelActual = (
  db: Database,
  channel: MonitoredChannel,
): Result<void, Error> =>
  toResult(() => {
    db.prepare(`
      INSERT INTO monitored_channels (channel_id, guild_id, leaderboard_channel_id)
      VALUES (?, ?, ?)
      ON CONFLICT(channel_id) DO NOTHING
    `).run(channel.channelId, channel.guildId, channel.leaderboardChannelId)
  })

export const addMonitoredChannel = (
  db: Database,
  channel: MonitoredChannel,
): Result<void, Error> =>
  withRetry('addMonitoredChannel', () => addMonitoredChannelActual(db, channel))

const deleteMonitoredChannelActual = (db: Database, channelId: string): Result<void, Error> =>
  toResult(() => {
    db.prepare('DELETE FROM monitored_channels WHERE channel_id = ?').run(channelId)
  })

export const deleteMonitoredChannel = (db: Database, channelId: string): Result<void, Error> =>
  withRetry('deleteMonitoredChannel', () => deleteMonitoredChannelActual(db, channelId))

const isMonitoredChannelActual = (
  db: Database,
  channelId: string,
): Result<boolean, Error> =>
  toResult(() => {
    const row = db
      .prepare('SELECT 1 FROM monitored_channels WHERE channel_id = ?')
      .get(channelId)
    return row !== undefined
  })

export const isMonitoredChannel = (
  db: Database,
  channelId: string,
): Result<boolean, Error> =>
  withRetry('isMonitoredChannel', () => isMonitoredChannelActual(db, channelId))

const getMonitoredChannelByLeaderboardActual = (
  db: Database,
  leaderboardChannelId: string,
): Result<MonitoredChannel | null, Error> =>
  toResult(() => {
    const row = db
      .prepare('SELECT * FROM monitored_channels WHERE leaderboard_channel_id = ?')
      .get(leaderboardChannelId) as MonitoredChannelRow | undefined
    return row ? mapMonitoredChannel(row) : null
  })

export const getMonitoredChannelByLeaderboard = (
  db: Database,
  leaderboardChannelId: string,
): Result<MonitoredChannel | null, Error> =>
  withRetry('getMonitoredChannelByLeaderboard', () =>
    getMonitoredChannelByLeaderboardActual(db, leaderboardChannelId),
  )

// ─── 2.8 processed_messages ──────────────────────────────────────────────────

const claimProcessedMessageActual = (
  db: Database,
  msg: ProcessedMessage,
): Result<boolean, Error> =>
  toResult(() => {
    const info = db
      .prepare(`
        INSERT INTO processed_messages (message_id, channel_id)
        VALUES (?, ?)
        ON CONFLICT(message_id) DO NOTHING
      `)
      .run(msg.messageId, msg.channelId)
    return info.changes > 0
  })

export const claimProcessedMessage = (
  db: Database,
  msg: ProcessedMessage,
): Result<boolean, Error> =>
  withRetry('claimProcessedMessage', () => claimProcessedMessageActual(db, msg))

const hasProcessedMessageActual = (
  db: Database,
  messageId: string,
): Result<boolean, Error> =>
  toResult(() => {
    const row = db
      .prepare('SELECT 1 FROM processed_messages WHERE message_id = ?')
      .get(messageId)
    return row !== undefined
  })

export const hasProcessedMessage = (
  db: Database,
  messageId: string,
): Result<boolean, Error> =>
  withRetry('hasProcessedMessage', () => hasProcessedMessageActual(db, messageId))

const pruneProcessedMessagesActual = (
  db: Database,
  thresholdDays: number,
): Result<void, Error> =>
  toResult(() => {
    db.prepare(`
      DELETE FROM processed_messages
      WHERE processed_at < datetime('now', ? || ' days')
    `).run(`-${thresholdDays}`)
  })

export const pruneProcessedMessages = (
  db: Database,
  thresholdDays: number,
): Result<void, Error> =>
  withRetry('pruneProcessedMessages', () => pruneProcessedMessagesActual(db, thresholdDays))
