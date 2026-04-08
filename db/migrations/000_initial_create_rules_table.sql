-- Migration: create_rules_table
-- Created: 2026-04-08T22:33:34.763Z


-- UP
CREATE TABLE IF NOT EXISTS rules (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  product_category TEXT,
  corridor TEXT,
  condition TEXT,
  effect_type TEXT,
  message TEXT,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- DOWN
DROP TABLE IF EXISTS rules;
