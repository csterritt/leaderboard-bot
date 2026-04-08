# e2e-tests/recovery/recovery-pipeline.test.ts

Exercises the full recovery flow from Discord REST fetches through message normalization, processing, and checkpoint persistence.

## Coverage

- Single-page recovery builds stats and updates `recovery_state`.
- Multi-page recovery continues until an empty page is returned.
- Recovery resumes from the saved checkpoint on later runs.
- Pre-claimed message IDs are skipped while the checkpoint still advances.
- Mixed music and non-music batches only process qualifying music messages.
- Mixed-user batches build independent stats per user.
- `recoverAllChannels()` iterates every monitored channel.
- Re-running recovery against the same data is idempotent.

## Test approach

- Uses an in-memory database with real schema and seeded channel links.
- Stubs Discord HTTP responses with `vi.stubGlobal('fetch', ...)`.
- Uses `createClock()` for deterministic timestamp generation.
- Asserts both data rows (`user_stats`) and checkpoint rows (`recovery_state`).

## Cross-references

- [service-recovery.md](service-recovery.md) — implementation
- [service-discord.md](service-discord.md) — REST fetch path used by recovery
- [service-processor.md](service-processor.md) — downstream processing path
- [e2e-tests.md](e2e-tests.md) — e2e suite overview
