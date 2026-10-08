-- Migration: Create urls table for Cloudflare D1
-- D1 uses SQLite under the hood.
-- SQLite types: TEXT for text/timestamps, INTEGER for numbers/booleans.

CREATE TABLE IF NOT EXISTS urls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    original_url TEXT NOT NULL,
    clicks INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    active BOOLEAN NOT NULL DEFAULT 1
);

-- Index for fast lookup by code
CREATE INDEX IF NOT EXISTS idx_urls_code ON urls(code);
-- Index for querying active links
CREATE INDEX IF NOT EXISTS idx_urls_active ON urls(active);
