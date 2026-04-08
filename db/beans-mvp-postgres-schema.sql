-- EU Beans MVP PostgreSQL Schema - NL/DE Production-Ready
-- Deterministic enforcement + behavioral + calibration

-- 1. Shipments
CREATE TABLE IF NOT EXISTS shipments (
  shipment_id UUID PRIMARY KEY,
  product_name VARCHAR(100) NOT NULL,
  origin_country CHAR(2) DEFAULT 'NG',
  destination_port VARCHAR(50) NOT NULL,
  exporter_id UUID NOT NULL,
  lab_id UUID NOT NULL,
  coa_json JSONB,
  documents_json JSONB,
  shipment_date TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. Lab Reports
CREATE TABLE IF NOT EXISTS lab_reports (
  lab_report_id UUID PRIMARY KEY,
  shipment_id UUID REFERENCES shipments(shipment_id) ON DELETE CASCADE,
  aflatoxin_total NUMERIC(6,3),
  aflatoxin_b1 NUMERIC(6,3),
  pesticides JSONB,
  Salmonella_present BOOLEAN,
  moisture NUMERIC(5,2),
  botanical_name VARCHAR(100),
  traceability_chain JSONB,
  certificate_of_origin BOOLEAN,
  phytosanitary_certificate BOOLEAN,
  lab_batch_number VARCHAR(50),
  immutable_snapshot JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 3. Rule Logs (Audit)
CREATE TABLE IF NOT EXISTS rule_logs (
  log_id SERIAL PRIMARY KEY,
  shipment_id UUID REFERENCES shipments(shipment_id),
  rule_id VARCHAR(50) NOT NULL,
  result VARCHAR(20) NOT NULL,
  reason TEXT,
  timestamp TIMESTAMP DEFAULT NOW(),
  immutable_snapshot JSONB
);

-- 4. Lab Trust
CREATE TABLE IF NOT EXISTS lab_trust (
  lab_id UUID PRIMARY KEY,
  tier SMALLINT NOT NULL,
  historical_failure_rate NUMERIC(4,2),
  last_update TIMESTAMP DEFAULT NOW()
);

-- 5. Exporter Reliability
CREATE TABLE IF NOT EXISTS exporter_reliability (
  exporter_id UUID PRIMARY KEY,
  total_shipments INTEGER DEFAULT 0,
  past_rejections INTEGER DEFAULT 0,
  score NUMERIC(4,2),
  last_update TIMESTAMP DEFAULT NOW()
);

-- 6. Behavioral Flags
CREATE TABLE IF NOT EXISTS behavioral_flags (
  shipment_id UUID PRIMARY KEY REFERENCES shipments(shipment_id),
  sudden_lab_switch BOOLEAN DEFAULT FALSE,
  recent_port_switch NUMERIC(3,2) DEFAULT 0,
  shipment_delay_pattern BOOLEAN DEFAULT FALSE,
  batch_reuse_flag BOOLEAN DEFAULT FALSE,
  last_update TIMESTAMP DEFAULT NOW()
);

-- 7. Shipment Features
CREATE TABLE IF NOT EXISTS shipment_features (
  shipment_id UUID PRIMARY KEY REFERENCES shipments(shipment_id),
  alert_velocity_7d NUMERIC(5,2),
  alert_velocity_30d NUMERIC(5,2),
  corridor_risk NUMERIC(5,2),
  port_risk NUMERIC(5,2),
  lab_score NUMERIC(5,2),
  exporter_score NUMERIC(5,2),
  behavioral_score NUMERIC(5,2),
  health_score NUMERIC(5,2),
  inspection_probability NUMERIC(5,2),
  decision VARCHAR(30),
  expected_loss NUMERIC(10,2),
  cheapest_fix VARCHAR(255),
  confidence NUMERIC(4,2),
  last_update TIMESTAMP DEFAULT NOW()
);

-- 8. RASFF Events
CREATE TABLE IF NOT EXISTS rasff_events (
  event_id UUID PRIMARY KEY,
  date TIMESTAMP NOT NULL,
  product_name VARCHAR(100) NOT NULL,
  origin_country CHAR(2) DEFAULT 'NG',
  hazard VARCHAR(50),
  action_taken VARCHAR(50),
  notifying_country VARCHAR(2),
  shipment_id UUID REFERENCES shipments(shipment_id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- 9. Calibration Buckets
CREATE TABLE IF NOT EXISTS calibration_buckets (
  bucket_id SERIAL PRIMARY KEY,
  risk_score_min NUMERIC(3,2) NOT NULL,
  risk_score_max NUMERIC(3,2) NOT NULL,
  historical_rejection_rate NUMERIC(4,2) NOT NULL,
  last_update TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_rule_logs_shipment ON rule_logs(shipment_id);
CREATE INDEX idx_shipment_features_shipment ON shipment_features(shipment_id);
CREATE INDEX idx_rasff_date ON rasff_events(date);

-- Sample Data
INSERT INTO calibration_buckets (risk_score_min, risk_score_max, historical_rejection_rate) VALUES
(0.0, 0.3, 0.05),
(0.3, 0.5, 0.25),
(0.5, 0.7, 0.55),
(0.7, 0.9, 0.75),
(0.9, 1.0, 0.95);


