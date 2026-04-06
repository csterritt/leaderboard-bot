# Plan Review

## Overall Assessment

This is a strong plan overall. It is structured, internally consistent with the architecture document, and it makes several good design choices up front:

- separating gateway ingestion from interaction handling
- using a shared `processMessage` path for gateway and recovery
- treating idempotency as a first-class concern
- keeping configuration explicit through `leaderboard_channels` and `monitored_channels`
- planning the work in a phased order that is mostly sensible

The plan is good enough to implement from, but I do **not** think it is fully correct as written. There are a few important correctness risks that should be fixed before implementation starts, especially around recovery checkpoints, transactional idempotency, and leaderboard aggregation across multiple monitored channels.

## What Is Good About the Plan

### 1. The architecture and implementation plan align well

The plan tracks the architecture document closely. The main components, schema, command set, and scheduled workflow are all consistent. That reduces ambiguity for implementation.

### 2. The shared processor is the right idea

Using one authoritative message-processing path for both gateway events and recovery is a very good design choice. It reduces drift, avoids duplicate business logic, and makes correctness easier to reason about.

### 3. The plan takes failure and idempotency seriously

The inclusion of `processed_messages`, `recovery_state`, and the recovery pass is a good sign. This is the right problem to focus on for a bot that receives data from both live gateway events and backfill.

### 4. The command model is understandable

Separating leaderboard channels from monitored channels is slightly more work operationally, but it is flexible and clearly reflected in both the schema and the command flow.

### 5. The phases are mostly in a practical order

Utilities → DB → tracker → processor → recovery → handlers is a sensible implementation sequence.

## Major Correctness Issues

### 1. Advancing `recovery_state` inside `processMessage` is dangerous

This is the biggest issue in the plan.

Right now, both the architecture and plan say that `processMessage` advances `recovery_state.last_processed_message_id` after successful processing. That is safe for recovery, but it is **not** safe when the same function is called from the live gateway path.

Example failure mode:

- the bot misses older messages while offline
- after restart, a new live message arrives and is processed through the gateway
- `recovery_state` is advanced to that new message ID
- later, recovery fetches `after=last_processed_message_id`
- the older missed messages are now permanently skipped

That would create silent data loss.

### Recommended change

- `recovery_state` should be advanced by the recovery flow, not by the generic `processMessage` path
- alternatively, `processMessage` should accept an explicit mode or option controlling whether checkpoint advancement is allowed
- the plan should add a test proving that live gateway processing cannot move the recovery checkpoint past unseen historical messages

Without this change, the recovery design is not correct.

### 2. Message claim + stats mutation must be atomic

The plan correctly says the message ID should be claimed before mutating stats, but it does not go far enough. Those operations must occur in a **single transaction**.

Otherwise this failure is possible:

- insert into `processed_messages` succeeds
- updating `user_stats` fails
- the message is now marked as processed
- recovery sees it as already claimed and skips it forever

That would permanently lose the event.

### Recommended change

- explicitly require `claimProcessedMessage`, stats update, and any related writes to happen in one database transaction
- add a test that simulates a failure after claiming and verifies the message is still retryable
- document whether `recovery_state` update is in the same transaction or intentionally separate

This needs to be specified, not left implicit.

### 3. Leaderboard merging across multiple monitored channels is underspecified and likely incorrect

The plan says `/leaderboard` and scheduled posting should query all monitored channels linked to a leaderboard channel and “merge rows.” That is not enough detail.

If the same user posts in multiple monitored channels linked to one leaderboard channel, what should happen?

Possible interpretations:

- show one row per user per monitored channel
- aggregate by user across channels
- take the max active streak across channels
- sum runs across channels
- take the max best streak across channels

Those all produce different leaderboards.

Given the product description says “maintains per-user streak statistics based on post timing” and “posts a separate leaderboard inside each configured leaderboard channel,” the likely intent is one row per user in the leaderboard output. If so, the plan currently does not define the aggregation rule and may produce duplicate rows for the same user.

### Recommended change

- explicitly define cross-channel aggregation semantics for linked monitored channels
- add tests for the same user appearing in multiple monitored channels linked to one leaderboard channel
- decide whether the leaderboard is:
  - channel-scoped and duplicated per source channel, or
  - aggregated per user across linked channels

This should be resolved before implementation.

## Medium-Risk Design Problems

### 4. The DB retry pattern is over-applied

The plan wraps every exported DB function in `withRetry`. For synchronous `better-sqlite3`, that is not obviously helpful.

Most failures will be deterministic programming or SQL errors, and blindly retrying them three times adds noise rather than resilience. There is also no backoff or filtering for retryable conditions.

### Recommended change

- either remove DB retries entirely for local SQLite operations
- or restrict retries to known transient failures such as busy/locked conditions
- if retries remain, document the exact retryable error criteria

As written, this is more ceremony than value.

### 5. The schema should define relational and indexing intent more clearly

The logical relationships are clear, but the schema is missing important implementation details:

- `monitored_channels.leaderboard_channel_id` should likely reference `leaderboard_channels.channel_id`
- `processed_messages.processed_at` likely needs an index because pruning is time-based
- `monitored_channels.leaderboard_channel_id` likely needs an index because it is queried frequently

SQLite does not require full relational rigor for a small bot, but the plan should at least state whether foreign keys are intentionally enforced.

### Recommended change

- specify whether `PRAGMA foreign_keys = ON` will be used
- add indexes for hot query paths and prune paths
- define deletion behavior intentionally rather than only in command handlers

### 6. `updated_at` behavior is still ambiguous

The plan includes tests such as “preserves `updated_at` behavior expected by the schema,” but the schema itself does not automatically update `updated_at` on UPSERT. That only happens if the SQL explicitly sets it.

### Recommended change

- specify exact `updated_at` semantics for `user_stats`, `leaderboard_channels`, and `recovery_state`
- add explicit SQL behavior in the plan rather than relying on the schema default

Right now the intention is clear, but the implementation contract is not.

### 7. The shared processor needs an explicit normalization boundary

Recovery works with raw REST-shaped message payloads. The live gateway path uses `discord.js` message objects. Those are not the same shape.

The plan treats both as if they can be fed directly into one shared `processMessage` function. That may be possible, but only if there is an explicit normalization step.

### Recommended change

- define a small internal canonical message type used by `processMessage`
- add adapters from `discord.js` gateway messages and REST recovery messages into that canonical type
- add tests that both adapters preserve the fields used for streak logic

This will reduce friction and keep the processor clean.

## Best-Practice Concerns

### 8. The rate-limit strategy is safe but very conservative

The proposed `1_100 ms` minimum delay between all Discord API calls is simple and safe for a small bot, but it may become slow if many monitored or leaderboard channels are configured.

For example, hourly recovery plus delete/post cycles could take a long time if every request is fully serialized behind a global delay.

### Recommendation

- keep this if the bot is expected to stay small
- otherwise note that this is an intentionally simple v1 strategy and may need per-route or bucket-aware handling later

I would not block the plan on this, but I would label it as a deliberate simplicity tradeoff.

### 9. FNV-1a is fine for change detection, but the wording is slightly too strong

The plan says FNV-1a has “good collision resistance for this use case.” That is directionally fine for lightweight content-change detection, but it is not collision-resistant in any strong sense.

### Recommendation

- reword this as “sufficient for lightweight non-cryptographic change detection”

This is minor, but worth tightening.

### 10. The TDD requirement is good, but the plan is somewhat test-heavy in the glue layers

The pure logic layers clearly benefit from TDD. Some of the HTTP wiring and registration-script work may not justify the same granularity of unit testing, especially if it slows delivery.

### Recommendation

- keep strong TDD for streak logic, DB behavior, recovery, and idempotency
- allow lighter integration-focused tests for thin transport glue

That would keep the plan rigorous without becoming overly procedural.

## Missing Items That Should Be Added

### 1. Add an explicit test for out-of-order timestamps or impossible deltas

Even if Discord ordering is usually reliable, the tracker should define behavior when `newPostTimestamp < lastMusicPostAt`.

### Recommended addition

- decide whether to ignore the message, clamp the delta, or treat it as no-op
- add a test for this case

### 2. Add sanitization/escaping rules for leaderboard formatting

Usernames can contain characters that will break table formatting, especially pipes, backticks, and long names.

### Recommended addition

- define how usernames are escaped or normalized in leaderboard output
- add a test for usernames that contain markdown/table-breaking characters

### 3. Add startup behavior for recovery

If scheduled work only runs hourly, the bot could remain stale for up to an hour after restart.

### Recommended addition

- run one recovery pass shortly after startup, or
- run `runScheduledWork` once on boot before starting the interval

This is not strictly required, but it would materially improve correctness after downtime.

### 4. Add tests for command-side validation and permission edge cases

The plan covers the main admin permission checks, but it should also explicitly test:

- missing `member` payload on an interaction
- missing or malformed `permissions`
- commands invoked outside guild context
- channel lookup failures for `/leaderboard [channel]`

These are common Discord edge cases.

### 5. Add a decision on first recovery fetch behavior

The plan says recovery starts from `after=0` when no checkpoint exists. That may work, but it is worth verifying rather than assuming.

### Recommended addition

- confirm that `after=0` is accepted and behaves as intended by Discord for this endpoint
- if not, define the first-request strategy differently

This is small, but it is better to resolve now than during implementation.

## Suggested Plan Changes

If I were revising the plan, I would make these concrete changes:

1. Remove checkpoint advancement from the generic `processMessage` path and move it into recovery-specific orchestration.
2. Require a single transaction for message claim + stat mutation, and add tests for partial-failure rollback.
3. Define exactly how leaderboard rows are aggregated across multiple monitored channels linked to one leaderboard channel.
4. Add a canonical internal message shape plus adapters for gateway and recovery inputs.
5. Clarify `updated_at` semantics and add missing indexes / foreign-key decisions.
6. Add formatting-safety tests for usernames and message-length edge cases.
7. Add an immediate-on-start recovery or scheduled run.

## Final Verdict

This is a **good plan with a solid architectural foundation**, but it is **not yet implementation-safe without revision**.

My recommendation is:

- keep the overall structure
- keep the phased sequence
- keep the shared processor and recovery-first mindset
- revise the checkpoint and transaction semantics before any coding begins
- clarify leaderboard aggregation semantics before implementing command and scheduled output

If those items are corrected, the plan becomes much stronger and should be a reliable basis for implementation.
