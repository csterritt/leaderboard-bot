import { describe, it, expect } from 'vitest'
import { formatLeaderboard, hashContent } from '../src/services/leaderboard'
import type { LeaderboardRow } from '../src/types'

const DISCORD_MESSAGE_LIMIT = 2000

function makeRows(count: number): LeaderboardRow[] {
  return Array.from({ length: count }, (_, i) => ({
    username: `User${i + 1}`,
    runCount: count - i,
    highestRunSeen: count - i,
  }))
}

// ─── formatLeaderboard ────────────────────────────────────────────────────────

describe('formatLeaderboard', () => {
  it('returns a formatted header using the provided channel display name', () => {
    const result = formatLeaderboard('my-channel', [])
    expect(result).toContain('my-channel')
  })

  it('returns a "no data" message for an empty leaderboard', () => {
    const result = formatLeaderboard('general', [])
    expect(result.toLowerCase()).toContain('no data')
  })

  it('ranks start at 1 and increment correctly', () => {
    const rows: LeaderboardRow[] = [
      { username: 'Alice', runCount: 5, highestRunSeen: 5 },
      { username: 'Bob', runCount: 3, highestRunSeen: 4 },
      { username: 'Carol', runCount: 1, highestRunSeen: 2 },
    ]
    const result = formatLeaderboard('music', rows)
    expect(result).toContain('#1')
    expect(result).toContain('#2')
    expect(result).toContain('#3')
    expect(result).not.toContain('#0')
    expect(result).not.toContain('#4')
  })

  it('usernames containing pipes are escaped or normalized safely', () => {
    const rows: LeaderboardRow[] = [
      { username: 'Alice|Bob', runCount: 1, highestRunSeen: 1 },
    ]
    const result = formatLeaderboard('music', rows)
    expect(result).not.toMatch(/\|.*\|.*\|/)
  })

  it('usernames containing backticks are escaped or normalized safely', () => {
    const rows: LeaderboardRow[] = [
      { username: 'hack`rm -rf`er', runCount: 1, highestRunSeen: 1 },
    ]
    const result = formatLeaderboard('music', rows)
    const inlineCodeCount = (result.match(/`/g) ?? []).length
    expect(inlineCodeCount % 2).toBe(0)
  })

  it('long display names are handled without breaking the output', () => {
    const rows: LeaderboardRow[] = [
      { username: 'A'.repeat(100), runCount: 1, highestRunSeen: 1 },
    ]
    const result = formatLeaderboard('music', rows)
    expect(result.length).toBeLessThanOrEqual(DISCORD_MESSAGE_LIMIT)
  })

  it('formatted content remains below Discord message limit for maximum row count (50)', () => {
    const rows = makeRows(50)
    const result = formatLeaderboard('music', rows)
    expect(result.length).toBeLessThanOrEqual(DISCORD_MESSAGE_LIMIT)
  })
})

// ─── hashContent ──────────────────────────────────────────────────────────────

describe('hashContent', () => {
  it('produces a consistent hex digest for the same input', () => {
    const h1 = hashContent('hello world')
    const h2 = hashContent('hello world')
    expect(h1).toBe(h2)
  })

  it('matches the known FNV-1a 32-bit hash for hello world', () => {
    expect(hashContent('hello world')).toBe('d58b3fa7')
  })

  it('produces different digests for different inputs', () => {
    const h1 = hashContent('hello world')
    const h2 = hashContent('hello worlds')
    expect(h1).not.toBe(h2)
  })

  it('returns a hex string', () => {
    const h = hashContent('test')
    expect(h).toMatch(/^[0-9a-f]+$/)
  })

  it('produces the same hash across calls (deterministic)', () => {
    const inputs = ['', 'a', 'abc', '🎵 music 🎵']
    for (const input of inputs) {
      expect(hashContent(input)).toBe(hashContent(input))
    }
  })
})
