# src/index.ts — Entry Point

**Source:** `src/index.ts`

## Purpose

The main entry point that wires all subsystems together and starts the bot.

## Startup Sequence

1. **Environment** — reads `DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY`, `DATABASE_PATH` (default: `leaderboard.db`), `PORT` (default: `3000`) from `process.env`.
2. **Database** — opens better-sqlite3 at `DATABASE_PATH`, enables `PRAGMA foreign_keys = ON`, applies `src/db/schema.sql` (idempotent `CREATE TABLE IF NOT EXISTS`).
3. **Discord Client** — creates `discord.js` `Client` with intents: `Guilds`, `GuildMessages`, `MessageContent`.
4. **Gateway handler** — `setupGatewayHandler(client, db)` registers `messageCreate` listener.
5. **HTTP server** — `Bun.serve` on `PORT`; routes `POST /interactions` to `handleInteraction`; returns `404` for all other paths.
6. **Startup recovery** — calls `recoverAllChannels(db, token)` immediately (fire-and-forget with error logging). Runs before any interval tick.
7. **Hourly interval** — `setInterval` at 3 600 000 ms calls `runScheduledWork(db, token)` with error logging.
8. **Login** — `client.login(DISCORD_BOT_TOKEN)` starts the gateway connection.

## Key Design Rules

- Recovery runs **at startup**, not deferred to the first interval tick.
- HTTP server handles only `POST /interactions`; all other requests return 404.
- All errors from async operations are logged but do not crash the process.
- `Bun.serve` is used for the HTTP layer (Bun runtime assumed).

## Cross-references

- [`handler-gateway.md`](handler-gateway.md) — `setupGatewayHandler`
- [`handler-interactions.md`](handler-interactions.md) — `handleInteraction`
- [`handler-scheduled.md`](handler-scheduled.md) — `runScheduledWork`
- [`service-recovery.md`](service-recovery.md) — `recoverAllChannels`
- [`schema.md`](schema.md) — applied on startup
- [`types.md`](types.md) — `Env` interface documents all env vars
