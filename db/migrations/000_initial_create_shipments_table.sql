-- Migration: create_shipments_table
-- Created: 2026-04-08T22:33:34.730Z


-- UP
CREATE TABLE IF NOT EXISTS shipments (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  product_name TEXT,
  hs_code TEXT,
  origin_country TEXT,
  destination_country TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- DOWN
DROP TABLE IF EXISTS shipments;
