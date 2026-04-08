-- Regulatory Intelligence Schema

CREATE TABLE IF NOT EXISTS regulatory_sources (
  source_id VARCHAR(50) PRIMARY KEY,
  source_name VARCHAR(255) NOT NULL,
  source_type VARCHAR(50) NOT NULL,
  jurisdiction VARCHAR(20) NOT NULL,
  authority VARCHAR(255) NOT NULL,
  base_url VARCHAR(500),
  ingestion_method VARCHAR(30) NOT NULL,
  ingestion_frequency VARCHAR(50),
  last_successful_sync TIMESTAMP,
  covers_topics JSON,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS regulatory_source_sync_logs (
  id SERIAL PRIMARY KEY,
  source_id VARCHAR(50) NOT NULL,
  synced_at TIMESTAMP NOT NULL,
  items_fetched INT DEFAULT 0,
  new_changes_detected INT DEFAULT 0,
  updated_changes INT DEFAULT 0,
  status VARCHAR(20) DEFAULT 'COMPLETED',
  error_message TEXT,
  FOREIGN KEY (source_id) REFERENCES regulatory_sources(source_id)
);

CREATE TABLE IF NOT EXISTS regulatory_changes (
  change_id VARCHAR(50) PRIMARY KEY,
  source_id VARCHAR(50),
  detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  change_type VARCHAR(30) NOT NULL,
  title VARCHAR(500) NOT NULL,
  raw_description TEXT,
  plain_english_summary TEXT,
  eu_regulation_number VARCHAR(50),
  effective_date DATE,
  implementation_deadline DATE,
  affects_commodities JSON,
  affects_chemicals JSON,
  affects_countries_of_origin JSON,
  affects_destination_markets JSON,
  affects_all_nigeria BOOLEAN DEFAULT TRUE,
  severity VARCHAR(20) NOT NULL,
  severity_reason TEXT,
  is_urgent BOOLEAN DEFAULT FALSE,
  days_until_effective INT,
  mrl_changes JSON,
  estimated_affected_exporters INT DEFAULT 0,
  estimated_affected_active_shipments INT DEFAULT 0,
  is_confirmed BOOLEAN DEFAULT FALSE,
  confirmed_by VARCHAR(36),
  confirmed_at TIMESTAMP,
  is_actioned BOOLEAN DEFAULT FALSE,
  source_url VARCHAR(500),
  FOREIGN KEY (source_id) REFERENCES regulatory_sources(source_id)
);

CREATE TABLE IF NOT EXISTS exporter_impact_assessments (
  id SERIAL PRIMARY KEY,
  change_id VARCHAR(50) NOT NULL,
  assessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  total_affected_exporters INT DEFAULT 0,
  FOREIGN KEY (change_id) REFERENCES regulatory_changes(change_id)
);

CREATE TABLE IF NOT EXISTS exporter_impacts (
  id SERIAL PRIMARY KEY,
  change_id VARCHAR(50) NOT NULL,
  exporter_id VARCHAR(36) NOT NULL,
  affected_because JSON,
  impact_level VARCHAR(20),
  affected_commodities JSON,
  active_shipments_at_risk JSON,
  days_until_change_effective INT,
  is_urgent BOOLEAN DEFAULT FALSE,
  required_actions JSON,
  deadline DATE,
  FOREIGN KEY (change_id) REFERENCES regulatory_changes(change_id)
);

CREATE TABLE IF NOT EXISTS regulatory_alerts (
  alert_id VARCHAR(50) PRIMARY KEY,
  change_id VARCHAR(50) NOT NULL,
  exporter_id VARCHAR(36) NOT NULL,
  generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  headline VARCHAR(500) NOT NULL,
  what_changed TEXT,
  what_you_must_do JSON,
  deadline DATE,
  consequence_if_ignored TEXT,
  severity VARCHAR(20) NOT NULL,
  source_url VARCHAR(500),
  delivered_at TIMESTAMP,
  opened_at TIMESTAMP,
  acknowledged_at TIMESTAMP,
  FOREIGN KEY (change_id) REFERENCES regulatory_changes(change_id)
);

CREATE TABLE IF NOT EXISTS regulatory_alert_delivery_log (
  id SERIAL PRIMARY KEY,
  alert_id VARCHAR(50) NOT NULL,
  channel VARCHAR(20) NOT NULL,
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  success BOOLEAN DEFAULT TRUE,
  error_message TEXT,
  FOREIGN KEY (alert_id) REFERENCES regulatory_alerts(alert_id)
);

CREATE TABLE IF NOT EXISTS regulatory_gap_index (
  gap_id VARCHAR(50) PRIMARY KEY,
  commodity VARCHAR(100) NOT NULL,
  dimension VARCHAR(50) NOT NULL,
  nigerian_standard TEXT NOT NULL,
  eu_standard TEXT NOT NULL,
  gap_description TEXT NOT NULL,
  gap_severity VARCHAR(20) NOT NULL,
  mrl_gap JSON,
  practical_impact TEXT,
  historical_rejection_contribution DECIMAL(5,2),
  gap_closure_action TEXT,
  gap_closure_difficulty VARCHAR(20),
  gap_closure_cost_estimate_usd VARCHAR(50),
  is_active BOOLEAN DEFAULT TRUE,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  eu_regulation_reference VARCHAR(100),
  nigeria_regulation_reference VARCHAR(100)
);

-- Buyer Trust Layer Schema

CREATE TABLE IF NOT EXISTS exporter_compliance_profiles (
  profile_id VARCHAR(50) PRIMARY KEY,
  exporter_id VARCHAR(36) NOT NULL UNIQUE,
  generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  profile_version VARCHAR(20) DEFAULT '1.0',
  company_name VARCHAR(255) NOT NULL,
  registration_country VARCHAR(20) DEFAULT 'Nigeria',
  nepc_registration_number VARCHAR(50),
  cac_registration_number VARCHAR(50),
  primary_contact_name VARCHAR(255),
  primary_contact_email VARCHAR(255),
  years_in_export INT,
  culbridge_member_since DATE,
  compliance_grade VARCHAR(1) NOT NULL,
  compliance_score INT NOT NULL,
  compliance_score_trend VARCHAR(20) DEFAULT 'STABLE',
  score_12_months_ago INT,
  score_6_months_ago INT,
  score_current INT,
  shipment_stats JSON,
  lab_record JSON,
  documentation_record JSON,
  active_certifications JSON,
  culbridge_verified BOOLEAN DEFAULT FALSE,
  culbridge_verified_since DATE,
  verification_level VARCHAR(20) DEFAULT 'BASIC',
  share_token VARCHAR(64),
  share_url VARCHAR(255),
  share_url_expires_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS buyer_relationships (
  relationship_id VARCHAR(50) PRIMARY KEY,
  exporter_id VARCHAR(36) NOT NULL,
  buyer_id VARCHAR(36),
  buyer_company_name VARCHAR(255) NOT NULL,
  buyer_country VARCHAR(10) NOT NULL,
  buyer_contact_email VARCHAR(255) NOT NULL,
  access_token VARCHAR(64) NOT NULL UNIQUE,
  access_url VARCHAR(255),
  access_level VARCHAR(30) NOT NULL,
  granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  granted_by VARCHAR(36),
  last_accessed_at TIMESTAMP,
  access_count INT DEFAULT 0,
  visible_data JSON,
  relationship_status VARCHAR(20) DEFAULT 'ACTIVE',
  FOREIGN KEY (exporter_id) REFERENCES exporters(id)
);

CREATE TABLE IF NOT EXISTS buyer_access_logs (
  id SERIAL PRIMARY KEY,
  relationship_id VARCHAR(50) NOT NULL,
  accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ip_address VARCHAR(45),
  user_agent VARCHAR(500),
  FOREIGN KEY (relationship_id) REFERENCES buyer_relationships(relationship_id)
);

CREATE TABLE IF NOT EXISTS linked_shipments (
  id SERIAL PRIMARY KEY,
  relationship_id VARCHAR(50) NOT NULL,
  shipment_id VARCHAR(36) NOT NULL,
  exporter_shared_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  buyer_commodity VARCHAR(100),
  buyer_purchase_order VARCHAR(50),
  compliance_status VARCHAR(30),
  lab_status VARCHAR(20),
  documentation_status VARCHAR(20),
  estimated_arrival DATE,
  rasff_status VARCHAR(20),
  FOREIGN KEY (relationship_id) REFERENCES buyer_relationships(relationship_id),
  FOREIGN KEY (shipment_id) REFERENCES shipments(id)
);

CREATE TABLE IF NOT EXISTS profile_share_tokens (
  token VARCHAR(64) PRIMARY KEY,
  exporter_id VARCHAR(36) NOT NULL,
  created_by VARCHAR(36),
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (exporter_id) REFERENCES exporters(id)
);

-- Agency Integration Schema

CREATE TABLE IF NOT EXISTS nepc_certificates (
  cert_id VARCHAR(50) PRIMARY KEY,
  shipment_id VARCHAR(36) NOT NULL,
  nepc_reference_number VARCHAR(50),
  application_status VARCHAR(30) NOT NULL DEFAULT 'NOT_STARTED',
  commodity VARCHAR(100),
  hs_code VARCHAR(20),
  quantity_kg DECIMAL(12,2),
  fob_value_usd DECIMAL(12,2),
  destination_country VARCHAR(10),
  vessel_name VARCHAR(100),
  bill_of_lading VARCHAR(50),
  application_submitted_at TIMESTAMP,
  expected_issuance_date DATE,
  actual_issuance_date TIMESTAMP,
  certificate_expiry_date DATE,
  certificate_url VARCHAR(500),
  is_in_vault BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shipment_id) REFERENCES shipments(id)
);

CREATE TABLE IF NOT EXISTS nafdac_products (
  product_id VARCHAR(50) PRIMARY KEY,
  exporter_id VARCHAR(36) NOT NULL,
  nafdac_registration_number VARCHAR(50) NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  product_category VARCHAR(100),
  registration_status VARCHAR(20) DEFAULT 'ACTIVE',
  registration_date DATE,
  expiry_date DATE,
  is_culbridge_verified BOOLEAN DEFAULT FALSE,
  verification_method VARCHAR(30) DEFAULT 'UNVERIFIED',
  last_verified_at TIMESTAMP,
  FOREIGN KEY (exporter_id) REFERENCES exporters(id)
);

CREATE TABLE IF NOT EXISTS nafdac_verification_log (
  id SERIAL PRIMARY KEY,
  registration_number VARCHAR(50) NOT NULL,
  verified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_valid BOOLEAN,
  status VARCHAR(20),
  product_name VARCHAR(255),
  registrant_name VARCHAR(255),
  source VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS naqs_inspection_requests (
  request_id VARCHAR(50) PRIMARY KEY,
  shipment_id VARCHAR(36) NOT NULL,
  exporter_id VARCHAR(36) NOT NULL,
  commodity VARCHAR(100) NOT NULL,
  quantity_kg DECIMAL(12,2),
  inspection_type VARCHAR(30) DEFAULT 'PRE_EXPORT',
  inspection_address VARCHAR(500),
  state VARCHAR(50) NOT NULL,
  naqs_zone VARCHAR(50) NOT NULL,
  requested_date DATE,
  requested_time_window VARCHAR(20),
  alternative_date DATE,
  status VARCHAR(30) NOT NULL DEFAULT 'SUBMITTED',
  naqs_reference_number VARCHAR(50),
  assigned_inspector VARCHAR(255),
  confirmed_inspection_date DATE,
  confirmed_inspection_time VARCHAR(20),
  inspection_result VARCHAR(20),
  phyto_certificate_number VARCHAR(50),
  phyto_certificate_url VARCHAR(500),
  inspector_comments TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reminder_sent_at TIMESTAMP,
  deadline DATE,
  is_overdue BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (shipment_id) REFERENCES shipments(id),
  FOREIGN KEY (exporter_id) REFERENCES exporters(id)
);

CREATE TABLE IF NOT EXISTS certification_tasks (
  task_id VARCHAR(50) PRIMARY KEY,
  shipment_id VARCHAR(36) NOT NULL,
  agency VARCHAR(20) NOT NULL,
  task_name VARCHAR(100) NOT NULL,
  status VARCHAR(30) NOT NULL,
  due_date DATE,
  days_remaining INT,
  is_overdue BOOLEAN DEFAULT FALSE,
  is_on_critical_path BOOLEAN DEFAULT FALSE,
  estimated_completion_days INT,
  will_miss_deadline BOOLEAN DEFAULT FALSE,
  action_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shipment_id) REFERENCES shipments(id)
);

CREATE TABLE IF NOT EXISTS certification_timelines (
  id SERIAL PRIMARY KEY,
  shipment_id VARCHAR(36) NOT NULL UNIQUE,
  loading_deadline DATE,
  days_until_loading INT,
  certification_tasks JSON,
  overall_status VARCHAR(20) NOT NULL,
  critical_path_item VARCHAR(100),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shipment_id) REFERENCES shipments(id)
);

-- Indexes
CREATE INDEX idx_regulatory_changes_commodity ON regulatory_changes((affects_commodities->'$'));
CREATE INDEX idx_regulatory_changes_effective ON regulatory_changes(effective_date);
CREATE INDEX idx_regulatory_changes_severity ON regulatory_changes(severity);
CREATE INDEX idx_regulatory_gap_commodity ON regulatory_gap_index(commodity);
CREATE INDEX idx_regulatory_gap_severity ON regulatory_gap_index(gap_severity);
CREATE INDEX idx_exporter_impacts_exporter ON exporter_impacts(exporter_id);
CREATE INDEX idx_exporter_impacts_change ON exporter_impacts(change_id);
CREATE INDEX idx_regulatory_alerts_exporter ON regulatory_alerts(exporter_id);
CREATE INDEX idx_nepc_shipment ON nepc_certificates(shipment_id);
CREATE INDEX idx_naqs_shipment ON naqs_inspection_requests(shipment_id);
CREATE INDEX idx_naqs_status ON naqs_inspection_requests(status);
CREATE INDEX idx_buyer_relationships_token ON buyer_relationships(access_token);
CREATE INDEX idx_buyer_relationships_exporter ON buyer_relationships(exporter_id);
