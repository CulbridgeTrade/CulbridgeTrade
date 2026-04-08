-- Lab Trust Layer PostgreSQL Schema - Groundnuts/Peanuts NL/DE MVP

CREATE TABLE IF NOT EXISTS groundnuts_peanuts_lab_trust (
  id SERIAL PRIMARY KEY,
  lab_id UUID NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('Tier 1', 'Tier 2', 'Tier 3')),
  accredited BOOLEAN NOT NULL,
  batch_verified BOOLEAN NOT NULL,
  historical_rasff_failures INTEGER DEFAULT 0,
  confidence_score NUMERIC(3,2) NOT NULL CHECK (confidence_score BETWEEN 0 AND 1),
  notes TEXT,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_groundnuts_lab_trust_lab_id ON groundnuts_peanuts_lab_trust(lab_id);
CREATE INDEX idx_groundnuts_lab_trust_tier ON groundnuts_peanuts_lab_trust(tier);


