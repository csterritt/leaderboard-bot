import { describe, it, expect, vi } from 'vitest'
import { toResult, withRetry } from '../src/utils/db-helpers'
import { Result } from 'true-myth'

describe('toResult', () => {
  it('returns Result.ok(value) when the callback succeeds', () => {
    const result = toResult(() => 42)
    expect(result.isOk).toBe(true)
    expect(result.value).toBe(42)
  })

  it('returns Result.err(Error) when the callback throws an Error', () => {
    const result = toResult(() => { throw new Error('boom') })
    expect(result.isErr).toBe(true)
    expect((result.error as Error).message).toBe('boom')
  })

  it('wraps a non-Error thrown value in an Error', () => {
    const result = toResult(() => { throw 'string error' })
    expect(result.isErr).toBe(true)
    expect(result.error).toBeInstanceOf(Error)
  })
})

describe('withRetry', () => {
  it('returns immediately on first success without retrying', () => {
    const op = vi.fn(() => Result.ok(1))
    const result = withRetry('test', op)
    expect(result.isOk).toBe(true)
    expect(result.value).toBe(1)
    expect(op).toHaveBeenCalledTimes(1)
  })

  it('retries when the inner operation returns SQLITE_BUSY', () => {
    const busyError = new Error('SQLITE_BUSY: database is locked')
    const op = vi.fn()
      .mockReturnValueOnce(Result.err(busyError))
      .mockReturnValueOnce(Result.ok(99))
    const result = withRetry('test', op)
    expect(result.isOk).toBe(true)
    expect(result.value).toBe(99)
    expect(op).toHaveBeenCalledTimes(2)
  })

  it('retries when the inner operation returns SQLITE_LOCKED', () => {
    const lockedError = new Error('SQLITE_LOCKED: table is locked')
    const op = vi.fn()
      .mockReturnValueOnce(Result.err(lockedError))
      .mockReturnValueOnce(Result.ok(42))
    const result = withRetry('test', op)
    expect(result.isOk).toBe(true)
    expect(result.value).toBe(42)
    expect(op).toHaveBeenCalledTimes(2)
  })

  it('does not retry non-transient errors', () => {
    const fatalError = new Error('constraint failed')
    const op = vi.fn(() => Result.err(fatalError))
    const result = withRetry('test', op)
    expect(result.isErr).toBe(true)
    expect(op).toHaveBeenCalledTimes(1)
  })

  it('returns the last error after all retries are exhausted on SQLITE_BUSY', () => {
    const busyError = new Error('SQLITE_BUSY: database is locked')
    const op = vi.fn(() => Result.err(busyError))
    const result = withRetry('test', op)
    expect(result.isErr).toBe(true)
    expect(op).toHaveBeenCalledTimes(4) // initial attempt + 3 retries
  })
})
