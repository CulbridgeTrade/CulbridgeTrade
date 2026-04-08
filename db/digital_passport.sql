
-- Digital Passport table for exporter identity
CREATE TABLE IF NOT EXISTS DigitalPassports (
  exporter_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  vlei_id TEXT,
  vlei_status TEXT,
  vlei_valid_from DATE,
  vlei_valid_to DATE,
  beneficial_owners JSON,
  verification_status TEXT DEFAULT 'PENDING',
  last_verified DATETIME DEFAULT CURRENT_TIMESTAMP,
  provenance_json JSON -- Raw API responses
);


