# Plan Review — Discord Music Leaderboard Bot

## Overall Assessment

The plan is well-structured, thorough, and closely aligned with the architecture document. The phased approach with Red/Green TDD, bottom-up layering (utilities → DB → services → handlers → entry point), and the explicit types reference make this a strong implementation guide. The items below are corrections, gaps, and suggestions — not a rewrite.

---

## Correctness Issues

### 1. Streak reset sets `runCount` to 0, but the architecture says the first post after a reset should count

The architecture's tracking logic (section 4) shows that when `Delta > 36 hours`, `runCount = 0`. But then `lastMusicPostAt` is updated to the current timestamp. This means the user posted music, yet their run is 0 — they don't get credit for the post that just happened. A reset should almost certainly set `runCount` back to **1**, not 0, since the new post itself begins a fresh streak. The plan's test in **3.1** says "test `delta > 36h` resets `runCount` to `0`", which faithfully mirrors the architecture, but both documents likely have this wrong. Verify the intended behavior: if a user posts after a 2-day gap, should they show a run of 0 or 1?

### 2. `computeStreakDelta` receives `deltaSecs` but the first-post case has no delta

`computeStreakDelta(deltaSecs: number)` returns `'first'`, but the caller must handle `lastMusicPostAt === null` *before* computing a delta. A `number` input can't represent "no prior post". Either:
- Change the signature to `computeStreakDelta(deltaSecs: number | null)` where `null` → `'first'`.
- Or make the caller responsible for the `null` check and never pass `null` to this function.

The plan doesn't clarify which approach to use, and the tests in **1.1** test `'first'` as a return value of `computeStreakDelta` without specifying what input produces it. This should be pinned down before implementation.

### 3. Recovery start state when `last_processed_message_id` is null

Test **7.1** says "test begins from the start state when `last_processed_message_id` is `null`", but the Discord `GET /channels/{id}/messages?after={id}` endpoint requires an `after` parameter. If there's no checkpoint, what value is used? Snowflake `0`? Omit `after` entirely and use a different query parameter? The plan should specify the bootstrap behavior explicitly. Using `after=0` would fetch from the beginning of the channel, which is likely correct but should be stated.

### 4. `DiscordMember.permissions` is only present on interaction payloads

The `DiscordMember` interface has a `permissions` field, but in `MESSAGE_CREATE` gateway events, the `member` partial object does **not** include `permissions` — Discord only sends `permissions` in interaction payloads. This is fine for slash command permission checks, but the type is shared across both contexts. The `permissions` field should be optional (`permissions?: string`) to accurately model both uses, or separate interfaces should be used.

---

## Design & Best Practices

### 5. Coupling of leaderboard channel and monitored channel

`/setleaderboardchannel` adds the channel to both `leaderboard_channels` and `monitored_channels`. `/removeleaderboardchannel` removes from both. This means there's no way to monitor a channel for streaks *without* it being a leaderboard posting target, and vice versa. The architecture document says the same thing, so the plan is consistent, but consider whether this 1:1 coupling is truly desired. If a server wants one "music-uploads" channel monitored but the leaderboard posted in a "bot-spam" channel, this design doesn't support it. If the coupling is intentional, the plan should acknowledge the trade-off.

### 6. No `/addmonitoredchannel` command

Related to the above: the architecture and plan provide no way to add a monitored channel independently of a leaderboard channel. If the 1:1 coupling from point 5 is intentional, `monitored_channels` as a separate table is unnecessary overhead — you could just query `leaderboard_channels`. If independent monitoring is desired, a separate command is needed.

### 7. Content hashing should be specified

The scheduled handler hashes leaderboard content to skip redundant posts, but neither the architecture nor the plan specifies the hashing algorithm. Pin this down (e.g., SHA-256 hex digest of the formatted string) to avoid ambiguity during implementation.

### 8. Rate limiting on the Discord REST API

The Discord API client in Phase 6 uses raw `fetch` with no rate-limit handling. The recovery service can fire many `GET /messages` requests in a loop, and the scheduled handler hits `DELETE` + `POST` per channel. The plan should include at least basic rate-limit awareness:
- Respect `429` responses and `Retry-After` headers.
- Consider a simple sequential queue or delay between requests.

Without this, the bot will break under real-world conditions, especially during recovery of channels with deep message history.

### 9. `processed_messages` table will grow unboundedly

Every music message that passes through the system inserts a row into `processed_messages`. There's no pruning strategy. Over months or years this table will grow indefinitely. The plan should include a maintenance step — either in the scheduled handler or as a separate periodic task — to delete rows older than some threshold (e.g., 7 days). Once a message is older than the recovery window, idempotency protection is no longer needed.

### 10. No error handling strategy for `processMessage` failures

Phase 4 tests that `recovery_state` isn't advanced past a failure, which is good. But the plan doesn't specify what happens to the *gateway* path when `processMessage` fails. Should it log and swallow? Retry? The gateway path is fire-and-forget by nature, so the answer is probably "log and move on, recovery will retry later", but this should be explicit.

### 11. Recovery could re-process the checkpoint message itself

The `GET /messages?after={id}` endpoint returns messages **after** the given ID (exclusive), so this is actually fine. But the plan's test language in **7.1** — "test begins from `last_processed_message_id` when present" — is ambiguous. Clarify that the checkpoint ID is excluded from the fetch, not re-processed.

---

## Missing Items

### 12. Slash command registration script or step

Phase 12 says "Register slash commands through the Discord API" but provides no detail. The plan should include the command registration payloads (command name, description, options with types) or at least reference a registration script. The `/leaderboard` command takes an optional `channel` option of type `CHANNEL` — this needs to be specified in the registration payload.

### 13. No `resolveChannelName` for the `/leaderboard` slash command

The architecture says `/leaderboard` "resolves a display name before calling the formatter so the header can render `#channel-name`". The plan's test in **9.3** says "test passes the channel display name into `formatLeaderboard`", but doesn't specify *where* the name comes from. Options:
- From `interaction.channel.name` (available in the interaction payload for the current channel).
- From a Discord API call for a different channel when the `channel` option is provided.
- From the `leaderboard_channels` table.

The plan should specify the resolution strategy, especially for the case where a user passes a channel option pointing to a channel that isn't in `leaderboard_channels`.

### 14. No test for gateway client lifecycle (heartbeat, reconnection, resume)

Phase 8 only tests event dispatch routing. The gateway connection itself (heartbeat, reconnect on disconnect, session resume) is a critical piece. The plan says "gateway client" in Phase 0 dependencies but doesn't address which library handles this or whether custom lifecycle management is needed. If using a library like `discord.js` or `cloudflare/discord-gateway`, state that. If rolling a custom gateway client, it deserves its own phase.

### 15. No handling of Discord message types in the processor

Phase 4 has a test "test ignores system/non-default messages when they should not affect streaks" — good. But the plan doesn't specify *which* message types are accepted. The architecture's Notes.md shows many message types. At minimum, only `DEFAULT` (0) and `REPLY` (19) should be processed. This filter should be a named constant or set in `constants.ts`.

### 16. Missing `DB` type or database initialization details

The plan references a `Database` type as the first argument to all query functions but doesn't define it in the types reference or specify how the database is initialized. Is this `better-sqlite3`? `D1Database` from Cloudflare? The `Env` interface suggests Cloudflare Workers (bindings pattern), but the plan never says so. If this is Workers + D1, that has significant implications:
- D1 operations are already wrapped in the D1 API; the retry logic may need to account for D1-specific error shapes.
- The `scheduled` handler and gateway client have different runtime constraints on Workers.

This should be clarified in Phase 0.

---

## Minor Nits

- **`ADMINISTRATOR_PERMISSION` as `0x8n` (BigInt)**: The permissions bitfield from Discord is a string. The plan's `hasAdministratorPermission(permissions: string)` will need to parse the string to a `BigInt` before comparing. This is fine, but note that `0x8n` requires BigInt arithmetic throughout — make sure tests cover this.
- **`DiscordAttachment.content_type` is optional**: The `hasMusicAttachment` function tests file extensions, not MIME types, so this is consistent. But if Discord ever sends an attachment without a filename (unlikely but possible), the extension check would fail silently. A fallback to `content_type` could be a nice safeguard.
- **`async-retry` types**: The plan installs `@types/async-retry`. Verify this package exists and is current — some retry libraries ship their own types now.
- **Test infrastructure for DB tests**: Phase 2 tests need a real (or in-memory) SQLite database. The plan doesn't mention test fixtures or setup/teardown for DB state. A brief note on using an in-memory database per test suite would help.

---

## Summary

The plan is solid and implementation-ready for the most part. The **critical items** to resolve before starting are:

1. **Streak reset value** (0 vs 1) — almost certainly a bug in both architecture and plan.
2. **`computeStreakDelta` signature** — needs to handle the null/first-post case cleanly.
3. **Recovery bootstrap** — specify behavior when there's no checkpoint.
4. **Platform/runtime** — clarify if this is Cloudflare Workers + D1 or Node + better-sqlite3; this affects multiple phases.
5. **Rate limiting** — the Discord client will fail without it.
6. **`processed_messages` pruning** — unbounded growth is a production risk.

Everything else is either a minor clarification or a nice-to-have improvement. The TDD discipline, the shared `processMessage` path, the idempotency design, and the content-hash skip logic are all well thought out.
