-- Migration: Add dynamic corridor_mappings + monitoring tables
-- Run: sqlite3 culbridge.db < db/corridor-schema-updates.sql

-- 1. CorridorMapping table (exact spec)
CREATE TABLE IF NOT EXISTS corridor_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  originCountry TEXT NOT NULL,  -- e.g. 'NG'
  destinationCountry TEXT NOT NULL,  -- e.g. 'NL'
  productCategory TEXT NOT NULL,  -- e.g. 'sesame'
  requiredDocuments TEXT NOT NULL DEFAULT '[]',  -- JSON array
  mandatoryLabTests TEXT NOT NULL DEFAULT '[]',  -- JSON array
  thresholds TEXT DEFAULT '{}',  -- JSON {substance: limit}
  mrlLimits TEXT DEFAULT '{}',  -- JSON
  corridorVersion TEXT NOT NULL DEFAULT 'v1.0',
  validFrom DATE NOT NULL,
  validTo DATE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(originCountry, destinationCountry, productCategory)
);

CREATE INDEX idx_corridor_lookup ON corridor_mappings(originCountry, destinationCountry, productCategory);
CREATE INDEX idx_corridor_valid ON corridor_mappings(validFrom, validTo);

-- 2. Engine Metrics (monitoring)
CREATE TABLE IF NOT EXISTS engine_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  throughput INTEGER DEFAULT 0,  -- evals/min
  error_rate REAL DEFAULT 0,  -- failures/total
  blocker_count INTEGER DEFAULT 0,
  warning_count INTEGER DEFAULT 0,
  avg_score REAL DEFAULT 0
);

-- 3. External API Status
CREATE TABLE IF NOT EXISTS external_api_status (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service TEXT NOT NULL PRIMARY KEY,
  status TEXT DEFAULT 'healthy',  -- healthy|degraded|down
  last_ping DATETIME,
  consecutive_failures INTEGER DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert seed data from dynamic-mappings.json (all entries)
INSERT OR IGNORE INTO corridor_mappings (originCountry, destinationCountry, productCategory, requiredDocuments, mandatoryLabTests, thresholds, mrlLimits, corridorVersion, validFrom) VALUES
('NG', 'NL', 'sesame', '["phytosanitary","certificate_of_origin"]', '["ethylene_oxide","aflatoxin_b1","aflatoxin_total","salmonella"]', '{"ethylene_oxide":0.02,"aflatoxin_b1":2,"aflatoxin_total":4}', '{"ethylene_oxide":0.02,"aflatoxin_b1":2,"aflatoxin_total":4,"salmonella":0}', 'v1', '2024-01-01'),
('NG', 'DE', 'sesame', '["phytosanitary"]', '["ethylene_oxide","aflatoxin_b1","aflatoxin_total","salmonella"]', '{"ethylene_oxide":0.02,"aflatoxin_b1":2,"aflatoxin_total":8}', '{"ethylene_oxide":0.02,"aflatoxin_b1":2,"aflatoxin_total":8,"salmonella":0}', 'v1', '2024-01-01'),
('NG', 'NL', 'cocoa', '["phytosanitary","certificate_of_origin","nafdac_cert"]', '["aflatoxin_b1","cadmium","lead"]', '{"aflatoxin_b1":5,"cadmium":0.6,"lead":0.5}', '{"aflatoxin_b1":5,"cadmium":0.6,"lead":0.5}', 'v1', '2024-01-01'),
('NG', 'DE', 'cashew', '["phytosanitary"]', '["aflatoxin_b1","aflatoxin_total","salmonella"]', '{"aflatoxin_b1":2,"aflatoxin_total":10}', '{"aflatoxin_b1":2,"aflatoxin_total":10,"salmonella":0}', 'v1', '2024-01-01'),
('NG', 'NL', 'ginger', '["phytosanitary","certificate_of_origin"]', '["cadmium","lead","mercury"]', '{"cadmium":0.5,"lead":0.3,"mercury":0.1}', '{"cadmium":0.5,"lead":0.3,"mercury":0.1}', 'v1', '2024-05-01');

-- Seed API status
INSERT OR IGNORE INTO external_api_status (service, status) VALUES
('RASFF', 'healthy'),
('NAQS', 'healthy'),
('NSW', 'healthy'),
('Remita', 'healthy');

-- Verify seed (query example)
-- SELECT * FROM corridor_mappings WHERE originCountry='NG' AND destinationCountry='NL';

