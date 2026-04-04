# Plan Review: Discord Music Leaderboard Bot

## Overall Assessment

The revised plan is **substantially stronger** than the previous version.

The largest correctness problems from the earlier draft have been addressed:

- the design now uses a **gateway-based ingestion model** for `MESSAGE_CREATE`
- the command permission model is now based on **`ADMINISTRATOR`**, which is much more appropriate than the old owner-role approach
- the retry/result section is now internally coherent
- leaderboard posting is now explicitly **per configured channel**
- recovery ordering and message idempotency are now part of the design instead of being implicit
- the formatter now accepts a display name instead of relying on a channel ID alone

At this point, the plan is **good enough to implement**, with a few remaining design details that should be handled carefully during implementation.

## What Improved

- **Ingress model is now correct at the planning level**
  - The plan no longer depends on a fake `MESSAGE_CREATE` webhook flow.
  - Gateway events and interaction HTTP requests are now clearly separated.

- **Authorization is much better defined**
  - Restricting channel-management commands to members with `ADMINISTRATOR` is a clear and implementable rule.

- **Per-channel behavior is now explicit**
  - Each leaderboard channel is tracked independently.
  - The old ambiguity around a single global leaderboard channel is gone.

- **Schema is more aligned to the intended behavior**
  - Using `channel_id` as the key for `leaderboard_posts` matches the upsert semantics.
  - Introducing `processed_messages` gives the design a concrete idempotency mechanism.

- **Recovery is safer**
  - The plan now requires oldest-to-newest processing within each fetched batch.
  - Checkpoint advancement is tied to successful processing.

- **Tests are better targeted**
  - The revised test list covers several previously missing edge cases, including case-insensitive extension matching, absent recovery checkpoints, and content-size considerations.

## Verification of the Retry/Result Pattern

The updated `withRetry` / `toResult` pattern is now conceptually sound.

The important fix is this behavior:

- `*Actual` functions return `Result.err(...)` instead of throwing outward
- `withRetry` converts `Result.err` into a thrown error **inside the retry callback**
- `async-retry` then retries that operation
- once retries are exhausted, `withRetry` returns a final `Result.err(...)`

That resolves the earlier contradiction.

The only implementation caution is:

- **all exported DB functions must consistently go through `withRetry`**
- **all private DB implementations must consistently return `Result` values**

If that rule is followed uniformly, the pattern is acceptable.

## Remaining Risks and Open Questions

These are no longer blockers, but they are still important.

### 1. `processed_messages` lifecycle is not yet defined

Tracking processed message IDs is the right call, but the plan does not yet define retention behavior.

Over time, `processed_messages` can grow indefinitely.

Recommendation:

- define a cleanup strategy
- for example, periodically delete IDs older than a retention window that is safely longer than the recovery horizon

### 2. The interaction payload shape should be validated carefully

The plan depends on reading `member.permissions` from the interaction payload.

That is a reasonable design, but the exact shape should be verified against the chosen interaction handling path so the TypeScript types match reality.

## Best Practices the Revised Plan Gets Right

- **Single authoritative processing path**
  - Moving shared message logic into a single processor is a strong design choice.

- **Explicit UPSERT semantics**
  - Replacing `INSERT OR REPLACE` with `ON CONFLICT DO UPDATE` is the correct move.

- **Per-channel scheduled posting**
  - This aligns the schema, the command behavior, and the user-facing output.

- **Improved test coverage**
  - The revised plan now covers several failure modes that would matter in production.

## Final Verdict

This is now a **good implementation plan**.

It is materially more correct than the earlier version, and the remaining issues are mostly implementation details and operational clarifications rather than architectural blockers.

## Bottom Line

- **Is the revised plan generally good?** Yes.
- **Is it implementable as written?** Broadly yes.
- **What still needs care during implementation?** Gateway runtime validation, cleanup strategy for processed message IDs, and payload-shape verification for permissions.
