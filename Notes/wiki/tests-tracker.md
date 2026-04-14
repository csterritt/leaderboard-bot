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

- All six audio extensions: `.mp3`, `.ogg`, `.wav`, `.flac`, `.m4a`, `.aac`.
- All four image extensions: `.jpg`, `.jpeg`, `.png`, `.webp`.
- PDF extension: `.pdf`.
- Case-insensitive matching for all types (`SONG.MP3`, `PHOTO.JPG`, `DOCUMENT.PDF`).
- `song.mp3.txt` rejected (extension must be the last part).
- Non-audio/non-image/non-pdf filenames return `false`.
- Empty attachments array returns `false`.
- No filename, `audio/mpeg` content type → `true`.
- No filename, `image/jpeg` content type → `true`.
- No filename, `image/png` content type → `true`.
- No filename, `image/webp` content type → `true`.
- No filename, `application/pdf` content type → `true`.
- No filename, non-audio/non-image/non-pdf content type (e.g., `video/mp4`) → `false`.
- No filename, no content type → `false`.

## resolveUsername coverage

- Prefers `member.nick`.
- Falls back to `author.globalName`.
- Falls back to `author.username`.
- Works without a `member` argument (both fallback cases).

**36 tests, all passing.**

## Related pages

- [service-tracker.md](service-tracker.md)
