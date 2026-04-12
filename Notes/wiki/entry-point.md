# src/index.ts — Entry Point

**Source:** `src/index.ts`

## Purpose

The main entry point that wires all subsystems together and starts the bot.

## Startup Sequence

1. **Environment** — reads `DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY`, `DATABASE_PATH` (default: `leaderboard.db`), `PORT` (default: `3000`) from `process.env`. Logs `[startup] reading environment configuration` and `[startup] DATABASE_PATH=... PORT=...`.
2. **Database** — opens bun:sqlite at `DATABASE_PATH`, enables `PRAGMA foreign_keys = ON` via `db.exec()`, applies `src/db/schema.sql` (idempotent `CREATE TABLE IF NOT EXISTS`). Logs `[startup] opening database` and `[startup] database schema applied`.
3. **Discord Client** — creates `discord.js` `Client` with intents: `Guilds`, `GuildMessages`, `MessageContent`. Logs `[startup] creating Discord client`.
4. **Gateway handler** — `setupGatewayHandler(client, db)` registers `messageCreate` listener. Logs `[startup] setting up gateway handler`.
5. **HTTP server** — `Bun.serve` on `PORT`; routes `POST /interactions` to `handleInteraction`; returns `404` for all other paths. Logs `[startup] starting HTTP server on port ...` and `[startup] HTTP server listening on port ...`.
6. **Startup recovery** — calls `recoverAllChannels(db, token)` immediately (fire-and-forget with error logging). Runs before any interval tick. Logs `[startup] starting recovery pass`, `[startup] recovery pass complete` or `[startup] recovery failed`.
7. **Hourly interval** — `setInterval` at 3 600 000 ms calls `runScheduledWork(db, token)` with error logging. Logs `[startup] registering hourly scheduled work interval`, `[scheduled] hourly interval triggered`, `[scheduled] hourly work failed`.
8. **Login** — `client.login(DISCORD_BOT_TOKEN)` starts the gateway connection. Logs `[startup] logging in to Discord`.
9. **Graceful shutdown** — `createShutdown` from `utils/shutdown.ts` registers `SIGTERM` and `SIGINT` handlers that idempotently stop the HTTP server, clear the hourly interval, destroy the discord.js client, and close the database. Logs `[startup] received SIGTERM/SIGINT`, `[shutdown] shutting down gracefully...`, per-resource messages, `[shutdown] complete`. Final log: `[startup] bot is ready`.

## Key Design Rules

- Recovery runs **at startup**, not deferred to the first interval tick.
- HTTP server handles only `POST /interactions`; all other requests return 404.
- All errors from async operations are logged but do not crash the process.
- `Bun.serve` is used for the HTTP layer (Bun runtime assumed).
- Graceful shutdown is idempotent — repeated signals do not re-run cleanup.

## Cross-references

- [`handler-gateway.md`](handler-gateway.md) — `setupGatewayHandler`
- [`handler-interactions.md`](handler-interactions.md) — `handleInteraction`
- [`handler-scheduled.md`](handler-scheduled.md) — `runScheduledWork`
- [`service-recovery.md`](service-recovery.md) — `recoverAllChannels`
- [`schema.md`](schema.md) — applied on startup
- [`types.md`](types.md) — `Env` interface documents all env vars
- [`util-shutdown.md`](util-shutdown.md) — `createShutdown` graceful shutdown facility
