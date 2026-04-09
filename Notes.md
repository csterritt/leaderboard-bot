# Discord API - MESSAGE_CREATE Event Payload

## Complete Message Object Structure

| Field                    | Type                              | Description                                                          |
| ------------------------ | --------------------------------- | -------------------------------------------------------------------- |
| `id`                     | snowflake                         | Unique message ID                                                    |
| `channel_id`             | snowflake                         | ID of the channel the message was sent in                            |
| `guild_id`               | snowflake?                        | ID of the guild (if sent in a guild channel)                         |
| `author`                 | user object                       | The user who sent the message (webhook if `webhook_id` is present)   |
| `member`                 | guild member?                     | Guild member info (if sent in a guild)                               |
| `content`                | string                            | Message content (requires `MESSAGE_CONTENT` intent)                  |
| `timestamp`              | ISO8601                           | When the message was sent                                            |
| `edited_timestamp`       | ISO8601?                          | When the message was last edited (null if never)                     |
| `tts`                    | boolean                           | Whether this was a TTS message                                       |
| `mention_everyone`       | boolean                           | Whether @everyone was mentioned                                      |
| `mentions`               | array of user objects             | Users specifically mentioned in the message                          |
| `mention_roles`          | array of snowflakes               | Role IDs specifically mentioned                                      |
| `mention_channels`       | array of channel mention objects  | Channels specifically mentioned (for crosspost messages)             |
| `attachments`            | array of attachment objects       | Attached files                                                       |
| `embeds`                 | array of embed objects            | Embedded content (links, images, etc.)                               |
| `reactions`              | array of reaction objects         | Reactions to the message                                             |
| `nonce`                  | string or integer                 | Used for message validation/verification                             |
| `pinned`                 | boolean                           | Whether the message is pinned                                        |
| `webhook_id`             | snowflake?                        | If sent by a webhook, the webhook's ID                               |
| `type`                   | integer                           | Type of message (see Message Types below)                            |
| `activity`               | message activity?                 | Sent with Rich Presence-related chat embeds                          |
| `application`            | application?                      | Sent with Rich Presence-related chat embeds                          |
| `message_reference`      | message reference?                | Data showing the source of a reply/channel follow add/pin/nitro gift |
| `message_snapshots`      | array of message snapshot objects | Forwarded messages (if applicable)                                   |
| `flags`                  | integer                           | Message flags combined as a bitfield                                 |
| `referenced_message`     | message object?                   | The message associated with the `message_reference` (if loaded)      |
| `interaction`            | message interaction?              | (Deprecated) Sent if message is a response to an interaction         |
| `interaction_metadata`   | message interaction metadata?     | Sent if message is a response to an interaction                      |
| `thread`                 | channel?                          | The thread that was started from this message                        |
| `components`             | array of component objects        | Message components (buttons, select menus, etc.)                     |
| `sticker_items`          | array of sticker item objects     | Stickers sent with the message                                       |
| `stickers`               | array of sticker objects          | (Deprecated) Stickers sent with the message                          |
| `position`               | integer?                          | Approximate position of the message in a thread (for threads)        |
| `role_subscription_data` | role subscription data?           | Data about the role subscription purchase/renewal                    |
| `poll`                   | poll?                             | Poll data if a poll is attached to the message                       |
| `call`                   | message call?                     | Call data if message is a call invite                                |
| `resolved`               | resolved data?                    | Resolved data for messages with application commands                 |

### Message Types

| Type                                           | Value | Description                                  |
| ---------------------------------------------- | ----- | -------------------------------------------- |
| `DEFAULT`                                      | 0     | Default message                              |
| `RECIPIENT_ADD`                                | 1     | DM recipient added                           |
| `RECIPIENT_REMOVE`                             | 2     | DM recipient removed                         |
| `CALL`                                         | 3     | DM call                                      |
| `CHANNEL_NAME_CHANGE`                          | 4     | Channel name changed                         |
| `CHANNEL_ICON_CHANGE`                          | 5     | Channel icon changed                         |
| `CHANNEL_PINNED_MESSAGE`                       | 6     | Channel pinned message                       |
| `USER_JOIN`                                    | 7     | User joined guild                            |
| `GUILD_BOOST`                                  | 8     | Guild boosted                                |
| `GUILD_BOOST_TIER_1`                           | 9     | Guild reached boost tier 1                   |
| `GUILD_BOOST_TIER_2`                           | 10    | Guild reached boost tier 2                   |
| `GUILD_BOOST_TIER_3`                           | 11    | Guild reached boost tier 3                   |
| `CHANNEL_FOLLOW_ADD`                           | 12    | Channel follow added                         |
| `GUILD_DISCOVERY_DISQUALIFIED`                 | 14    | Guild discovery disqualified                 |
| `GUILD_DISCOVERY_REQUALIFIED`                  | 15    | Guild discovery requalified                  |
| `GUILD_DISCOVERY_GRACE_PERIOD_INITIAL_WARNING` | 16    | Guild discovery grace period initial warning |
| `GUILD_DISCOVERY_GRACE_PERIOD_FINAL_WARNING`   | 17    | Guild discovery grace period final warning   |
| `THREAD_CREATED`                               | 18    | Thread created                               |
| `REPLY`                                        | 19    | Reply to message                             |
| `CHAT_INPUT_COMMAND`                           | 20    | Chat input command                           |
| `THREAD_STARTER_MESSAGE`                       | 21    | Thread starter message                       |
| `GUILD_INVITE_REMINDER`                        | 22    | Guild invite reminder                        |
| `CONTEXT_MENU_COMMAND`                         | 23    | Context menu command                         |
| `AUTO_MODERATION_ACTION`                       | 24    | Auto-moderation action                       |
| `ROLE_SUBSCRIPTION_PURCHASE`                   | 25    | Role subscription purchase                   |
| `INTERACTION_PREMIUM_UPSELL`                   | 26    | Interaction premium upsell                   |
| `STAGE_START`                                  | 27    | Stage start                                  |
| `STAGE_END`                                    | 28    | Stage end                                    |
| `STAGE_SPEAKER`                                | 29    | Stage speaker                                |
| `STAGE_TOPIC`                                  | 31    | Stage topic change                           |
| `GUILD_APPLICATION_PREMIUM_SUBSCRIPTION`       | 32    | Guild application premium subscription       |
| `GUILD_INCIDENT_ALERT_MODE_ENABLED`            | 36    | Guild incident alert mode enabled            |
| `GUILD_INCIDENT_ALERT_MODE_DISABLED`           | 37    | Guild incident alert mode disabled           |
| `GUILD_INCIDENT_REPORT_RAID`                   | 38    | Guild incident report raid                   |
| `GUILD_INCIDENT_REPORT_FALSE_ALARM`            | 39    | Guild incident report false alarm            |
| `PURCHASE_NOTIFICATION`                        | 44    | Purchase notification                        |

### Message Flags

| Flag                                     | Value   | Description                                                 |
| ---------------------------------------- | ------- | ----------------------------------------------------------- |
| `CROSSPOSTED`                            | 1 << 0  | Message has been crossposted                                |
| `IS_CROSSPOST`                           | 1 << 1  | Message is a crosspost from another channel                 |
| `SUPPRESS_EMBEDS`                        | 1 << 2  | Message suppresses embeds                                   |
| `SOURCE_MESSAGE_DELETED`                 | 1 << 3  | Source message for this crosspost was deleted               |
| `URGENT`                                 | 1 << 4  | Message is urgent (pings on mobile)                         |
| `HAS_THREAD`                             | 1 << 5  | Message has an associated thread                            |
| `EPHEMERAL`                              | 1 << 6  | Message is ephemeral (only visible to user)                 |
| `LOADING`                                | 1 << 7  | Message is an interaction response showing "thinking" state |
| `FAILED_TO_MENTION_SOME_ROLES_IN_THREAD` | 1 << 8  | Message failed to mention some roles in thread              |
| `SUPPRESS_NOTIFICATIONS`                 | 1 << 12 | Message suppresses push/desktop notifications               |
| `IS_VOICE_MESSAGE`                       | 1 << 13 | Message is a voice message                                  |
| `HAS_SNAPSHOT`                           | 1 << 14 | Message has a snapshot (forwarded message)                  |
| `IS_COMPONENTS_V2`                       | 1 << 15 | Message is using components v2                              |

## User Information

The `author` field contains a **User Object**:

- `id` - Unique snowflake ID
- `username` - Username
- `global_name` - Display name (if set)
- `discriminator` - 4-digit tag (or "0" for new username system)
- `avatar` - Avatar hash (nullable)
- `bot` - Boolean (true if bot account)
- `system` - Boolean (true for system messages)
- `public_flags` - User badge flags (e.g., HypeSquad, Bug Hunter, etc.)
- `premium_type` - Nitro subscription level (0=None, 1=Nitro Classic, 2=Nitro)
- `banner`, `accent_color` - Profile customization

If posting in a guild, a `member` field also appears with:

- `nick` - Server nickname
- `roles` - Array of role IDs
- `joined_at` - When they joined the server
- `communication_disabled_until` - Timeout status
- `avatar` - Server-specific avatar

## Guild Roles Information

### The @everyone Role

**The `@everyone` role exists in every guild and serves as the base permission template.**

- **ID**: The `@everyone` role has the **same ID as the guild itself**
- **Position**: Always position 0 (bottom of hierarchy)
- **Purpose**:
  - Base permissions applied to all members
  - Default permissions for new members
  - Cannot be deleted

### Role Structure

| Field           | Type               | Description                                             |
| --------------- | ------------------ | ------------------------------------------------------- |
| `id`            | snowflake          | Unique role ID (matches guild ID for @everyone)         |
| `name`          | string             | Role name ("@everyone" for the default role)            |
| `color`         | integer            | Role color (0 = no color)                               |
| `colors`        | role colors object | Role gradient colors (if applicable)                    |
| `hoist`         | boolean            | Whether the role is displayed separately in member list |
| `icon`          | string?            | Role icon hash (nullable)                               |
| `unicode_emoji` | string?            | Role unicode emoji (nullable)                           |
| `position`      | integer            | Position in the role hierarchy (0 for @everyone)        |
| `permissions`   | string             | Permission bitset as a string                           |
| `managed`       | boolean            | Whether this role is managed by an integration          |
| `mentionable`   | boolean            | Whether this role can be mentioned by anyone            |
| `flags`         | integer            | Role flags combined as a bitfield                       |
| `tags`          | role tags object?  | Tags indicating the role's origin                       |

### Common Role Types in Guilds

| Role Type           | Description                                                  |
| ------------------- | ------------------------------------------------------------ |
| `@everyone`         | Base role present in all guilds, defines default permissions |
| `Nitro Booster`     | Automatically assigned to Nitro boosters (managed role)      |
| `Server Owner`      | The guild owner's highest role (implicit)                    |
| `Bot Roles`         | Managed roles created for bot integrations                   |
| `Integration Roles` | Managed roles for Twitch, YouTube, etc. integrations         |

### Role Flags

| Flag        | Value  | Description                                           |
| ----------- | ------ | ----------------------------------------------------- |
| `IN_PROMPT` | 1 << 0 | Role can be selected by members in onboarding prompts |

## Attachment Information

Each item in the `attachments` array contains:

| Field           | Description                                               |
| --------------- | --------------------------------------------------------- |
| `id`            | Snowflake ID (used to reference the attachment)           |
| `filename`      | Original filename with extension                          |
| `content_type`  | MIME type (e.g., `image/png`, `video/mp4`)                |
| `size`          | File size in bytes                                        |
| `url`           | Direct CDN URL to the file                                |
| `proxy_url`     | Proxied/resized version URL (for images/videos)           |
| `width`         | Width in pixels (images/videos only)                      |
| `height`        | Height in pixels (images/videos only)                     |
| `ephemeral`     | Boolean - true if attachment expires (ephemeral messages) |
| `duration_secs` | Duration for voice messages/audio files                   |
| `waveform`      | Base64-encoded waveform preview for voice messages        |
| `title`         | Optional title for the attachment                         |
| `description`   | Alt text/description                                      |
| `flags`         | Bitfield (e.g., `1 << 2` = IS_REMIX for media remix)      |

### Attachment Flags

| Flag       | Value  | Description                 |
| ---------- | ------ | --------------------------- |
| `IS_REMIX` | 1 << 2 | Attachment has been remixed |

### CDN URLs

- **Direct**: `https://cdn.discordapp.com/attachments/{channel_id}/{attachment_id}/{filename}`
- **Proxied**: `https://media.discordapp.net/attachments/{channel_id}/{attachment_id}/{filename}` (supports resizing via query params)

The `proxy_url` is particularly useful for images as Discord's media proxy can handle resizing via `?width=` and `?height=` query parameters.
