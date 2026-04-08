-- Groundnuts/Peanuts Lab Schema - EU NL/DE MVP
-- Arachis hypogaea hard blockers/penalties/trust

CREATE TABLE IF NOT EXISTS groundnuts_peanuts_labs (
  lab_id VARCHAR(50) PRIMARY KEY,
  name TEXT NOT NULL,
  tier SMALLINT CHECK (tier IN (1,2)),
  iso_17025 BOOLEAN DEFAULT FALSE,
  historical_failure_rate NUMERIC(4,2) DEFAULT 0.0,
  aflatoxin_compliance_rate NUMERIC(4,2) DEFAULT 1.0,
  pesticide_mrl_rate NUMERIC(4,2) DEFAULT 1.0,
  salmonella_clean_rate NUMERIC(4,2) DEFAULT 1.0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Sample Labs
INSERT OR IGNORE INTO groundnuts_peanuts_labs VALUES
('LAB-GN001', 'Lagos Peanuts Lab', 1, true, 0.02, 0.95, 0.98, 0.99),
('LAB-GN002', 'Abuja Groundnuts Lab', 1, true, 0.05, 0.92, 0.96, 0.97),
('LAB-GN003', 'Kano Peanuts Lab', 2, false, 0.12, 0.85, 0.90, 0.88);

CREATE INDEX idx_groundnuts_tier ON groundnuts_peanuts_labs(tier);

-- Lab Results Table
CREATE TABLE IF NOT EXISTS groundnuts_peanuts_lab_results (
  id SERIAL PRIMARY KEY,
  shipment_id VARCHAR(50),
  lab_id VARCHAR(50) REFERENCES groundnuts_peanuts_labs(lab_id),
  aflatoxin_b1 NUMERIC(6,3),
  aflatoxin_total NUMERIC(6,3),
  Salmonella_present BOOLEAN,
  moisture NUMERIC(5,2),
  botanical_name VARCHAR(100),
  pesticides JSONB,
  traceability_chain JSONB,
  certificate_of_origin VARCHAR(255),
  phytosanitary_certificate VARCHAR(255),
  health_certificate VARCHAR(255),
  lab_accreditation VARCHAR(50),
  metadata JSONB,
  historical_reliability_score NUMERIC(3,2),
  batch_consistency_score NUMERIC(3,2),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_groundnuts_results_shipment ON groundnuts_peanuts_lab_results(shipment_id);


