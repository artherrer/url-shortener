-- Migration: Create url_analytics table
CREATE TABLE IF NOT EXISTS url_analytics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL,
    user_agent TEXT,
    visited_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_analytics_code ON url_analytics(code);
CREATE INDEX IF NOT EXISTS idx_analytics_visited_at ON url_analytics(visited_at);
