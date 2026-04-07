# tests/tracker.test.ts

Tests for `src/services/tracker.ts`. No database — all tests are pure unit tests.

## computeNewStats coverage

- First post: `runCount = 1`, `highestRunSeen = 1`.
- `delta <= 8h`: `runCount` unchanged, `lastMusicPostAt` updated.
- Negative delta: clamped to `noop`, `runCount` unchanged, newer timestamp preserved.
- `8h < delta <= 36h`: `runCount` incremented.
- `highestRunSeen` updates when new streak exceeds prior best.
- `highestRunSeen` does not decrease.
- `delta > 36h`: `runCount` resets to `1`, `highestRunSeen` preserved.

## hasMusicAttachment coverage

- All six extensions: `.mp3`, `.ogg`, `.wav`, `.flac`, `.m4a`, `.aac`.
- Case-insensitive matching (`SONG.MP3`, `TRACK.OGG`).
- `song.mp3.txt` rejected (extension must be the last part).
- Non-audio filenames return `false`.
- Empty attachments array returns `false`.
- No filename, `audio/mpeg` content type → `true`.
- No filename, `image/png` content type → `false`.
- No filename, no content type → `false`.

## resolveUsername coverage

- Prefers `member.nick`.
- Falls back to `author.globalName`.
- Falls back to `author.username`.
- Works without a `member` argument (both fallback cases).

**25 tests, all passing.**

## Related pages

- [service-tracker.md](service-tracker.md)
