-- Migration to PostgreSQL for Culbridge Production
-- NG → Rotterdam/Hamburg | sesame/cocoa/cashew/ginger

-- Core Tables
CREATE TABLE IF NOT EXISTS shipments (
    shipment_id VARCHAR(50) PRIMARY KEY,
    exporter_id VARCHAR(50) NOT NULL,
    lab_id VARCHAR(50) NOT NULL,
    product VARCHAR(50) NOT NULL,
    origin_country CHAR(2) NOT NULL DEFAULT 'NG',
    destination_port VARCHAR(50) NOT NULL CHECK (destination_port IN ('Rotterdam','Hamburg')),
    shipment_value_usd NUMERIC(12,2) NOT NULL,
    shipment_timestamp TIMESTAMP NOT NULL,
    coa_json JSONB NOT NULL,
    documents_json JSONB NOT NULL,
    ingestion_timestamp TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rasff_events (
    event_id VARCHAR(50) PRIMARY KEY,
    date_reported DATE NOT NULL,
    product VARCHAR(50) NOT NULL,
    origin_country CHAR(2) NOT NULL,
    destination_port VARCHAR(50) NOT NULL CHECK (destination_port IN ('Rotterdam','Hamburg')),
    hazard VARCHAR(50) NOT NULL,
    action_taken VARCHAR(50) NOT NULL CHECK (action_taken IN ('border_rejection','delayed','downgraded')),
    alert_source VARCHAR(50) DEFAULT 'RASFF',
    ingestion_timestamp TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS labs (
    lab_id VARCHAR(50) PRIMARY KEY,
    tier SMALLINT NOT NULL CHECK (tier IN (1,2)),
    accreditation BOOLEAN NOT NULL,
    historical_failure_rate NUMERIC(4,2) DEFAULT 0.0,
    last_used_timestamp TIMESTAMP
);

CREATE TABLE IF NOT EXISTS exporters (
    exporter_id VARCHAR(50) PRIMARY KEY,
    total_shipments INTEGER DEFAULT 0,
    total_rejections INTEGER DEFAULT 0,
    last_activity TIMESTAMP
);

CREATE TABLE IF NOT EXISTS shipment_decisions (
    shipment_id VARCHAR(50) PRIMARY KEY REFERENCES shipments(shipment_id),
    rule_status VARCHAR(10) NOT NULL CHECK(rule_status IN ('PASS','FAIL')),
    risk_score NUMERIC(4,2) NOT NULL,
    inspection_probability NUMERIC(4,2) NOT NULL,
    risk_class VARCHAR(15) NOT NULL CHECK(risk_class IN ('LOW','ELEVATED','HIGH','CRITICAL')),
    decision VARCHAR(15) NOT NULL CHECK(decision IN ('SHIP','HOLD','DO_NOT_SHIP')),
    expected_loss_usd NUMERIC(12,2),
    recommended_fix TEXT,
    confidence NUMERIC(4,2),
    explanations_json JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shipment_features (
    shipment_id VARCHAR(50) PRIMARY KEY REFERENCES shipments(shipment_id),
    alert_velocity_7d NUMERIC(5,2),
    alert_velocity_30d NUMERIC(5,2),
    corridor_risk NUMERIC(4,2),
    port_risk NUMERIC(4,2),
    lab_score NUMERIC(4,2),
    exporter_score NUMERIC(4,2),
    sudden_lab_switch BOOLEAN,
    port_switch_frequency NUMERIC(4,2),
    batch_reuse_flag BOOLEAN,
    timing_around_spike BOOLEAN,
    data_quality_penalty NUMERIC(4,2)
);

-- Indexes
CREATE INDEX idx_rasff_port_product ON rasff_events(destination_port, product);
CREATE INDEX idx_shipments_port_product ON shipments(destination_port, product);
CREATE INDEX idx_decisions_shipment ON shipment_decisions(shipment_id);
CREATE INDEX idx_features_shipment ON shipment_features(shipment_id);

-- Sample Data
INSERT INTO labs (lab_id, tier, accreditation, historical_failure_rate) VALUES
('LAGOS-ISO1', 1, true, 0.02),
('ABUJA-T2', 2, false, 0.15);

INSERT INTO exporters (exporter_id, total_shipments, total_rejections) VALUES
('EXP001', 25, 2),
('EXP002', 12, 4);


