import { Result } from 'true-myth'
import { STANDARD_RETRY_OPTIONS, SQLITE_TRANSIENT_ERROR_MESSAGES } from '../constants.js'
import { logger } from './logger.js'

export const toResult = <T>(fn: () => T): Result<T, Error> => {
  try {
    return Result.ok(fn())
  } catch (error) {
    return Result.err(error instanceof Error ? error : new Error(String(error)))
  }
}

const isTransientSqliteError = (error: Error): boolean =>
  SQLITE_TRANSIENT_ERROR_MESSAGES.some((msg) => error.message.includes(msg))

export const withRetry = <T>(
  operationName: string,
  operation: () => Result<T, Error>,
): Result<T, Error> => {
  let lastError: Error | undefined

  for (let attempt = 0; attempt <= STANDARD_RETRY_OPTIONS.retries; attempt++) {
    const result = operation()

    if (result.isOk) {
      return result
    }

    lastError = result.error

    if (!isTransientSqliteError(lastError)) {
      return result
    }

    logger.warn(`${operationName} attempt ${attempt + 1} failed`, lastError)
  }

  logger.error(`${operationName} failed after retries`, lastError)
  return Result.err(lastError ?? new Error(`${operationName} failed`))
}
