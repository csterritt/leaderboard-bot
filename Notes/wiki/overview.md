# Project Overview — Discord Music Leaderboard Bot

## Purpose

A Discord bot that:
- Receives `MESSAGE_CREATE` events via `discord.js` gateway
- Handles slash commands via Discord Interactions HTTP endpoint
- Tracks per-user music posting streaks, scoped to each monitored channel
- Posts a scheduled leaderboard in each designated leaderboard channel
- Each leaderboard channel is linked to exactly one monitored channel

## Runtime / Stack

| Concern | Choice |
|---|---|
| Runtime | Bun |
| Database | better-sqlite3 (synchronous, Node native module) |
| Discord library | discord.js (handles gateway, heartbeat, reconnect, resume) |
| Testing | vitest with in-memory better-sqlite3 databases |
| Result type | true-myth `Result<T, Error>` |
| Language | TypeScript (strict mode, bundler moduleResolution) |

## Key Design Decisions

- **Sync DB**: better-sqlite3 is synchronous; all DB functions return `Result<T, Error>` (not Promise).
- **Result pattern**: every exported DB function uses `withRetry` → `*Actual` → `toResult`.
- **Idempotency**: `processed_messages` table prevents double-processing by both gateway and recovery paths.
- **Single transaction**: `processMessage` performs claim + stats mutation atomically.
- **Recovery owns checkpoint**: `processMessage` never advances `recovery_state`; only recovery orchestration does.
- **Channel scoping**: stats are never merged across channels.

## Source Structure

```
src/
├── index.ts                  # Entry point
├── types.ts                  # Shared interfaces
├── constants.ts              # Constants
├── handlers/
│   ├── gateway.ts            # discord.js MESSAGE_CREATE dispatcher
│   ├── interactions.ts       # Slash command router
│   └── scheduled.ts          # Recovery + leaderboard posting + prune
├── db/
│   ├── schema.sql            # DDL
│   └── queries.ts            # All DB operations
├── services/
│   ├── tracker.ts            # Streak logic
│   ├── processor.ts          # Shared message-processing pipeline
│   ├── leaderboard.ts        # Leaderboard query + format
│   ├── recovery.ts           # Message backfill
│   └── discord.ts            # Discord REST API client
├── utils/
│   ├── time.ts               # Timestamp + streak delta
│   ├── signature.ts          # Interaction signature verification
│   ├── permissions.ts        # ADMINISTRATOR permission check
│   └── db-helpers.ts         # withRetry, toResult
└── scripts/
    └── register-commands.ts  # One-shot slash command registration
```

## Cross-references

- [schema.md](schema.md) — database tables
- [constants.md](constants.md) — all constants
- [types.md](types.md) — TypeScript interfaces
- [util-db-helpers.md](util-db-helpers.md) — DB access pattern
