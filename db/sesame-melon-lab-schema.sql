-- Seeds Lab Schema PostgreSQL - Sesame & Melon NL/DE

CREATE TABLE IF NOT EXISTS sesame_melon_labs (
  lab_id VARCHAR(50) PRIMARY KEY,
  name TEXT NOT NULL,
  tier VARCHAR(10) CHECK (tier IN ('Tier1', 'Tier2')),
  accredited BOOLEAN DEFAULT FALSE,
  rasff_failures INT DEFAULT 0,
  confidence_score NUMERIC(3,2) DEFAULT 0.5 CHECK (confidence_score BETWEEN 0 AND 1),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sesame_melon_lab_results (
  id SERIAL PRIMARY KEY,
  shipment_id VARCHAR(50),
  lab_id VARCHAR(50) REFERENCES sesame_melon_labs(lab_id),
  aflatoxin_b1 NUMERIC(6,3),
  aflatoxin_total NUMERIC(6,3),
  salmonella_present BOOLEAN,
  moisture NUMERIC(5,2),
  botanical_name VARCHAR(100),
  pesticides JSONB,
  traceability_chain JSONB,
  cert_origin VARCHAR(255),
  cert_phyto VARCHAR(255),
  lab_accredited BOOLEAN,
  metadata JSONB,
  historical_reliability NUMERIC(3,2),
  batch_consistency NUMERIC(3,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sesame_results_ship ON sesame_melon_lab_results(shipment_id);

-- Sample Data
INSERT OR IGNORE INTO sesame_melon_labs VALUES
('LAB-SM001', 'Rotterdam Seeds Lab', 'Tier1', true, 0, 0.95),
('LAB-SM002', 'Hamburg Seeds Lab', 'Tier1', true, 1, 0.90);


