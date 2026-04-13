import { describe, it, expect, vi, beforeEach } from 'vitest'
import { logger } from '../src/utils/logger.js'

describe('logger', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('formats timestamp as YYYY-MM-DD HH:MM:SS in UTC', () => {
    const fixedDate = new Date('2024-01-15T12:30:45Z')
    const timestamp = logger._formatTimestamp(fixedDate)

    expect(timestamp).toBe('2024-01-15 12:30:45 UTC')
  })

  it('preserves log message content after timestamp', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    logger.log('[shutdown] shutting down gracefully...')

    expect(logSpy).toHaveBeenCalledTimes(1)
    const output = logSpy.mock.calls[0]?.[0] as string
    expect(output).toContain('[shutdown] shutting down gracefully...')
    expect(output).toMatch(
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC \[shutdown\] shutting down gracefully\.\.\.$/,
    )
  })

  it('handles error logging with timestamp', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    logger.error('[discord] sendMessage failed')

    expect(errorSpy).toHaveBeenCalledTimes(1)
    const output = errorSpy.mock.calls[0]?.[0] as string
    expect(output).toMatch(
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC \[discord\] sendMessage failed$/,
    )
  })

  it('handles warn logging with timestamp', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    logger.warn('[discord] rate limited')

    expect(warnSpy).toHaveBeenCalledTimes(1)
    const output = warnSpy.mock.calls[0]?.[0] as string
    expect(output).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC \[discord\] rate limited$/)
  })

  it('handles multiple arguments for log', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    logger.log('message', 'extra', 'args')

    expect(logSpy).toHaveBeenCalledTimes(1)
    const output = logSpy.mock.calls[0]?.[0] as string
    expect(output).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC message$/)
    expect(logSpy.mock.calls[0]?.[1]).toBe('extra')
    expect(logSpy.mock.calls[0]?.[2]).toBe('args')
  })

  it('handles error objects in error logging', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const testError = new Error('test error')
    logger.error('error occurred', testError)

    expect(errorSpy).toHaveBeenCalledTimes(1)
    const output = errorSpy.mock.calls[0]?.[0] as string
    expect(output).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC error occurred$/)
    expect(errorSpy.mock.calls[0]?.[1]).toBe(testError)
  })
})
