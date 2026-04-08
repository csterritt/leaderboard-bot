# e2e-tests/interactions/slash-commands.test.ts

Exercises the HTTP interaction path end-to-end with real handler logic, in-memory database state, and selective Discord fetch stubs.

## Coverage

- Ping interactions return `{ type: 1 }`.
- `/setleaderboardchannel` supports success, admin rejection, guild-context rejection, and idempotent channel-name refresh.
- `/removeleaderboardchannel` removes the leaderboard channel and linked monitored-channel association.
- `/addmonitoredchannel` supports success, rejection when the current channel is not a leaderboard channel, and idempotent re-add.
- `/removemonitoredchannel` removes the monitored channel while preserving the leaderboard channel.
- `/leaderboard` returns formatted ephemeral output, rejects unknown leaderboard channels, and reports missing monitored-channel links.
- Signature failures return `401` for missing headers or invalid verifier results.
- Unknown command names return `400`.
- Full admin workflow covers setup, linking, seeding stats, and reading leaderboard output.

## Test approach

- Uses `handleInteractionWithVerifier` with an injected verifier for deterministic signature control.
- Uses an in-memory better-sqlite3 database with the real schema.
- Seeds real DB rows via query helpers instead of mocking persistence.
- Resets Discord rate-limit state between tests via `_resetRateLimit()`.

## Cross-references

- [handler-interactions.md](handler-interactions.md) — implementation
- [service-discord.md](service-discord.md) — channel lookup path used by `/leaderboard`
- [db-queries.md](db-queries.md) — persistent state mutated by command handlers
- [e2e-tests.md](e2e-tests.md) — e2e suite overview
