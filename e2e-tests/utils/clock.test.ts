import { describe, it, expect, beforeEach } from 'vitest'
import { createClock, type Clock } from '../../src/utils/clock'

describe('createClock', () => {
  it('now() returns the current time as Unix seconds', () => {
    const before = Math.floor(Date.now() / 1000)
    const clock = createClock()
    const t = clock.now()
    const after = Math.floor(Date.now() / 1000)
    expect(t).toBeGreaterThanOrEqual(before)
    expect(t).toBeLessThanOrEqual(after)
  })

  it('set() overrides the current time returned by now()', () => {
    const clock = createClock()
    clock.set(1_000_000)
    expect(clock.now()).toBe(1_000_000)
  })

  it('advance() moves the clock forward by the given number of seconds', () => {
    const clock = createClock()
    clock.set(1_000_000)
    clock.advance(3600)
    expect(clock.now()).toBe(1_003_600)
  })

  it('advance() can be called multiple times cumulatively', () => {
    const clock = createClock()
    clock.set(0)
    clock.advance(100)
    clock.advance(200)
    clock.advance(300)
    expect(clock.now()).toBe(600)
  })

  it('hasPassed() returns false when the given time is in the future', () => {
    const clock = createClock()
    clock.set(1_000_000)
    expect(clock.hasPassed(1_000_001)).toBe(false)
  })

  it('hasPassed() returns true when the given time equals now', () => {
    const clock = createClock()
    clock.set(1_000_000)
    expect(clock.hasPassed(1_000_000)).toBe(true)
  })

  it('hasPassed() returns true when the given time is in the past', () => {
    const clock = createClock()
    clock.set(1_000_000)
    expect(clock.hasPassed(999_999)).toBe(true)
  })

  it('reset() restores real-time behaviour', () => {
    const clock = createClock()
    clock.set(42)
    clock.reset()
    const now = clock.now()
    expect(now).toBeGreaterThan(1_000_000_000)
  })

  it('set() followed by advance() works correctly', () => {
    const clock = createClock()
    clock.set(500)
    clock.advance(500)
    expect(clock.now()).toBe(1000)
    expect(clock.hasPassed(1000)).toBe(true)
    expect(clock.hasPassed(1001)).toBe(false)
  })
})
