-- Lab Test Requests Table
CREATE TABLE IF NOT EXISTS lab_test_requests (
  request_id VARCHAR(50) PRIMARY KEY,
  shipment_id VARCHAR(36) NOT NULL,
  lab_id VARCHAR(50) NOT NULL,
  exporter_id VARCHAR(36) NOT NULL,
  commodity VARCHAR(100) NOT NULL,
  test_suite JSON NOT NULL,
  sample_quantity_required_grams INT DEFAULT 500,
  special_instructions TEXT,
  sample_collection_method VARCHAR(20),
  sample_collection_address TEXT,
  sample_due_at_lab_by DATE,
  results_required_by DATE,
  culbridge_reference_number VARCHAR(50) NOT NULL,
  eu_import_reference VARCHAR(50),
  status VARCHAR(30) NOT NULL DEFAULT 'CREATED',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  sample_received_at_lab TIMESTAMP,
  testing_started_at TIMESTAMP,
  result_expected_at TIMESTAMP,
  result_received_at TIMESTAMP
);

-- Enhanced Lab Test Results Table
CREATE TABLE IF NOT EXISTS lab_test_results (
  id VARCHAR(50) PRIMARY KEY,
  request_id VARCHAR(50),
  shipment_id VARCHAR(36) NOT NULL,
  lab_id VARCHAR(50) NOT NULL,
  mrl_results JSON,
  mycotoxin_results JSON,
  heavy_metal_results JSON,
  microbiological_results JSON,
  moisture_content_percent DECIMAL(5,2),
  overall_passed BOOLEAN NOT NULL,
  failed_parameters JSON,
  sample_id_at_lab VARCHAR(50),
  tested_by VARCHAR(100),
  reviewed_by VARCHAR(100),
  test_date DATE,
  result_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  certificate_number VARCHAR(100),
  raw_pdf_url VARCHAR(500),
  ingestion_method VARCHAR(20) DEFAULT 'MANUAL',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Certificate Vault Table
CREATE TABLE IF NOT EXISTS certificates (
  cert_id VARCHAR(50) PRIMARY KEY,
  shipment_id VARCHAR(36),
  exporter_id VARCHAR(36) NOT NULL,
  type VARCHAR(50) NOT NULL,
  document_url VARCHAR(500) NOT NULL,
  document_hash VARCHAR(64) NOT NULL,
  file_size_bytes INT,
  certificate_number VARCHAR(100),
  issuing_authority VARCHAR(255) NOT NULL,
  issued_to VARCHAR(255),
  issued_date DATE NOT NULL,
  valid_from DATE,
  valid_until DATE,
  validity_days INT,
  is_expired BOOLEAN DEFAULT FALSE,
  is_verified_by_culbridge BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMP,
  verified_by VARCHAR(36),
  verification_notes TEXT,
  is_shareable BOOLEAN DEFAULT FALSE,
  share_token VARCHAR(64),
  times_accessed INT DEFAULT 0,
  last_accessed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(36),
  can_be_deleted BOOLEAN DEFAULT FALSE
);

-- Certificate Share Tokens
CREATE TABLE IF NOT EXISTS cert_share_tokens (
  token VARCHAR(64) PRIMARY KEY,
  cert_id VARCHAR(50) NOT NULL,
  requested_by VARCHAR(36),
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (cert_id) REFERENCES certificates(cert_id)
);

-- Document Templates Table
CREATE TABLE IF NOT EXISTS document_templates (
  template_id VARCHAR(50) PRIMARY KEY,
  document_type VARCHAR(50) NOT NULL,
  destination_country VARCHAR(10),
  commodity VARCHAR(100),
  eu_regulation_basis VARCHAR(255),
  version VARCHAR(20) NOT NULL,
  last_updated DATE,
  sections JSON,
  mandatory_fields JSON,
  auto_populated_fields JSON,
  exporter_filled_fields JSON,
  output_format VARCHAR(20) DEFAULT 'PDF',
  template_file_url VARCHAR(500)
);

-- Generated Documents Table
CREATE TABLE IF NOT EXISTS generated_documents (
  document_id VARCHAR(50) PRIMARY KEY,
  shipment_id VARCHAR(36) NOT NULL,
  template_id VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL,
  missing_mandatory_fields JSON,
  document_url VARCHAR(500),
  generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (template_id) REFERENCES document_templates(template_id)
);

-- Document Validation Results Table
CREATE TABLE IF NOT EXISTS document_validation_results (
  id SERIAL PRIMARY KEY,
  shipment_id VARCHAR(36) NOT NULL,
  document_id VARCHAR(50),
  validation_rule_id VARCHAR(50),
  is_valid BOOLEAN NOT NULL,
  missing_fields JSON,
  failed_rules JSON,
  validated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Traceability Chain Table
CREATE TABLE IF NOT EXISTS traceability_chains (
  chain_id VARCHAR(50) PRIMARY KEY,
  shipment_id VARCHAR(36) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_complete BOOLEAN DEFAULT FALSE,
  chain_hash VARCHAR(64),
  FOREIGN KEY (shipment_id) REFERENCES shipments(id)
);

-- Traceability Stages Table
CREATE TABLE IF NOT EXISTS traceability_stages (
  stage_id VARCHAR(50) PRIMARY KEY,
  chain_id VARCHAR(50) NOT NULL,
  stage_type VARCHAR(50) NOT NULL,
  sequence_number INT NOT NULL,
  actor_id VARCHAR(36),
  actor_name VARCHAR(255),
  actor_type VARCHAR(20) NOT NULL,
  action_description TEXT,
  location VARCHAR(255),
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  confirmed_by VARCHAR(36),
  confirmed_at TIMESTAMP,
  confirmation_method VARCHAR(20),
  attached_documents JSON,
  notes TEXT,
  is_locked BOOLEAN DEFAULT FALSE,
  stage_hash VARCHAR(64),
  FOREIGN KEY (chain_id) REFERENCES traceability_chains(chain_id)
);

-- Pending Sign-offs Table
CREATE TABLE IF NOT EXISTS pending_sign_offs (
  id SERIAL PRIMARY KEY,
  shipment_id VARCHAR(36) NOT NULL,
  stage_type VARCHAR(50) NOT NULL,
  party_email VARCHAR(255),
  party_phone VARCHAR(20),
  otp_hash VARCHAR(64),
  token VARCHAR(64) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  status VARCHAR(20) DEFAULT 'PENDING',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  confirmed_at TIMESTAMP
);

-- Corrective Action Workflows Table
CREATE TABLE IF NOT EXISTS corrective_action_workflows (
  id SERIAL PRIMARY KEY,
  shipment_id VARCHAR(36) NOT NULL,
  failed_parameters JSON NOT NULL,
  recommended_actions JSON,
  severity VARCHAR(20),
  status VARCHAR(20) DEFAULT 'OPEN',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP
);

-- Indexes
CREATE INDEX idx_lab_requests_shipment ON lab_test_requests(shipment_id);
CREATE INDEX idx_lab_results_shipment ON lab_test_results(shipment_id);
CREATE INDEX idx_certificates_shipment ON certificates(shipment_id);
CREATE INDEX idx_certificates_expiry ON certificates(valid_until);
CREATE INDEX idx_cert_share_tokens_expiry ON cert_share_tokens(expires_at);
CREATE INDEX idx_traceability_shipment ON traceability_chains(shipment_id);
CREATE INDEX idx_traceability_stages_chain ON traceability_stages(chain_id);
CREATE INDEX idx_pending_sign_offs_token ON pending_sign_offs(token);
