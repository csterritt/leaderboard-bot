import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createShutdown, type ShutdownResources } from '../src/utils/shutdown.js'
import { logger } from '../src/utils/logger.js'

function makeResources(): ShutdownResources & {
  server: { stop: ReturnType<typeof vi.fn> }
  client: { destroy: ReturnType<typeof vi.fn> }
  db: { close: ReturnType<typeof vi.fn> }
} {
  return {
    server: { stop: vi.fn() },
    client: { destroy: vi.fn() },
    db: { close: vi.fn() },
    intervalId: null,
  }
}

describe('createShutdown', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns a function', () => {
    const resources = makeResources()
    const shutdown = createShutdown(resources)
    expect(typeof shutdown).toBe('function')
  })

  it('stops the HTTP server', () => {
    const resources = makeResources()
    const shutdown = createShutdown(resources)
    shutdown()
    expect(resources.server.stop).toHaveBeenCalledTimes(1)
  })

  it('destroys the discord.js client', () => {
    const resources = makeResources()
    const shutdown = createShutdown(resources)
    shutdown()
    expect(resources.client.destroy).toHaveBeenCalledTimes(1)
  })

  it('closes the database connection', () => {
    const resources = makeResources()
    const shutdown = createShutdown(resources)
    shutdown()
    expect(resources.db.close).toHaveBeenCalledTimes(1)
  })

  it('clears the interval when intervalId is set', () => {
    const spy = vi.spyOn(globalThis, 'clearInterval')
    const resources = makeResources()
    const fakeId = setInterval(() => {}, 999_999)
    resources.intervalId = fakeId

    const shutdown = createShutdown(resources)
    shutdown()

    expect(spy).toHaveBeenCalledWith(fakeId)
    clearInterval(fakeId)
  })

  it('does not call clearInterval when intervalId is null', () => {
    const spy = vi.spyOn(globalThis, 'clearInterval')
    const resources = makeResources()
    const shutdown = createShutdown(resources)
    shutdown()
    expect(spy).not.toHaveBeenCalled()
  })

  it('is idempotent — calling twice only cleans up once', () => {
    const resources = makeResources()
    const shutdown = createShutdown(resources)
    shutdown()
    shutdown()
    expect(resources.server.stop).toHaveBeenCalledTimes(1)
    expect(resources.client.destroy).toHaveBeenCalledTimes(1)
    expect(resources.db.close).toHaveBeenCalledTimes(1)
  })

  it('logs shutdown messages with [shutdown] prefix', () => {
    const logSpy = vi.spyOn(logger, 'log').mockImplementation(() => {})
    const resources = makeResources()
    const shutdown = createShutdown(resources)
    shutdown()
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[shutdown]'))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[shutdown] complete'))
  })
})
