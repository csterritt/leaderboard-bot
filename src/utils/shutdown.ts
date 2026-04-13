import { logger } from './logger.js'

export interface ShutdownResources {
  server: { stop(): void }
  client: { destroy(): void }
  db: { close(): void }
  intervalId: ReturnType<typeof setInterval> | null
}

export const createShutdown = (resources: ShutdownResources): (() => void) => {
  let isShuttingDown = false

  return () => {
    if (isShuttingDown) return
    isShuttingDown = true

    logger.log('[shutdown] shutting down gracefully...')

    if (resources.intervalId !== null) {
      logger.log('[shutdown] clearing interval')
      clearInterval(resources.intervalId)
    }

    logger.log('[shutdown] stopping HTTP server')
    resources.server.stop()
    logger.log('[shutdown] destroying Discord client')
    resources.client.destroy()
    logger.log('[shutdown] closing database')
    resources.db.close()

    logger.log('[shutdown] complete')
  }
}
