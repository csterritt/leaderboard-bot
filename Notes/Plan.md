# Plan: Add video file attachment and YouTube link support

## Assumptions

- No database schema changes needed
- Video attachments and YouTube links contribute to the same streak as audio, image, and PDF files
- No terminology changes — the function is still called `hasMusicAttachment`
- `music.youtube.com` links should NOT count
- YouTube link detection requires adding a `content` field to message types (not a DB schema change)

## Scope

Two separate features:

1. **Video file attachments** — detect by extension and content-type fallback, same pattern as existing audio/image/PDF checks
2. **YouTube link detection** — detect YouTube URLs in message text content; requires threading `content` through the normalization and type system

## Video extensions to support

Common on Discord: `.mp4`, `.webm`, `.mov`
Less common: `.avi`, `.mkv`, `.wmv`, `.flv`

Content-type fallback: `video/` prefix

## YouTube URL patterns to match

All of these with optional `http://` or `https://`, optional `www.` or `m.` subdomain:

- `youtube.com/watch?v=VIDEO_ID`
- `youtu.be/VIDEO_ID`
- `youtube.com/shorts/VIDEO_ID`
- `youtube.com/live/VIDEO_ID`
- `youtube.com/embed/VIDEO_ID`
- `youtube.com/v/VIDEO_ID`

Explicitly excluded: `music.youtube.com` (any path)

YouTube video IDs are 11 characters: `[A-Za-z0-9_-]{11}`

URLs may have additional query params (`&t=`, `&list=`, etc.) that should not prevent matching.

## Pitfalls

- **`NormalizedMessage` needs a `content` field** — currently absent. Must add to `NormalizedMessage`, `DiscordMessage`, and `GatewayMessage` (in processor.ts). Must thread through both normalization functions.
- **Existing tests create `NormalizedMessage` objects without `content`** — the field should be optional (`content?: string`) to avoid breaking all existing test fixtures.
- **`processMessage` currently only checks `hasMusicAttachment(message.attachments)`** — needs to also check for YouTube links in `message.content`.
- **The `video/mp4` content-type test** in `tests/tracker.test.ts` currently expects `false` — needs updating.
- **The e2e recovery test** `makeDiscordMessage` helper builds `DiscordMessage` objects — needs `content` field added.
- **Regex must not match `music.youtube.com`** — the pattern should explicitly exclude it.

## Tasks

### Part A: Video file attachments

- [x] 1. Add `VIDEO_EXTENSIONS` and `VIDEO_CONTENT_TYPE_PREFIX` to `src/constants.ts`
- [x] 2. Write failing tests in `tests/tracker.test.ts` for video extension detection (`.mp4`, `.webm`, `.mov`, `.avi`, `.mkv`, `.wmv`, `.flv`), case-insensitive matching, and `video/` content-type fallback
- [x] 3. Update existing test that expects `video/mp4` content type → `false` (now should be `true`)
- [x] 4. Update `hasMusicAttachment` in `src/services/tracker.ts` to check `VIDEO_EXTENSIONS` and `VIDEO_CONTENT_TYPE_PREFIX`
- [x] 5. Run `tests/tracker.test.ts` — all green

### Part B: YouTube link detection (types + plumbing)

- [x] 6. Add `content?: string` to `NormalizedMessage` in `src/types.ts`
- [x] 7. Add `content?: string` to `DiscordMessage` in `src/types.ts`
- [x] 8. Update `normalizeDiscordMessage` in `src/services/processor.ts` to map `content`
- [x] 9. Update `GatewayMessage` interface and `normalizeGatewayMessage` in `src/services/processor.ts` to map `content`
- [x] 10. Add `YOUTUBE_URL_PATTERN` regex constant to `src/constants.ts`
- [x] 11. Add `hasYouTubeLink(content: string | undefined): boolean` to `src/services/tracker.ts`
- [x] 12. Write failing tests for `hasYouTubeLink` in `tests/tracker.test.ts`:
    - `youtube.com/watch?v=...` → true
    - `youtu.be/...` → true
    - `youtube.com/shorts/...` → true
    - `youtube.com/live/...` → true
    - `youtube.com/embed/...` → true
    - `youtube.com/v/...` → true
    - `www.youtube.com/watch?v=...` → true
    - `m.youtube.com/watch?v=...` → true
    - URL with extra params (`&t=14s`, `&list=...`) → true
    - `music.youtube.com/watch?v=...` → false
    - Random text with no YouTube link → false
    - `undefined` content → false
    - Empty string → false
- [x] 13. Implement `hasYouTubeLink` — all tests green

### Part C: Wire YouTube detection into processMessage

- [x] 14. Update `processMessage` in `src/services/processor.ts` — check `hasMusicAttachment(message.attachments) || hasYouTubeLink(message.content)` instead of just `hasMusicAttachment`
- [x] 15. Write/update tests in `tests/processor.test.ts`:
    - Message with YouTube link in content but no attachment → processed
    - Message with YouTube link + attachment → processed
    - Message with `music.youtube.com` link and no attachment → not processed
    - Update `normalizeDiscordMessage` and `normalizeGatewayMessage` tests to verify `content` passthrough
- [x] 16. Run `tests/processor.test.ts` — all green

### Part D: Update e2e tests

- [x] 17. Update `e2e-tests/streaks/streak-accumulation.test.ts` — add test for YouTube link message counting toward streak
- [x] 18. Update `e2e-tests/recovery/recovery-pipeline.test.ts` — add `content` to `DiscordMessage` in `makeDiscordMessage`, verify YouTube link messages are recovered

### Part E: Full test suite + wiki + notify

- [x] 19. Run full test suite (`bun --bun vitest run`) — all green
- [x] 20. Update wiki pages: `constants.md`, `service-tracker.md`, `service-processor.md`, `tests-tracker.md`, `tests-processor.md`, `types.md`, `e2e-streaks.md`, `e2e-recovery.md`
- [x] 21. Notify completion via `/home/chris/notify-app`
