-- Full PostgreSQL Schema - Groundnuts/Peanuts NL/DE MVP

-- Shipments
CREATE TABLE IF NOT EXISTS groundnuts_peanuts_shipments (
  id VARCHAR(50) PRIMARY KEY,
  exporter_id VARCHAR(50),
  batch_number VARCHAR(50),
  destination VARCHAR(10),
  lab_batch_number VARCHAR(50),
  botanical_name VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Labs Trust
CREATE TABLE IF NOT EXISTS groundnuts_peanuts_labs (
  lab_id VARCHAR(50) PRIMARY KEY,
  name TEXT,
  tier VARCHAR(10) CHECK (tier IN ('Tier1', 'Tier2')),
  accredited BOOLEAN,
  rasff_failures INT DEFAULT 0,
  confidence_score NUMERIC(3,2) DEFAULT 0.5 CHECK (confidence_score BETWEEN 0 AND 1)
);

-- Lab Results
CREATE TABLE IF NOT EXISTS groundnuts_peanuts_lab_results (
  id SERIAL PRIMARY KEY,
  shipment_id VARCHAR(50) REFERENCES groundnuts_peanuts_shipments(id),
  lab_id VARCHAR(50) REFERENCES groundnuts_peanuts_labs(lab_id),
  aflatoxin_total NUMERIC(6,3),
  salmonella_present BOOLEAN,
  moisture NUMERIC(5,2),
  traceability_chain JSONB,
  cert_origin VARCHAR(255),
  cert_phyto VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Rule Logs
CREATE TABLE IF NOT EXISTS groundnuts_peanuts_rule_logs (
  id SERIAL PRIMARY KEY,
  shipment_id VARCHAR(50),
  rule_id VARCHAR(50),
  result VARCHAR(20),
  reason TEXT,
  snapshot JSONB,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Shipment Scores
CREATE TABLE IF NOT EXISTS groundnuts_peanuts_shipment_scores (
  id SERIAL PRIMARY KEY,
  shipment_id VARCHAR(50),
  health_score INT CHECK (health_score BETWEEN 0 AND 100),
  status VARCHAR(20) CHECK (status IN ('BLOCKED', 'HIGH_RISK', 'SAFE')),
  applied_rules JSONB,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX CONCURRENTLY idx_gn_shipment ON groundnuts_peanuts_shipments(id);
CREATE INDEX CONCURRENTLY idx_gn_lab ON groundnuts_peanuts_labs(lab_id);
CREATE INDEX CONCURRENTLY idx_gn_results_ship ON groundnuts_peanuts_lab_results(shipment_id);
CREATE INDEX CONCURRENTLY idx_gn_logs_ship ON groundnuts_peanuts_rule_logs(shipment_id);
CREATE INDEX CONCURRENTLY idx_gn_scores_ship ON groundnuts_peanuts_shipment_scores(shipment_id);


