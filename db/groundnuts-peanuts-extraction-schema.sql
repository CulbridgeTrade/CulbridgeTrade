-- Groundnuts/Peanuts Extraction Layer PostgreSQL Schema - NL/DE MVP

-- Shipments
CREATE TABLE IF NOT EXISTS shipments (
  shipment_id VARCHAR(50) PRIMARY KEY,
  shipment_batch_number VARCHAR(50) NOT NULL,
  port VARCHAR(10) NOT NULL,
  destination_country VARCHAR(2) NOT NULL,
  received_at TIMESTAMP DEFAULT NOW()
);

-- Lab Results
CREATE TABLE IF NOT EXISTS lab_results (
  id SERIAL PRIMARY KEY,
  shipment_id VARCHAR(50) REFERENCES shipments(shipment_id) ON DELETE CASCADE,
  lab_batch_number VARCHAR(50) NOT NULL,
  aflatoxin_b1 NUMERIC(6,3),
  aflatoxin_total NUMERIC(6,3),
  pesticides JSONB,
  Salmonella_present BOOLEAN,
  moisture NUMERIC(5,2),
  botanical_name VARCHAR(100),
  traceability_chain JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Certificates
CREATE TABLE IF NOT EXISTS certificates (
  id SERIAL PRIMARY KEY,
  shipment_id VARCHAR(50) REFERENCES shipments(shipment_id) ON DELETE CASCADE,
  certificate_of_origin VARCHAR(255),
  phytosanitary_certificate VARCHAR(255),
  health_certificate VARCHAR(255),
  uploaded_at TIMESTAMP DEFAULT NOW()
);

-- Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  shipment_id VARCHAR(50) REFERENCES shipments(shipment_id) ON DELETE CASCADE,
  rule_id VARCHAR(50),
  result VARCHAR(20),
  reason TEXT,
  immutable_snapshot JSONB,
  timestamp TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_lab_shipment ON lab_results(shipment_id);
CREATE INDEX idx_audit_shipment ON audit_logs(shipment_id);


