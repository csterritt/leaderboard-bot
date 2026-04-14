# services/tracker.ts

Pure business logic for streak tracking, attachment detection, and username resolution. No DB access — all functions are pure or near-pure.

## computeNewStats

```typescript
computeNewStats(
  existing: UserStats | null,
  newPostTimestamp: number,
  username: string,
  userId: string,
  channelId: string,
): UpsertUserStatsInput
```

Computes the updated `UserStats` for a user after a new music post arrives.

**Logic:**

- `existing === null` (first post): `runCount = 1`, `highestRunSeen = 1`, `lastMusicPostAt = newPostTimestamp`.
- Computes `deltaSecs = newPostTimestamp - lastMusicPostAt` (negative if out of order).
- Delegates to `computeStreakDelta` for classification (`noop` / `increment` / `reset`).
- **`noop`** (`delta <= 8h`): `runCount` unchanged, `lastMusicPostAt = max(existing, new)`.
- **`increment`** (`8h < delta <= 36h`): `runCount++`, `lastMusicPostAt = newPostTimestamp`.
- **`reset`** (`delta > 36h`): `runCount = 1`, `lastMusicPostAt = newPostTimestamp`.
- `highestRunSeen = max(existing.highestRunSeen, runCount)`.
- Negative deltas are clamped by `computeStreakDelta` (→ `noop`); `lastMusicPostAt` stays the larger timestamp.

## hasMusicAttachment

```typescript
hasMusicAttachment(attachments: readonly NormalizedAttachment[]): boolean
```

Returns `true` if any attachment qualifies as a music file, image file, or PDF file.

**Primary check:** `filename` (lowercased) ends with one of:
- `MUSIC_EXTENSIONS` (`.mp3`, `.ogg`, `.wav`, `.flac`, `.m4a`, `.aac`)
- `IMAGE_EXTENSIONS` (`.jpg`, `.jpeg`, `.png`, `.webp`)
- `VIDEO_EXTENSIONS` (`.mp4`, `.webm`, `.mov`, `.avi`, `.mkv`, `.wmv`, `.flv`)
- `PDF_EXTENSION` (`.pdf`)

**Fallback:** if `filename` is absent, checks:
- `contentType.startsWith('audio/')`
- `contentType.startsWith('image/')`
- `contentType.startsWith('video/')`
- `contentType === 'application/pdf'`

Returns `false` if the array is empty or no attachment matches.

## hasYouTubeLink

```typescript
hasYouTubeLink(content: string | undefined): boolean
```

Returns `true` if `content` contains a YouTube video URL matching `YOUTUBE_URL_PATTERN`.

**Matches:** `youtube.com/watch?v=`, `youtu.be/`, `youtube.com/shorts/`, `youtube.com/live/`, `youtube.com/embed/`, `youtube.com/v/` with optional `www.` or `m.` subdomain. Optional `https://`. Extra query params (`&t=`, `&list=`, etc.) allowed.

**Does NOT match:** `music.youtube.com` (any path). Returns `false` for `undefined` or empty string.

## resolveUsername

```typescript
resolveUsername(author: NormalizedAuthor, member: NormalizedMember | undefined): string
```

Priority: `member.nick` → `author.globalName` → `author.username`.

## Related pages

- [util-time.md](util-time.md) — `computeStreakDelta` (used internally)
- [constants.md](constants.md) — `MUSIC_EXTENSIONS`, `VIDEO_EXTENSIONS`, `AUDIO_CONTENT_TYPE_PREFIX`, `VIDEO_CONTENT_TYPE_PREFIX`, `YOUTUBE_URL_PATTERN`
- [types.md](types.md) — `UserStats`, `UpsertUserStatsInput`, `NormalizedAttachment`, `NormalizedAuthor`, `NormalizedMember`
- [tests-tracker.md](tests-tracker.md) — test coverage
