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
- All seven video extensions: `.mp4`, `.webm`, `.mov`, `.avi`, `.mkv`, `.wmv`, `.flv`.
- PDF extension: `.pdf`.
- Case-insensitive matching for all types (`SONG.MP3`, `PHOTO.JPG`, `DOCUMENT.PDF`, `CLIP.MP4`).
- `song.mp3.txt` rejected (extension must be the last part).
- Non-audio/non-image/non-video/non-pdf filenames return `false`.
- Empty attachments array returns `false`.
- No filename, `audio/mpeg` content type → `true`.
- No filename, `image/jpeg` / `image/png` / `image/webp` content type → `true`.
- No filename, `application/pdf` content type → `true`.
- No filename, `video/mp4` / `video/webm` content type → `true`.
- No filename, no content type → `false`.

## hasYouTubeLink coverage

- `youtube.com/watch?v=...` → `true`.
- `youtu.be/...` → `true`.
- `youtube.com/shorts/...`, `youtube.com/live/...`, `youtube.com/embed/...`, `youtube.com/v/...` → `true`.
- `www.youtube.com/...` and `m.youtube.com/...` → `true`.
- Extra query params (`&t=14s`, `&list=...`) do not prevent matching.
- `music.youtube.com/watch?v=...` → `false`.
- Random text with no YouTube link → `false`.
- `undefined` content → `false`.
- Empty string → `false`.

## resolveUsername coverage

- Prefers `member.nick`.
- Falls back to `author.globalName`.
- Falls back to `author.username`.
- Works without a `member` argument (both fallback cases).

**59 tests, all passing.**

## Related pages

- [service-tracker.md](service-tracker.md)
