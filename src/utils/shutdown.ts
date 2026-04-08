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

    console.log('Shutting down gracefully...')

    if (resources.intervalId !== null) {
      clearInterval(resources.intervalId)
    }

    resources.server.stop()
    resources.client.destroy()
    resources.db.close()

    console.log('Shutdown complete')
  }
}
