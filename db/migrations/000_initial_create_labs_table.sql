-- Migration: create_labs_table
-- Created: 2026-04-08T22:33:34.762Z


-- UP
CREATE TABLE IF NOT EXISTS labs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  country TEXT,
  accreditation TEXT,
  verified INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- DOWN
DROP TABLE IF EXISTS labs;
