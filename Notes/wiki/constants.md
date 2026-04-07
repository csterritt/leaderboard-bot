# Constants

**File**: `src/constants.ts`

| Constant | Value | Purpose |
|---|---|---|
| `MUSIC_EXTENSIONS` | `['.mp3', '.ogg', '.wav', '.flac', '.m4a', '.aac']` | Accepted audio file extensions |
| `AUDIO_CONTENT_TYPE_PREFIX` | `'audio/'` | Fallback MIME type check when filename absent |
| `EIGHT_HOURS_SECS` | `28_800` | Upper bound for "noop" streak delta |
| `THIRTY_SIX_HOURS_SECS` | `129_600` | Upper bound for "increment" streak delta |
| `LEADERBOARD_MAX_ROWS` | `50` | Max rows returned in leaderboard query |
| `ADMINISTRATOR_PERMISSION` | `0x8n` | Discord ADMINISTRATOR permission bit (BigInt) |
| `ACCEPTED_MESSAGE_TYPES` | `[0, 19]` | DEFAULT and REPLY message types only |
| `PRUNE_THRESHOLD_DAYS` | `14` | Age threshold for pruning `processed_messages` |
| `DISCORD_API_DELAY_MS` | `1_100` | Minimum delay between Discord API requests |
| `SQLITE_TRANSIENT_ERROR_MESSAGES` | `['SQLITE_BUSY', 'SQLITE_LOCKED']` | Retry triggers for `withRetry` |
| `STANDARD_RETRY_OPTIONS` | `{ retries: 3 }` | Retry count for `withRetry` |

## Cross-references

- [util-db-helpers.md](util-db-helpers.md) — uses `STANDARD_RETRY_OPTIONS`, `SQLITE_TRANSIENT_ERROR_MESSAGES`
- [util-time.md](util-time.md) — uses `EIGHT_HOURS_SECS`, `THIRTY_SIX_HOURS_SECS`
- [util-permissions.md](util-permissions.md) — uses `ADMINISTRATOR_PERMISSION`
