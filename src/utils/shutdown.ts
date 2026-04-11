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

    console.log('[shutdown] shutting down gracefully...')

    if (resources.intervalId !== null) {
      console.log('[shutdown] clearing interval')
      clearInterval(resources.intervalId)
    }

    console.log('[shutdown] stopping HTTP server')
    resources.server.stop()
    console.log('[shutdown] destroying Discord client')
    resources.client.destroy()
    console.log('[shutdown] closing database')
    resources.db.close()

    console.log('[shutdown] complete')
  }
}
