import { Result } from 'true-myth'
import { DISCORD_API_DELAY_MS } from '../constants'
import type { DiscordMessage } from '../types'

const DISCORD_API_BASE = 'https://discord.com/api/v10'

// ─── Rate-limit state ─────────────────────────────────────────────────────────

let lastRequestAt = 0
let pendingChain: Promise<void> = Promise.resolve()

export const _resetRateLimit = (): void => {
  lastRequestAt = 0
  pendingChain = Promise.resolve()
}

const enforceDelay = (): Promise<void> => {
  const result = pendingChain.then(() => {
    const now = Date.now()
    const elapsed = now - lastRequestAt
    const waitMs = elapsed < DISCORD_API_DELAY_MS ? DISCORD_API_DELAY_MS - elapsed : 0
    return waitMs > 0
      ? new Promise<void>((resolve) => setTimeout(resolve, waitMs))
      : Promise.resolve()
  }).then(() => {
    lastRequestAt = Date.now()
  })
  pendingChain = result
  return result
}

// ─── 6.1 discordFetch ────────────────────────────────────────────────────────

const discordFetch = async (
  token: string,
  url: string,
  options: RequestInit,
): Promise<Result<Response, Error>> => {
  await enforceDelay()

  const headers = {
    Authorization: token,
    ...(options.headers as Record<string, string> | undefined),
  }

  let response = await fetch(url, { ...options, headers })

  if (response.status === 429) {
    const retryAfter = parseFloat(response.headers.get('Retry-After') ?? '1')
    await new Promise<void>((resolve) => setTimeout(resolve, retryAfter * 1000))
    response = await fetch(url, { ...options, headers })

    if (response.status === 429) {
      return Result.err(new Error(`Rate limited twice on ${url}`))
    }
  }

  return Result.ok(response)
}

// ─── 6.2 sendMessage ─────────────────────────────────────────────────────────

export const sendMessage = async (
  token: string,
  channelId: string,
  content: string,
): Promise<Result<string, Error>> => {
  const url = `${DISCORD_API_BASE}/channels/${channelId}/messages`
  const options: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  }

  const fetchResult = await discordFetch(token, url, options)
  if (!fetchResult.isOk) return Result.err(fetchResult.error)

  const response = fetchResult.value
  if (!response.ok) {
    return Result.err(new Error(`sendMessage failed: ${response.status}`))
  }

  const data = await response.json() as { id: string }
  return Result.ok(data.id)
}

// ─── 6.3 deleteMessage ───────────────────────────────────────────────────────

export const deleteMessage = async (
  token: string,
  channelId: string,
  messageId: string,
): Promise<Result<boolean, Error>> => {
  const url = `${DISCORD_API_BASE}/channels/${channelId}/messages/${messageId}`
  const options: RequestInit = { method: 'DELETE' }

  const fetchResult = await discordFetch(token, url, options)
  if (!fetchResult.isOk) return Result.err(fetchResult.error)

  const response = fetchResult.value

  if (response.status === 204 || response.status === 404) {
    return Result.ok(true)
  }

  if (!response.ok) {
    return Result.err(new Error(`deleteMessage failed: ${response.status}`))
  }

  return Result.ok(true)
}

// ─── 6.4 fetchMessagesAfter ──────────────────────────────────────────────────

export const fetchMessagesAfter = async (
  token: string,
  channelId: string,
  afterId: string,
): Promise<Result<DiscordMessage[], Error>> => {
  const url = `${DISCORD_API_BASE}/channels/${channelId}/messages?after=${afterId}&limit=100`
  const options: RequestInit = { method: 'GET' }

  const fetchResult = await discordFetch(token, url, options)
  if (!fetchResult.isOk) return Result.err(fetchResult.error)

  const response = fetchResult.value
  if (!response.ok) {
    return Result.err(new Error(`fetchMessagesAfter failed: ${response.status}`))
  }

  const data = await response.json() as DiscordMessage[]
  return Result.ok(data)
}

// ─── 6.5 fetchChannel ────────────────────────────────────────────────────────

export const fetchChannel = async (
  token: string,
  channelId: string,
): Promise<Result<{ id: string; name: string }, Error>> => {
  const url = `${DISCORD_API_BASE}/channels/${channelId}`
  const options: RequestInit = { method: 'GET' }

  const fetchResult = await discordFetch(token, url, options)
  if (!fetchResult.isOk) return Result.err(fetchResult.error)

  const response = fetchResult.value
  if (!response.ok) {
    return Result.err(new Error(`fetchChannel failed: ${response.status}`))
  }

  const data = await response.json() as { id: string; name: string }
  return Result.ok({ id: data.id, name: data.name })
}
