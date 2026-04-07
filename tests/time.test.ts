import { describe, it, expect } from 'vitest'
import { parseDiscordTimestamp, computeStreakDelta } from '../src/utils/time'

describe('parseDiscordTimestamp', () => {
  it('converts a basic ISO8601 string to Unix seconds', () => {
    expect(parseDiscordTimestamp('2024-01-15T12:00:00.000Z')).toBe(1705320000)
  })

  it('handles fractional seconds', () => {
    expect(parseDiscordTimestamp('2024-01-15T12:00:00.999Z')).toBe(1705320000)
  })

  it('normalizes a timezone-offset timestamp to UTC Unix seconds', () => {
    expect(parseDiscordTimestamp('2024-01-15T13:00:00.000+01:00')).toBe(1705320000)
  })

  it('returns an integer (no fractional seconds)', () => {
    const result = parseDiscordTimestamp('2024-06-01T00:00:00.500Z')
    expect(Number.isInteger(result)).toBe(true)
  })
})

describe('computeStreakDelta', () => {
  it('returns "first" when delta is null', () => {
    expect(computeStreakDelta(null)).toBe('first')
  })

  it('clamps negative deltas to 0 and returns "noop"', () => {
    expect(computeStreakDelta(-1000)).toBe('noop')
  })

  it('clamps delta of -99999 to 0 and returns "noop"', () => {
    expect(computeStreakDelta(-99999)).toBe('noop')
  })

  it('returns "noop" for delta equal to 8 hours (28800s)', () => {
    expect(computeStreakDelta(28_800)).toBe('noop')
  })

  it('returns "noop" for delta of 0', () => {
    expect(computeStreakDelta(0)).toBe('noop')
  })

  it('returns "increment" for delta just over 8 hours (28801s)', () => {
    expect(computeStreakDelta(28_801)).toBe('increment')
  })

  it('returns "increment" for delta equal to 36 hours (129600s)', () => {
    expect(computeStreakDelta(129_600)).toBe('increment')
  })

  it('returns "reset" for delta just over 36 hours (129601s)', () => {
    expect(computeStreakDelta(129_601)).toBe('reset')
  })

  it('returns "reset" for large delta', () => {
    expect(computeStreakDelta(1_000_000)).toBe('reset')
  })
})
