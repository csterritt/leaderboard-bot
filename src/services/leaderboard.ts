import type { LeaderboardRow } from '../types'

// ─── 5.2 hashContent (FNV-1a) ─────────────────────────────────────────────────

export const hashContent = (content: string): string => {
  let hash = 2166136261
  for (let i = 0; i < content.length; i++) {
    hash ^= content.charCodeAt(i)
    hash = Math.imul(hash, 16777619) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

// ─── 5.1 formatLeaderboard ────────────────────────────────────────────────────

const MAX_USERNAME_LEN = 32

const escapeUsername = (username: string): string => {
  let safe = username.replace(/[`|]/g, ' ')
  if (safe.length > MAX_USERNAME_LEN) {
    safe = safe.slice(0, MAX_USERNAME_LEN - 1) + '…'
  }
  return safe
}

export const formatLeaderboard = (channelName: string, rows: LeaderboardRow[]): string => {
  const header = `**🎵 Music Leaderboard — #${channelName}**\n`

  if (rows.length === 0) {
    return header + '_No data yet. Start posting music!_'
  }

  const lines = rows.map((row, index) => {
    const rank = `#${index + 1}`
    const username = escapeUsername(row.username)
    return `${rank} **${username}** — streak: ${row.runCount} (best: ${row.highestRunSeen})`
  })

  return header + lines.join('\n')
}
