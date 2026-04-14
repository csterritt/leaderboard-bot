import { describe, it, expect } from 'vitest'
import { computeNewStats, hasMusicAttachment, hasYouTubeLink, resolveUsername } from '../src/services/tracker'
import type {
  UserStats,
  NormalizedAttachment,
  NormalizedAuthor,
  NormalizedMember,
} from '../src/types'

// ─── computeNewStats ─────────────────────────────────────────────────────────

const CHANNEL_ID = 'ch-001'
const USER_ID = 'user-001'
const USERNAME = 'Alice'

describe('computeNewStats', () => {
  it('first-ever post: sets runCount = 1 and highestRunSeen = 1', () => {
    const result = computeNewStats(null, 1000, USERNAME, USER_ID, CHANNEL_ID)
    expect(result.runCount).toBe(1)
    expect(result.highestRunSeen).toBe(1)
    expect(result.lastMusicPostAt).toBe(1000)
    expect(result.userId).toBe(USER_ID)
    expect(result.channelId).toBe(CHANNEL_ID)
    expect(result.username).toBe(USERNAME)
  })

  it('delta <= 8h: leaves runCount unchanged and updates lastMusicPostAt', () => {
    const existing: UserStats = {
      channelId: CHANNEL_ID,
      userId: USER_ID,
      username: USERNAME,
      lastMusicPostAt: 1000,
      runCount: 3,
      highestRunSeen: 5,
    }
    const result = computeNewStats(existing, 1000 + 28_800, USERNAME, USER_ID, CHANNEL_ID)
    expect(result.runCount).toBe(3)
    expect(result.lastMusicPostAt).toBe(1000 + 28_800)
    expect(result.highestRunSeen).toBe(5)
  })

  it('negative delta: clamped to 0, runCount unchanged, newer timestamp preserved', () => {
    const existing: UserStats = {
      channelId: CHANNEL_ID,
      userId: USER_ID,
      username: USERNAME,
      lastMusicPostAt: 5000,
      runCount: 2,
      highestRunSeen: 3,
    }
    const result = computeNewStats(existing, 3000, USERNAME, USER_ID, CHANNEL_ID)
    expect(result.runCount).toBe(2)
    expect(result.lastMusicPostAt).toBe(5000)
  })

  it('8h < delta <= 36h: increments runCount', () => {
    const existing: UserStats = {
      channelId: CHANNEL_ID,
      userId: USER_ID,
      username: USERNAME,
      lastMusicPostAt: 1000,
      runCount: 2,
      highestRunSeen: 2,
    }
    const result = computeNewStats(existing, 1000 + 28_801, USERNAME, USER_ID, CHANNEL_ID)
    expect(result.runCount).toBe(3)
    expect(result.lastMusicPostAt).toBe(1000 + 28_801)
  })

  it('highestRunSeen updates when new active streak exceeds prior best', () => {
    const existing: UserStats = {
      channelId: CHANNEL_ID,
      userId: USER_ID,
      username: USERNAME,
      lastMusicPostAt: 1000,
      runCount: 5,
      highestRunSeen: 5,
    }
    const result = computeNewStats(existing, 1000 + 28_801, USERNAME, USER_ID, CHANNEL_ID)
    expect(result.runCount).toBe(6)
    expect(result.highestRunSeen).toBe(6)
  })

  it('highestRunSeen does not decrease when new streak is lower', () => {
    const existing: UserStats = {
      channelId: CHANNEL_ID,
      userId: USER_ID,
      username: USERNAME,
      lastMusicPostAt: 1000,
      runCount: 3,
      highestRunSeen: 10,
    }
    const result = computeNewStats(existing, 1000 + 28_801, USERNAME, USER_ID, CHANNEL_ID)
    expect(result.runCount).toBe(4)
    expect(result.highestRunSeen).toBe(10)
  })

  it('delta > 36h: resets runCount to 1 (new post starts a fresh streak)', () => {
    const existing: UserStats = {
      channelId: CHANNEL_ID,
      userId: USER_ID,
      username: USERNAME,
      lastMusicPostAt: 1000,
      runCount: 5,
      highestRunSeen: 5,
    }
    const result = computeNewStats(existing, 1000 + 129_601, USERNAME, USER_ID, CHANNEL_ID)
    expect(result.runCount).toBe(1)
    expect(result.highestRunSeen).toBe(5)
    expect(result.lastMusicPostAt).toBe(1000 + 129_601)
  })
})

// ─── hasMusicAttachment ───────────────────────────────────────────────────────

describe('hasMusicAttachment', () => {
  const att = (filename?: string, contentType?: string): NormalizedAttachment => ({
    filename,
    contentType,
  })

  it('returns true for .mp3', () => {
    expect(hasMusicAttachment([att('song.mp3')])).toBe(true)
  })

  it('returns true for .ogg', () => {
    expect(hasMusicAttachment([att('track.ogg')])).toBe(true)
  })

  it('returns true for .wav', () => {
    expect(hasMusicAttachment([att('audio.wav')])).toBe(true)
  })

  it('returns true for .flac', () => {
    expect(hasMusicAttachment([att('hi.flac')])).toBe(true)
  })

  it('returns true for .m4a', () => {
    expect(hasMusicAttachment([att('voice.m4a')])).toBe(true)
  })

  it('returns true for .aac', () => {
    expect(hasMusicAttachment([att('clip.aac')])).toBe(true)
  })

  it('file extension matching is case-insensitive', () => {
    expect(hasMusicAttachment([att('SONG.MP3')])).toBe(true)
    expect(hasMusicAttachment([att('TRACK.OGG')])).toBe(true)
  })

  it('song.mp3.txt is rejected (extension must be the last part)', () => {
    expect(hasMusicAttachment([att('song.mp3.txt')])).toBe(false)
  })

  it('non-audio/non-image/non-pdf attachments return false', () => {
    expect(hasMusicAttachment([att('document.txt')])).toBe(false)
  })

  it('no attachments returns false', () => {
    expect(hasMusicAttachment([])).toBe(false)
  })

  it('attachment with no filename but audio/mpeg content_type returns true', () => {
    expect(hasMusicAttachment([att(undefined, 'audio/mpeg')])).toBe(true)
  })

  it('attachment with no filename but video/mp4 content_type returns true', () => {
    expect(hasMusicAttachment([att(undefined, 'video/mp4')])).toBe(true)
  })

  it('attachment with no filename and no content_type returns false', () => {
    expect(hasMusicAttachment([att(undefined, undefined)])).toBe(false)
  })

  // New tests for image and PDF support
  it('returns true for .jpg', () => {
    expect(hasMusicAttachment([att('photo.jpg')])).toBe(true)
  })

  it('returns true for .jpeg', () => {
    expect(hasMusicAttachment([att('image.jpeg')])).toBe(true)
  })

  it('returns true for .png', () => {
    expect(hasMusicAttachment([att('graphic.png')])).toBe(true)
  })

  it('returns true for .webp', () => {
    expect(hasMusicAttachment([att('picture.webp')])).toBe(true)
  })

  it('returns true for .pdf', () => {
    expect(hasMusicAttachment([att('document.pdf')])).toBe(true)
  })

  it('image extension matching is case-insensitive', () => {
    expect(hasMusicAttachment([att('PHOTO.JPG')])).toBe(true)
    expect(hasMusicAttachment([att('IMAGE.PNG')])).toBe(true)
    expect(hasMusicAttachment([att('PICTURE.WEBP')])).toBe(true)
  })

  it('PDF extension matching is case-insensitive', () => {
    expect(hasMusicAttachment([att('DOCUMENT.PDF')])).toBe(true)
  })

  it('attachment with no filename but image/jpeg content_type returns true', () => {
    expect(hasMusicAttachment([att(undefined, 'image/jpeg')])).toBe(true)
  })

  it('attachment with no filename but image/png content_type returns true', () => {
    expect(hasMusicAttachment([att(undefined, 'image/png')])).toBe(true)
  })

  it('attachment with no filename but image/webp content_type returns true', () => {
    expect(hasMusicAttachment([att(undefined, 'image/webp')])).toBe(true)
  })

  it('attachment with no filename but application/pdf content_type returns true', () => {
    expect(hasMusicAttachment([att(undefined, 'application/pdf')])).toBe(true)
  })

  // Video file support
  it('returns true for .mp4', () => {
    expect(hasMusicAttachment([att('clip.mp4')])).toBe(true)
  })

  it('returns true for .webm', () => {
    expect(hasMusicAttachment([att('video.webm')])).toBe(true)
  })

  it('returns true for .mov', () => {
    expect(hasMusicAttachment([att('movie.mov')])).toBe(true)
  })

  it('returns true for .avi', () => {
    expect(hasMusicAttachment([att('film.avi')])).toBe(true)
  })

  it('returns true for .mkv', () => {
    expect(hasMusicAttachment([att('show.mkv')])).toBe(true)
  })

  it('returns true for .wmv', () => {
    expect(hasMusicAttachment([att('media.wmv')])).toBe(true)
  })

  it('returns true for .flv', () => {
    expect(hasMusicAttachment([att('stream.flv')])).toBe(true)
  })

  it('video extension matching is case-insensitive', () => {
    expect(hasMusicAttachment([att('CLIP.MP4')])).toBe(true)
    expect(hasMusicAttachment([att('VIDEO.WEBM')])).toBe(true)
    expect(hasMusicAttachment([att('MOVIE.MOV')])).toBe(true)
  })

  it('attachment with no filename but video/ content_type returns true', () => {
    expect(hasMusicAttachment([att(undefined, 'video/webm')])).toBe(true)
  })
})

// ─── resolveUsername ─────────────────────────────────────────────────────────

describe('resolveUsername', () => {
  const author = (username: string, globalName: string | null = null): NormalizedAuthor => ({
    id: 'u1',
    username,
    globalName,
    isBot: false,
  })

  const member = (nick: string | null): NormalizedMember => ({ nick })

  it('prefers member.nick', () => {
    expect(resolveUsername(author('alice', 'Alice G'), member('NickName'))).toBe('NickName')
  })

  it('falls back to author.global_name when nick is null', () => {
    expect(resolveUsername(author('alice', 'Alice G'), member(null))).toBe('Alice G')
  })

  it('falls back to author.username when global_name is also null', () => {
    expect(resolveUsername(author('alice', null), member(null))).toBe('alice')
  })

  it('falls back to author.username when no member provided', () => {
    expect(resolveUsername(author('alice', null), undefined)).toBe('alice')
  })

  it('falls back to author.global_name when no member provided but globalName is set', () => {
    expect(resolveUsername(author('alice', 'Alice G'), undefined)).toBe('Alice G')
  })
})

// ─── hasYouTubeLink ───────────────────────────────────────────────────────────

describe('hasYouTubeLink', () => {
  const VIDEO_ID = 'dQw4w9WgXcQ'

  it('returns true for youtube.com/watch?v=...', () => {
    expect(hasYouTubeLink(`https://www.youtube.com/watch?v=${VIDEO_ID}`)).toBe(true)
  })

  it('returns true for youtu.be/...', () => {
    expect(hasYouTubeLink(`https://youtu.be/${VIDEO_ID}`)).toBe(true)
  })

  it('returns true for youtube.com/shorts/...', () => {
    expect(hasYouTubeLink(`https://www.youtube.com/shorts/${VIDEO_ID}`)).toBe(true)
  })

  it('returns true for youtube.com/live/...', () => {
    expect(hasYouTubeLink(`https://www.youtube.com/live/${VIDEO_ID}`)).toBe(true)
  })

  it('returns true for youtube.com/embed/...', () => {
    expect(hasYouTubeLink(`https://www.youtube.com/embed/${VIDEO_ID}`)).toBe(true)
  })

  it('returns true for youtube.com/v/...', () => {
    expect(hasYouTubeLink(`https://www.youtube.com/v/${VIDEO_ID}`)).toBe(true)
  })

  it('returns true for www.youtube.com/watch?v=...', () => {
    expect(hasYouTubeLink(`https://www.youtube.com/watch?v=${VIDEO_ID}`)).toBe(true)
  })

  it('returns true for m.youtube.com/watch?v=...', () => {
    expect(hasYouTubeLink(`https://m.youtube.com/watch?v=${VIDEO_ID}`)).toBe(true)
  })

  it('returns true for URL with extra params (&t=14s)', () => {
    expect(hasYouTubeLink(`https://www.youtube.com/watch?v=${VIDEO_ID}&t=14s`)).toBe(true)
  })

  it('returns true for URL with extra params (&list=...)', () => {
    expect(
      hasYouTubeLink(`https://www.youtube.com/watch?v=${VIDEO_ID}&list=PLtest1234567`),
    ).toBe(true)
  })

  it('returns false for music.youtube.com/watch?v=...', () => {
    expect(hasYouTubeLink(`https://music.youtube.com/watch?v=${VIDEO_ID}`)).toBe(false)
  })

  it('returns false for random text with no YouTube link', () => {
    expect(hasYouTubeLink('check out this cool song!')).toBe(false)
  })

  it('returns false for undefined content', () => {
    expect(hasYouTubeLink(undefined)).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(hasYouTubeLink('')).toBe(false)
  })
})
