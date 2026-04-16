PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS user_stats (
    channel_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    last_music_post_at INTEGER,
    run_count INTEGER NOT NULL DEFAULT 0,
    highest_run_seen INTEGER NOT NULL DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (channel_id, user_id)
);

CREATE TABLE IF NOT EXISTS leaderboard_channels (
    channel_id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    channel_name TEXT NOT NULL,
    added_by_user_id TEXT NOT NULL,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS leaderboard_posts (
    channel_id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    posted_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS recovery_state (
    channel_id TEXT PRIMARY KEY,
    last_processed_message_id TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS monitored_channels (
    channel_id TEXT NOT NULL,
    guild_id TEXT NOT NULL,
    leaderboard_channel_id TEXT NOT NULL
        REFERENCES leaderboard_channels(channel_id) ON DELETE CASCADE,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (channel_id, leaderboard_channel_id)
);

CREATE TABLE IF NOT EXISTS processed_messages (
    message_id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_processed_messages_processed_at
    ON processed_messages(processed_at);
