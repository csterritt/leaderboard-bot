export const MUSIC_EXTENSIONS = ['.mp3', '.ogg', '.wav', '.flac', '.m4a', '.aac'] as const

export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'] as const

export const PDF_EXTENSION = '.pdf' as const

export const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.wmv', '.flv'] as const

export const VIDEO_CONTENT_TYPE_PREFIX = 'video/' as const

export const AUDIO_CONTENT_TYPE_PREFIX = 'audio/' as const

export const IMAGE_CONTENT_TYPE_PREFIX = 'image/' as const

export const PDF_CONTENT_TYPE = 'application/pdf' as const

export const YOUTUBE_URL_PATTERN =
  /(?:^|[\s(])(?:https?:\/\/)?(?:(?:www|m)\.)?(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:[^#]*&)*v=|shorts\/|live\/|embed\/|v\/))([A-Za-z0-9_-]{11})(?:[?&#\s]|$)/m

export const EIGHT_HOURS_SECS = 28_800
export const THIRTY_SIX_HOURS_SECS = 129_600
export const LEADERBOARD_MAX_ROWS = 50
export const ADMINISTRATOR_PERMISSION = 0x8n

export const ACCEPTED_MESSAGE_TYPES = [0, 19] as const // DEFAULT, REPLY

export const PRUNE_THRESHOLD_DAYS = 14

export const DISCORD_API_DELAY_MS = 1_100

export const SQLITE_TRANSIENT_ERROR_MESSAGES = ['SQLITE_BUSY', 'SQLITE_LOCKED'] as const

export const STANDARD_RETRY_OPTIONS = {
  retries: 3,
} as const
