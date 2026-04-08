# services/leaderboard.ts

Leaderboard formatting and content hashing. Pure functions — no DB access.

## formatLeaderboard

```typescript
formatLeaderboard(channelName: string, rows: LeaderboardRow[]): string
```

Formats a leaderboard for Discord. Produces output ≤ 2000 characters (Discord message limit) for up to 50 rows (`LEADERBOARD_MAX_ROWS`).

**Header:** `**🎵 Music Leaderboard — #<channelName>**`

**Empty:** Returns header + `_No data yet. Start posting music!_`

**Rows:** Ranked `#1`, `#2`, … with format:
```
#N **<username>** — streak: <runCount> (best: <highestRunSeen>)
```

**Username safety:** Usernames are passed through `escapeUsername` before rendering:
- Replaces `|` and backtick characters with spaces (prevents table/code injection).
- Truncates to 32 characters (with `…` suffix) to bound output length.

## hashContent

```typescript
hashContent(content: string): string
```

FNV-1a (32-bit) hash of an arbitrary string. Returns a lowercase hex string. Used for leaderboard change detection — if the new formatted content hashes the same as the stored `content_hash`, the leaderboard post is skipped (no delete + re-post needed).

**Algorithm:** FNV-1a 32-bit — offset basis `2166136261`, prime `16777619`, unsigned 32-bit accumulation.

## Related pages

- [types.md](types.md) — `LeaderboardRow`
- [constants.md](constants.md) — `LEADERBOARD_MAX_ROWS`
- [tests-leaderboard.md](tests-leaderboard.md) — test coverage
- [service-discord.md](service-discord.md) — uses `hashContent` + `formatLeaderboard` output for post management
