# tests/leaderboard.test.ts

11 tests covering `services/leaderboard.ts`.

## formatLeaderboard (7 tests)

- Header contains the provided channel display name.
- Empty rows → "no data" message.
- Ranks start at `#1` and increment; no `#0` or missing ranks.
- Pipes in usernames are escaped (replaced with space) — table formatting cannot be broken.
- Backtick counts are even after escaping — no dangling inline code.
- Long usernames (100 chars) → output ≤ 2 000 chars.
- Maximum 50 rows → output ≤ 2 000 chars (Discord message limit).

## hashContent (4 tests)

- Same input always produces the same hex digest.
- Different inputs produce different digests.
- Output matches `/^[0-9a-f]+$/`.
- Deterministic across multiple calls for a variety of inputs including empty string and emoji.

## Related pages

- [service-leaderboard.md](service-leaderboard.md) — implementation
