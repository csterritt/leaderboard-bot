/**
 * E2E: Slash command interactions
 *
 * Tests the full slash command handling pipeline from HTTP request → signature
 * verification bypass → command handler → DB mutation → response, all exercised
 * together end-to-end with an in-memory DB.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  upsertLeaderboardChannel,
  addMonitoredChannel,
  getLeaderboardChannel,
  getMonitoredChannels,
  upsertUserStats,
} from '../../src/db/queries'
import { handleInteractionWithVerifier } from '../../src/handlers/interactions'
import { _resetRateLimit } from '../../src/services/discord'
import type { Database as DatabaseType, DiscordInteraction } from '../../src/types'

const schema = readFileSync(join(import.meta.dirname, '../../src/db/schema.sql'), 'utf8')

function makeDb(): DatabaseType {
  const db = new Database(':memory:')
  db.exec(schema)
  db.pragma('foreign_keys = ON')
  return db
}

const GUILD_ID = 'guild-e2e'
const TOKEN = 'Bot e2e-test-token'
const ADMIN_PERMS = '8'
const LC_ID = 'lc-e2e'
const MC_ID = 'mc-e2e'

const alwaysValidVerifier = async () => true

function makeRequest(interaction: DiscordInteraction): Request {
  return new Request('https://bot.example.com/interactions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-signature-ed25519': 'sig',
      'x-signature-timestamp': 'ts',
    },
    body: JSON.stringify(interaction),
  })
}

function adminInteraction(
  channelId: string,
  commandName: string,
  options?: DiscordInteraction['data']['options'],
): DiscordInteraction {
  return {
    id: 'interaction-001',
    type: 2,
    guild_id: GUILD_ID,
    channel_id: channelId,
    channel: { id: channelId, name: `#${channelId}` },
    member: { nick: null, permissions: ADMIN_PERMS },
    data: { name: commandName, options },
  }
}

function seedLeaderboardAndMonitor(db: DatabaseType) {
  upsertLeaderboardChannel(db, {
    channelId: LC_ID,
    guildId: GUILD_ID,
    channelName: '#leaderboard',
    addedByUserId: 'admin',
  })
  addMonitoredChannel(db, {
    channelId: MC_ID,
    guildId: GUILD_ID,
    leaderboardChannelId: LC_ID,
  })
}

async function extractResponseBody(resp: Response): Promise<Record<string, unknown>> {
  return resp.json() as Promise<Record<string, unknown>>
}

describe('slash commands (e2e)', () => {
  let db: DatabaseType

  beforeEach(() => {
    db = makeDb()
    _resetRateLimit()
    vi.resetAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ─── Ping ──────────────────────────────────────────────────────────────────

  describe('ping', () => {
    it('responds to a type=1 ping with {type: 1}', async () => {
      const interaction: DiscordInteraction = {
        id: 'ping-001',
        type: 1,
        channel_id: 'ch',
      }
      const req = makeRequest(interaction)
      const resp = await handleInteractionWithVerifier(req, db, TOKEN, alwaysValidVerifier)
      expect(resp.status).toBe(200)
      const body = await extractResponseBody(resp)
      expect(body.type).toBe(1)
    })
  })

  // ─── /setleaderboardchannel ────────────────────────────────────────────────

  describe('/setleaderboardchannel', () => {
    it('sets the current channel as a leaderboard channel', async () => {
      const interaction = adminInteraction('ch-lb-new', 'setleaderboardchannel')
      const req = makeRequest(interaction)
      const resp = await handleInteractionWithVerifier(req, db, TOKEN, alwaysValidVerifier)
      expect(resp.status).toBe(200)

      const lc = getLeaderboardChannel(db, 'ch-lb-new')
      expect(lc.value?.channelId).toBe('ch-lb-new')
      expect(lc.value?.guildId).toBe(GUILD_ID)
    })

    it('rejects a user without ADMINISTRATOR permission', async () => {
      const interaction: DiscordInteraction = {
        id: 'i1',
        type: 2,
        guild_id: GUILD_ID,
        channel_id: 'ch-lb',
        member: { nick: null, permissions: '0' },
        data: { name: 'setleaderboardchannel' },
      }
      const req = makeRequest(interaction)
      const resp = await handleInteractionWithVerifier(req, db, TOKEN, alwaysValidVerifier)
      expect(resp.status).toBe(200)
      const body = (await extractResponseBody(resp)) as { data?: { content?: string } }
      expect(body.data?.content).toContain('Administrator')

      const lc = getLeaderboardChannel(db, 'ch-lb')
      expect(lc.value).toBeNull()
    })

    it('rejects usage outside a guild', async () => {
      const interaction: DiscordInteraction = {
        id: 'i2',
        type: 2,
        channel_id: 'ch-dm',
        data: { name: 'setleaderboardchannel' },
      }
      const req = makeRequest(interaction)
      const resp = await handleInteractionWithVerifier(req, db, TOKEN, alwaysValidVerifier)
      expect(resp.status).toBe(200)
      const body = (await extractResponseBody(resp)) as { data?: { content?: string } }
      expect(body.data?.content).toContain('guild')
    })

    it('is idempotent: running twice updates the stored channel_name', async () => {
      const interaction1: DiscordInteraction = {
        id: 'i3a',
        type: 2,
        guild_id: GUILD_ID,
        channel_id: 'ch-lb-x',
        channel: { id: 'ch-lb-x', name: 'original-name' },
        member: { nick: null, permissions: ADMIN_PERMS },
        data: { name: 'setleaderboardchannel' },
      }
      const interaction2: DiscordInteraction = {
        ...interaction1,
        id: 'i3b',
        channel: { id: 'ch-lb-x', name: 'updated-name' },
      }

      await handleInteractionWithVerifier(makeRequest(interaction1), db, TOKEN, alwaysValidVerifier)
      await handleInteractionWithVerifier(makeRequest(interaction2), db, TOKEN, alwaysValidVerifier)

      const lc = getLeaderboardChannel(db, 'ch-lb-x')
      expect(lc.value?.channelName).toBe('updated-name')
    })
  })

  // ─── /removeleaderboardchannel ─────────────────────────────────────────────

  describe('/removeleaderboardchannel', () => {
    it('removes the leaderboard channel and its monitored channel link', async () => {
      seedLeaderboardAndMonitor(db)

      const interaction = adminInteraction(LC_ID, 'removeleaderboardchannel')
      const resp = await handleInteractionWithVerifier(
        makeRequest(interaction),
        db,
        TOKEN,
        alwaysValidVerifier,
      )
      expect(resp.status).toBe(200)

      const lc = getLeaderboardChannel(db, LC_ID)
      expect(lc.value).toBeNull()

      const monitored = getMonitoredChannels(db)
      expect(monitored.value).toEqual([])
    })

    it('succeeds even if the channel was not a leaderboard channel', async () => {
      const interaction = adminInteraction('ch-not-lb', 'removeleaderboardchannel')
      const resp = await handleInteractionWithVerifier(
        makeRequest(interaction),
        db,
        TOKEN,
        alwaysValidVerifier,
      )
      expect(resp.status).toBe(200)
    })
  })

  // ─── /addmonitoredchannel ──────────────────────────────────────────────────

  describe('/addmonitoredchannel', () => {
    it('adds a monitored channel linked to the current leaderboard channel', async () => {
      upsertLeaderboardChannel(db, {
        channelId: LC_ID,
        guildId: GUILD_ID,
        channelName: '#leaderboard',
        addedByUserId: 'admin',
      })

      const interaction: DiscordInteraction = {
        id: 'i-add',
        type: 2,
        guild_id: GUILD_ID,
        channel_id: LC_ID,
        member: { nick: null, permissions: ADMIN_PERMS },
        data: {
          name: 'addmonitoredchannel',
          options: [{ name: 'channel', value: MC_ID }],
        },
      }
      const resp = await handleInteractionWithVerifier(
        makeRequest(interaction),
        db,
        TOKEN,
        alwaysValidVerifier,
      )
      expect(resp.status).toBe(200)

      const channels = getMonitoredChannels(db)
      expect(channels.value?.map((c) => c.channelId)).toContain(MC_ID)
    })

    it('rejects if the current channel is not a leaderboard channel', async () => {
      const interaction: DiscordInteraction = {
        id: 'i-add-fail',
        type: 2,
        guild_id: GUILD_ID,
        channel_id: 'ch-not-lb',
        member: { nick: null, permissions: ADMIN_PERMS },
        data: {
          name: 'addmonitoredchannel',
          options: [{ name: 'channel', value: 'mc-x' }],
        },
      }
      const resp = await handleInteractionWithVerifier(
        makeRequest(interaction),
        db,
        TOKEN,
        alwaysValidVerifier,
      )
      expect(resp.status).toBe(200)
      const body = (await extractResponseBody(resp)) as { data?: { content?: string } }
      expect(body.data?.content).toContain('setleaderboardchannel')

      const channels = getMonitoredChannels(db)
      expect(channels.value).toEqual([])
    })

    it('is idempotent: adding the same channel twice does not error', async () => {
      upsertLeaderboardChannel(db, {
        channelId: LC_ID,
        guildId: GUILD_ID,
        channelName: '#leaderboard',
        addedByUserId: 'admin',
      })

      const interaction: DiscordInteraction = {
        id: 'i-dup',
        type: 2,
        guild_id: GUILD_ID,
        channel_id: LC_ID,
        member: { nick: null, permissions: ADMIN_PERMS },
        data: {
          name: 'addmonitoredchannel',
          options: [{ name: 'channel', value: MC_ID }],
        },
      }

      await handleInteractionWithVerifier(makeRequest(interaction), db, TOKEN, alwaysValidVerifier)
      const resp = await handleInteractionWithVerifier(
        makeRequest({ ...interaction, id: 'i-dup-2' }),
        db,
        TOKEN,
        alwaysValidVerifier,
      )
      expect(resp.status).toBe(200)

      const channels = getMonitoredChannels(db)
      expect(channels.value?.filter((c) => c.channelId === MC_ID)).toHaveLength(1)
    })
  })

  // ─── /removemonitoredchannel ───────────────────────────────────────────────

  describe('/removemonitoredchannel', () => {
    it('removes the monitored channel', async () => {
      seedLeaderboardAndMonitor(db)

      const interaction: DiscordInteraction = {
        id: 'i-rm-mc',
        type: 2,
        guild_id: GUILD_ID,
        channel_id: LC_ID,
        member: { nick: null, permissions: ADMIN_PERMS },
        data: {
          name: 'removemonitoredchannel',
          options: [{ name: 'channel', value: MC_ID }],
        },
      }
      const resp = await handleInteractionWithVerifier(
        makeRequest(interaction),
        db,
        TOKEN,
        alwaysValidVerifier,
      )
      expect(resp.status).toBe(200)

      const channels = getMonitoredChannels(db)
      expect(channels.value?.map((c) => c.channelId)).not.toContain(MC_ID)

      const lc = getLeaderboardChannel(db, LC_ID)
      expect(lc.value?.channelId).toBe(LC_ID)
    })
  })

  // ─── /leaderboard ──────────────────────────────────────────────────────────

  describe('/leaderboard', () => {
    it('shows the leaderboard for the current leaderboard channel', async () => {
      seedLeaderboardAndMonitor(db)
      upsertUserStats(db, {
        channelId: MC_ID,
        userId: 'user-a',
        username: 'Alice',
        lastMusicPostAt: 1_700_000_000,
        runCount: 5,
        highestRunSeen: 7,
      })

      const interaction: DiscordInteraction = {
        id: 'i-lb',
        type: 2,
        guild_id: GUILD_ID,
        channel_id: LC_ID,
        channel: { id: LC_ID, name: 'leaderboard' },
        member: { nick: null, permissions: ADMIN_PERMS },
        data: { name: 'leaderboard' },
      }
      const resp = await handleInteractionWithVerifier(
        makeRequest(interaction),
        db,
        TOKEN,
        alwaysValidVerifier,
      )
      expect(resp.status).toBe(200)
      const body = (await extractResponseBody(resp)) as {
        data?: { content?: string; flags?: number }
      }
      expect(body.data?.flags).toBe(64)
      expect(body.data?.content).toContain('Alice')
    })

    it('returns a not-leaderboard-channel message when the channel is not configured', async () => {
      const interaction: DiscordInteraction = {
        id: 'i-lb-fail',
        type: 2,
        guild_id: GUILD_ID,
        channel_id: 'ch-unknown',
        channel: { id: 'ch-unknown', name: 'unknown' },
        member: { nick: null, permissions: ADMIN_PERMS },
        data: { name: 'leaderboard' },
      }
      const resp = await handleInteractionWithVerifier(
        makeRequest(interaction),
        db,
        TOKEN,
        alwaysValidVerifier,
      )
      expect(resp.status).toBe(200)
      const body = (await extractResponseBody(resp)) as { data?: { content?: string } }
      expect(body.data?.content).toContain('not a leaderboard channel')
    })

    it('returns a no-monitored-channel message when the leaderboard has no linked monitor', async () => {
      upsertLeaderboardChannel(db, {
        channelId: LC_ID,
        guildId: GUILD_ID,
        channelName: '#lb',
        addedByUserId: 'admin',
      })

      const interaction: DiscordInteraction = {
        id: 'i-lb-no-mc',
        type: 2,
        guild_id: GUILD_ID,
        channel_id: LC_ID,
        channel: { id: LC_ID, name: 'lb' },
        member: { nick: null, permissions: ADMIN_PERMS },
        data: { name: 'leaderboard' },
      }
      const resp = await handleInteractionWithVerifier(
        makeRequest(interaction),
        db,
        TOKEN,
        alwaysValidVerifier,
      )
      const body = (await extractResponseBody(resp)) as { data?: { content?: string } }
      expect(body.data?.content).toContain('No monitored channel')
    })

    it('returns ephemeral response (flags=64) for all leaderboard responses', async () => {
      seedLeaderboardAndMonitor(db)

      const interaction: DiscordInteraction = {
        id: 'i-lb-ephemeral',
        type: 2,
        guild_id: GUILD_ID,
        channel_id: LC_ID,
        channel: { id: LC_ID, name: 'lb' },
        member: { nick: null, permissions: ADMIN_PERMS },
        data: { name: 'leaderboard' },
      }
      const resp = await handleInteractionWithVerifier(
        makeRequest(interaction),
        db,
        TOKEN,
        alwaysValidVerifier,
      )
      const body = (await extractResponseBody(resp)) as { data?: { flags?: number } }
      expect(body.data?.flags).toBe(64)
    })
  })

  // ─── Signature verification ────────────────────────────────────────────────

  describe('signature verification', () => {
    it('returns 401 when signature headers are missing', async () => {
      const req = new Request('https://bot.example.com/interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 1 }),
      })
      const resp = await handleInteractionWithVerifier(req, db, TOKEN, alwaysValidVerifier)
      expect(resp.status).toBe(401)
    })

    it('returns 401 when the signature is invalid', async () => {
      const invalidVerifier = async () => false
      const req = makeRequest({ id: 'i-sig', type: 1, channel_id: 'ch' })
      const resp = await handleInteractionWithVerifier(req, db, TOKEN, invalidVerifier)
      expect(resp.status).toBe(401)
    })

    it('returns 400 for an unknown command type', async () => {
      const interaction: DiscordInteraction = {
        id: 'i-unknown',
        type: 2,
        guild_id: GUILD_ID,
        channel_id: 'ch',
        member: { nick: null, permissions: ADMIN_PERMS },
        data: { name: 'unknowncommand' },
      }
      const req = makeRequest(interaction)
      const resp = await handleInteractionWithVerifier(req, db, TOKEN, alwaysValidVerifier)
      expect(resp.status).toBe(400)
    })
  })

  // ─── Full workflow: setup → post music → view leaderboard ──────────────────

  describe('full admin setup workflow (e2e)', () => {
    it('admin sets up leaderboard channel, adds monitored channel, then leaderboard shows data', async () => {
      const NEW_LC = 'ch-lb-workflow'
      const NEW_MC = 'ch-mc-workflow'

      await handleInteractionWithVerifier(
        makeRequest(adminInteraction(NEW_LC, 'setleaderboardchannel')),
        db,
        TOKEN,
        alwaysValidVerifier,
      )

      await handleInteractionWithVerifier(
        makeRequest({
          id: 'i-add-mc',
          type: 2,
          guild_id: GUILD_ID,
          channel_id: NEW_LC,
          member: { nick: null, permissions: ADMIN_PERMS },
          data: { name: 'addmonitoredchannel', options: [{ name: 'channel', value: NEW_MC }] },
        }),
        db,
        TOKEN,
        alwaysValidVerifier,
      )

      upsertUserStats(db, {
        channelId: NEW_MC,
        userId: 'user-workflow',
        username: 'WorkflowUser',
        lastMusicPostAt: 1_700_000_000,
        runCount: 3,
        highestRunSeen: 5,
      })

      const lbInteraction: DiscordInteraction = {
        id: 'i-lb-workflow',
        type: 2,
        guild_id: GUILD_ID,
        channel_id: NEW_LC,
        channel: { id: NEW_LC, name: 'ch-lb-workflow' },
        member: { nick: null, permissions: ADMIN_PERMS },
        data: { name: 'leaderboard' },
      }
      const resp = await handleInteractionWithVerifier(
        makeRequest(lbInteraction),
        db,
        TOKEN,
        alwaysValidVerifier,
      )
      expect(resp.status).toBe(200)
      const body = (await extractResponseBody(resp)) as { data?: { content?: string } }
      expect(body.data?.content).toContain('WorkflowUser')
    })
  })
})
