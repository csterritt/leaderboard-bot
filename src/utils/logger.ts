function formatTimestamp(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  const hours = String(date.getUTCHours()).padStart(2, '0')
  const minutes = String(date.getUTCMinutes()).padStart(2, '0')
  const seconds = String(date.getUTCSeconds()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} UTC`
}

export const logger = {
  log: (...args: unknown[]) => {
    const timestamp = formatTimestamp(new Date())
    console.log(`${timestamp} ${args[0]}`, ...args.slice(1))
  },
  error: (...args: unknown[]) => {
    const timestamp = formatTimestamp(new Date())
    console.error(`${timestamp} ${args[0]}`, ...args.slice(1))
  },
  warn: (...args: unknown[]) => {
    const timestamp = formatTimestamp(new Date())
    console.warn(`${timestamp} ${args[0]}`, ...args.slice(1))
  },
  _formatTimestamp: formatTimestamp,
}
