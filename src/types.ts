import type BetterSqlite3 from 'better-sqlite3'

export type Database = BetterSqlite3.Database

export interface UserStats {
  readonly channelId: string
  readonly userId: string
  readonly username: string
  readonly lastMusicPostAt: number | null
  readonly runCount: number
  readonly highestRunSeen: number
}

export interface UpsertUserStatsInput {
  readonly channelId: string
  readonly userId: string
  readonly username: string
  readonly lastMusicPostAt: number
  readonly runCount: number
  readonly highestRunSeen: number
}

export interface LeaderboardRow {
  readonly username: string
  readonly runCount: number
  readonly highestRunSeen: number
}

export interface LeaderboardChannel {
  readonly channelId: string
  readonly guildId: string
  readonly channelName: string
  readonly addedByUserId: string
}

export interface LeaderboardPost {
  readonly channelId: string
  readonly messageId: string
  readonly contentHash: string
}

export interface MonitoredChannel {
  readonly channelId: string
  readonly guildId: string
  readonly leaderboardChannelId: string
}

export interface RecoveryState {
  readonly channelId: string
  readonly lastProcessedMessageId: string | null
}

export interface ProcessedMessage {
  readonly messageId: string
  readonly channelId: string
}

export interface DiscordUser {
  readonly id: string
  readonly username: string
  readonly global_name: string | null
  readonly bot?: boolean
}

export interface DiscordMember {
  readonly nick: string | null
  readonly permissions?: string
  readonly user?: { readonly id: string }
}

export interface DiscordAttachment {
  readonly id: string
  readonly filename?: string
  readonly content_type?: string
}

export interface NormalizedAttachment {
  readonly filename?: string
  readonly contentType?: string
}

export interface NormalizedAuthor {
  readonly id: string
  readonly username: string
  readonly globalName: string | null
  readonly isBot: boolean
}

export interface NormalizedMember {
  readonly nick: string | null
}

export interface NormalizedMessage {
  readonly id: string
  readonly channelId: string
  readonly guildId?: string
  readonly author: NormalizedAuthor
  readonly member?: NormalizedMember
  readonly timestamp: string
  readonly attachments: readonly NormalizedAttachment[]
  readonly type: number
}

export interface DiscordMessage {
  readonly id: string
  readonly channel_id: string
  readonly guild_id?: string
  readonly author: DiscordUser
  readonly member?: DiscordMember
  readonly timestamp: string
  readonly attachments: readonly DiscordAttachment[]
  readonly type: number
}

export interface DiscordInteraction {
  readonly id: string
  readonly type: number
  readonly guild_id?: string
  readonly channel_id: string
  readonly member?: DiscordMember
  readonly channel?: {
    readonly id: string
    readonly name: string
  }
  readonly data?: DiscordInteractionData
}

export interface DiscordInteractionData {
  readonly name: string
  readonly options?: readonly DiscordInteractionOption[]
}

export interface DiscordInteractionOption {
  readonly name: string
  readonly value: string | number | boolean
}

export type StreakDeltaKind = 'first' | 'noop' | 'increment' | 'reset'

export interface Env {
  readonly DISCORD_BOT_TOKEN: string
  readonly DISCORD_PUBLIC_KEY: string
  readonly DISCORD_APPLICATION_ID: string
  readonly DATABASE_PATH: string
}
