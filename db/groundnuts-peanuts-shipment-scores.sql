-- Scoring & Status Engine PostgreSQL Schema - Groundnuts/Peanuts NL/DE
-- Deterministic health_score from rule logs

CREATE TABLE IF NOT EXISTS groundnuts_peanuts_shipment_scores (
  id SERIAL PRIMARY KEY,
  shipment_id VARCHAR(50) NOT NULL,
  health_score INTEGER NOT NULL CHECK (health_score BETWEEN 0 AND 100),
  status VARCHAR(20) NOT NULL CHECK (status IN ('BLOCKED', 'HIGH_RISK', 'SAFE')),
  applied_rules JSONB NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_groundnuts_scores_shipment ON groundnuts_peanuts_shipment_scores(shipment_id);
CREATE INDEX idx_groundnuts_scores_timestamp ON groundnuts_peanuts_shipment_scores(timestamp);


