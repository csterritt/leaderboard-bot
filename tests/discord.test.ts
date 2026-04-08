import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  sendMessage,
  deleteMessage,
  fetchMessagesAfter,
  fetchChannel,
  _resetRateLimit,
} from '../src/services/discord'
import { DISCORD_API_DELAY_MS } from '../src/constants'

const TOKEN = 'Bot test-token'
const CHANNEL_ID = 'ch-001'
const MESSAGE_ID = 'msg-001'

function makeFetchMock(responses: Array<() => Response>): ReturnType<typeof vi.fn> {
  let callIndex = 0
  return vi.fn(() => {
    const fn = responses[callIndex] ?? responses[responses.length - 1]
    callIndex++
    return Promise.resolve(fn())
  })
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

function emptyResponse(status: number, headers: Record<string, string> = {}): Response {
  return new Response(null, { status, headers })
}

beforeEach(() => {
  _resetRateLimit()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

// ─── discordFetch rate-limit behaviour ────────────────────────────────────────

describe('discordFetch (rate-limit behaviour via sendMessage)', () => {
  it('enforces minimum delay between consecutive calls', async () => {
    const mockFetch = makeFetchMock([
      () => jsonResponse(200, { id: 'msg-a' }),
      () => jsonResponse(200, { id: 'msg-b' }),
    ])
    vi.stubGlobal('fetch', mockFetch)

    const p1 = sendMessage(TOKEN, CHANNEL_ID, 'hello')
    const p2 = sendMessage(TOKEN, CHANNEL_ID, 'world')

    await vi.runAllTimersAsync()

    const r1 = await p1
    const r2 = await p2

    expect(r1.isOk).toBe(true)
    expect(r2.isOk).toBe(true)
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('retries once on 429 after the Retry-After duration', async () => {
    const mockFetch = makeFetchMock([
      () => new Response(null, { status: 429, headers: { 'Retry-After': '1' } }),
      () => jsonResponse(200, { id: 'msg-retried' }),
    ])
    vi.stubGlobal('fetch', mockFetch)

    const p = sendMessage(TOKEN, CHANNEL_ID, 'hi')
    await vi.runAllTimersAsync()
    const result = await p

    expect(result.isOk).toBe(true)
    expect(result.value).toBe('msg-retried')
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('returns Result.err on a second consecutive 429', async () => {
    const mockFetch = makeFetchMock([
      () => new Response(null, { status: 429, headers: { 'Retry-After': '1' } }),
      () => new Response(null, { status: 429, headers: { 'Retry-After': '1' } }),
    ])
    vi.stubGlobal('fetch', mockFetch)

    const p = sendMessage(TOKEN, CHANNEL_ID, 'hi')
    await vi.runAllTimersAsync()
    const result = await p

    expect(result.isOk).toBe(false)
  })
})

// ─── sendMessage ──────────────────────────────────────────────────────────────

describe('sendMessage', () => {
  it('makes POST /channels/{id}/messages with correct headers and body', async () => {
    const mockFetch = makeFetchMock([() => jsonResponse(200, { id: 'msg-001' })])
    vi.stubGlobal('fetch', mockFetch)

    const p = sendMessage(TOKEN, CHANNEL_ID, 'test content')
    await vi.runAllTimersAsync()
    await p

    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toContain(`/channels/${CHANNEL_ID}/messages`)
    expect((options.headers as Record<string, string>)['Authorization']).toBe(TOKEN)
    expect((options.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    expect(options.method).toBe('POST')
    const body = JSON.parse(options.body as string)
    expect(body.content).toBe('test content')
  })

  it('returns Result.ok(messageId) on success', async () => {
    const mockFetch = makeFetchMock([() => jsonResponse(200, { id: 'returned-id' })])
    vi.stubGlobal('fetch', mockFetch)

    const p = sendMessage(TOKEN, CHANNEL_ID, 'hi')
    await vi.runAllTimersAsync()
    const result = await p

    expect(result.isOk).toBe(true)
    expect(result.value).toBe('returned-id')
  })

  it('returns Result.err on non-2xx', async () => {
    const mockFetch = makeFetchMock([() => emptyResponse(500)])
    vi.stubGlobal('fetch', mockFetch)

    const p = sendMessage(TOKEN, CHANNEL_ID, 'hi')
    await vi.runAllTimersAsync()
    const result = await p

    expect(result.isOk).toBe(false)
  })
})

// ─── deleteMessage ────────────────────────────────────────────────────────────

describe('deleteMessage', () => {
  it('makes DELETE /channels/{id}/messages/{messageId}', async () => {
    const mockFetch = makeFetchMock([() => emptyResponse(204)])
    vi.stubGlobal('fetch', mockFetch)

    const p = deleteMessage(TOKEN, CHANNEL_ID, MESSAGE_ID)
    await vi.runAllTimersAsync()
    await p

    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toContain(`/channels/${CHANNEL_ID}/messages/${MESSAGE_ID}`)
    expect(options.method).toBe('DELETE')
  })

  it('returns Result.ok(true) on 204', async () => {
    const mockFetch = makeFetchMock([() => emptyResponse(204)])
    vi.stubGlobal('fetch', mockFetch)

    const p = deleteMessage(TOKEN, CHANNEL_ID, MESSAGE_ID)
    await vi.runAllTimersAsync()
    const result = await p

    expect(result.isOk).toBe(true)
    expect(result.value).toBe(true)
  })

  it('returns Result.ok(true) on 404', async () => {
    const mockFetch = makeFetchMock([() => emptyResponse(404)])
    vi.stubGlobal('fetch', mockFetch)

    const p = deleteMessage(TOKEN, CHANNEL_ID, MESSAGE_ID)
    await vi.runAllTimersAsync()
    const result = await p

    expect(result.isOk).toBe(true)
    expect(result.value).toBe(true)
  })

  it('returns Result.err on other non-2xx responses', async () => {
    const mockFetch = makeFetchMock([() => emptyResponse(403)])
    vi.stubGlobal('fetch', mockFetch)

    const p = deleteMessage(TOKEN, CHANNEL_ID, MESSAGE_ID)
    await vi.runAllTimersAsync()
    const result = await p

    expect(result.isOk).toBe(false)
  })
})

// ─── fetchMessagesAfter ───────────────────────────────────────────────────────

describe('fetchMessagesAfter', () => {
  it('makes GET /channels/{id}/messages?after={afterId}&limit=100', async () => {
    const mockFetch = makeFetchMock([() => jsonResponse(200, [])])
    vi.stubGlobal('fetch', mockFetch)

    const AFTER_ID = 'after-msg-001'
    const p = fetchMessagesAfter(TOKEN, CHANNEL_ID, AFTER_ID)
    await vi.runAllTimersAsync()
    await p

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toContain(`/channels/${CHANNEL_ID}/messages`)
    expect(url).toContain(`after=${AFTER_ID}`)
    expect(url).toContain('limit=100')
  })

  it('returns Result.ok(DiscordMessage[]) on success', async () => {
    const messages = [
      {
        id: 'm1',
        channel_id: CHANNEL_ID,
        author: { id: 'u1', username: 'alice', global_name: null },
        timestamp: '2024-01-01T00:00:00.000Z',
        attachments: [],
        type: 0,
      },
    ]
    const mockFetch = makeFetchMock([() => jsonResponse(200, messages)])
    vi.stubGlobal('fetch', mockFetch)

    const p = fetchMessagesAfter(TOKEN, CHANNEL_ID, '0')
    await vi.runAllTimersAsync()
    const result = await p

    expect(result.isOk).toBe(true)
    expect(result.value).toHaveLength(1)
    expect(result.value?.[0].id).toBe('m1')
  })

  it('returns Result.err on non-2xx', async () => {
    const mockFetch = makeFetchMock([() => emptyResponse(403)])
    vi.stubGlobal('fetch', mockFetch)

    const p = fetchMessagesAfter(TOKEN, CHANNEL_ID, '0')
    await vi.runAllTimersAsync()
    const result = await p

    expect(result.isOk).toBe(false)
  })
})

// ─── fetchChannel ─────────────────────────────────────────────────────────────

describe('fetchChannel', () => {
  it('makes GET /channels/{id}', async () => {
    const mockFetch = makeFetchMock([() => jsonResponse(200, { id: CHANNEL_ID, name: 'music' })])
    vi.stubGlobal('fetch', mockFetch)

    const p = fetchChannel(TOKEN, CHANNEL_ID)
    await vi.runAllTimersAsync()
    await p

    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toContain(`/channels/${CHANNEL_ID}`)
    expect(options.method).toBe('GET')
  })

  it('returns Result.ok({ id, name }) on success', async () => {
    const mockFetch = makeFetchMock([
      () => jsonResponse(200, { id: CHANNEL_ID, name: 'my-music' }),
    ])
    vi.stubGlobal('fetch', mockFetch)

    const p = fetchChannel(TOKEN, CHANNEL_ID)
    await vi.runAllTimersAsync()
    const result = await p

    expect(result.isOk).toBe(true)
    expect(result.value?.id).toBe(CHANNEL_ID)
    expect(result.value?.name).toBe('my-music')
  })

  it('returns Result.err on non-2xx', async () => {
    const mockFetch = makeFetchMock([() => emptyResponse(404)])
    vi.stubGlobal('fetch', mockFetch)

    const p = fetchChannel(TOKEN, CHANNEL_ID)
    await vi.runAllTimersAsync()
    const result = await p

    expect(result.isOk).toBe(false)
  })
})
