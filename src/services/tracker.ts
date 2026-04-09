import { MUSIC_EXTENSIONS, AUDIO_CONTENT_TYPE_PREFIX } from '../constants'
import { computeStreakDelta } from '../utils/time'
import type {
  UserStats,
  UpsertUserStatsInput,
  NormalizedAttachment,
  NormalizedAuthor,
  NormalizedMember,
} from '../types'

// ─── 3.1 computeNewStats ─────────────────────────────────────────────────────

export const computeNewStats = (
  existing: UserStats | null,
  newPostTimestamp: number,
  username: string,
  userId: string,
  channelId: string,
): UpsertUserStatsInput => {
  if (existing === null) {
    return {
      channelId,
      userId,
      username,
      lastMusicPostAt: newPostTimestamp,
      runCount: 1,
      highestRunSeen: 1,
    }
  }

  const lastAt = existing.lastMusicPostAt ?? newPostTimestamp
  const deltaSecs = newPostTimestamp - lastAt
  const kind = computeStreakDelta(deltaSecs)

  const newerTimestamp = newPostTimestamp > lastAt ? newPostTimestamp : lastAt

  let runCount: number
  let lastMusicPostAt: number

  switch (kind) {
    case 'noop':
      runCount = existing.runCount
      lastMusicPostAt = newerTimestamp
      break
    case 'increment':
      runCount = existing.runCount + 1
      lastMusicPostAt = newPostTimestamp
      break
    case 'reset':
      runCount = 1
      lastMusicPostAt = newPostTimestamp
      break
    default:
      runCount = existing.runCount
      lastMusicPostAt = newerTimestamp
  }

  const highestRunSeen = Math.max(existing.highestRunSeen, runCount)

  return {
    channelId,
    userId,
    username,
    lastMusicPostAt,
    runCount,
    highestRunSeen,
  }
}

// ─── 3.2 hasMusicAttachment ──────────────────────────────────────────────────

export const hasMusicAttachment = (attachments: readonly NormalizedAttachment[]): boolean => {
  for (const att of attachments) {
    if (att.filename) {
      const lower = att.filename.toLowerCase()
      if ((MUSIC_EXTENSIONS as readonly string[]).some((ext) => lower.endsWith(ext))) {
        return true
      }
    } else if (att.contentType) {
      if (att.contentType.startsWith(AUDIO_CONTENT_TYPE_PREFIX)) {
        return true
      }
    }
  }
  return false
}

// ─── 3.3 resolveUsername ─────────────────────────────────────────────────────

export const resolveUsername = (
  author: NormalizedAuthor,
  member: NormalizedMember | undefined,
): string => {
  if (member?.nick) return member.nick
  if (author.globalName) return author.globalName
  return author.username
}
