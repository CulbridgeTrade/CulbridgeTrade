-- RASFF Alerts Table
CREATE TABLE IF NOT EXISTS rasff_alerts (
  alert_id VARCHAR(50) PRIMARY KEY,
  rasff_reference VARCHAR(20) NOT NULL UNIQUE,
  raw_data JSON,
  severity VARCHAR(20) NOT NULL,
  culbridge_commodity VARCHAR(100),
  culbridge_commodity_code VARCHAR(20),
  hazard_type VARCHAR(30),
  specific_chemical VARCHAR(100),
  detected_level VARCHAR(100),
  eu_limit VARCHAR(50),
  breach_multiplier DECIMAL(5,2),
  applies_to_all_nigeria BOOLEAN DEFAULT TRUE,
  specific_origin_states JSON,
  specific_origin_zones JSON,
  alert_date DATE,
  is_active BOOLEAN DEFAULT TRUE,
  deactivated_at TIMESTAMP,
  deactivation_reason VARCHAR(255),
  affected_shipment_count INT DEFAULT 0,
  auto_halt_count INT DEFAULT 0,
  eu_regulation_reference VARCHAR(100),
  full_alert_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- RASFF Sync Logs
CREATE TABLE IF NOT EXISTS rasff_sync_logs (
  id SERIAL PRIMARY KEY,
  synced_at TIMESTAMP NOT NULL,
  new_alerts INT DEFAULT 0,
  updated_alerts INT DEFAULT 0,
  total_active_nigeria_alerts INT DEFAULT 0,
  status VARCHAR(20) DEFAULT 'COMPLETED',
  error_message TEXT
);

-- Commodity Risk Profiles
CREATE TABLE IF NOT EXISTS commodity_risk_profiles (
  id SERIAL PRIMARY KEY,
  commodity_code VARCHAR(20) UNIQUE NOT NULL,
  commodity_name VARCHAR(100) NOT NULL,
  hs_codes JSON,
  active_rasff_alerts INT DEFAULT 0,
  rasff_alerts_last_90_days INT DEFAULT 0,
  rasff_alerts_last_365_days INT DEFAULT 0,
  last_rasff_alert_date DATE,
  most_common_hazard VARCHAR(30),
  most_common_chemical VARCHAR(100),
  on_eu_enhanced_monitoring BOOLEAN DEFAULT FALSE,
  enhanced_monitoring_frequency INT DEFAULT 0,
  eu_regulation_reference VARCHAR(100),
  historical_rejection_rate_percent DECIMAL(5,2) DEFAULT 0,
  primary_rejection_reasons JSON,
  high_risk_origin_states JSON,
  current_risk_score INT DEFAULT 0,
  current_risk_level VARCHAR(20) DEFAULT 'UNKNOWN',
  risk_score_last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  risk_score_trend VARCHAR(20) DEFAULT 'STABLE',
  destination_risk_overrides JSON,
  mandatory_tests JSON,
  recommended_tests JSON,
  special_documentation_required JSON,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by VARCHAR(20) DEFAULT 'SYSTEM',
  notes TEXT
);

-- Shipment RASFF Gate Results
CREATE TABLE IF NOT EXISTS shipment_rasff_gate_results (
  id SERIAL PRIMARY KEY,
  shipment_id VARCHAR(36) NOT NULL,
  checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  commodity VARCHAR(100),
  destination_country VARCHAR(10),
  origin_state VARCHAR(50),
  gate_status VARCHAR(20) NOT NULL,
  can_proceed BOOLEAN NOT NULL,
  matched_alerts JSON,
  commodity_risk_level VARCHAR(20),
  commodity_risk_score INT,
  on_eu_enhanced_monitoring BOOLEAN DEFAULT FALSE,
  exporter_message TEXT,
  required_actions JSON,
  FOREIGN KEY (shipment_id) REFERENCES shipments(id)
);

-- EU Red Flag Reports
CREATE TABLE IF NOT EXISTS eu_red_flag_reports (
  report_id VARCHAR(50) PRIMARY KEY,
  shipment_id VARCHAR(36) NOT NULL,
  generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  valid_until TIMESTAMP,
  generated_for VARCHAR(255),
  overall_status VARCHAR(30) NOT NULL,
  overall_risk_score INT NOT NULL,
  overall_risk_level VARCHAR(20),
  rasff_section JSON,
  mrl_section JSON,
  lab_section JSON,
  documentation_section JSON,
  destination_section JSON,
  financial_section JSON,
  recommended_action TEXT,
  blocking_issues JSON,
  advisory_issues JSON,
  pdf_url VARCHAR(500),
  FOREIGN KEY (shipment_id) REFERENCES shipments(id)
);

-- Shipment Risk Scores
CREATE TABLE IF NOT EXISTS shipment_risk_scores (
  id SERIAL PRIMARY KEY,
  shipment_id VARCHAR(36) NOT NULL UNIQUE,
  calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  component_scores JSON NOT NULL,
  weighted_score INT NOT NULL,
  risk_level VARCHAR(20) NOT NULL,
  is_blocked BOOLEAN DEFAULT FALSE,
  blocking_reasons JSON,
  can_be_unblocked_by_exporter BOOLEAN DEFAULT TRUE,
  requires_culbridge_review BOOLEAN DEFAULT FALSE,
  score_version VARCHAR(20) DEFAULT '1.0',
  FOREIGN KEY (shipment_id) REFERENCES shipments(id)
);

-- Shipment Risk Score History
CREATE TABLE IF NOT EXISTS shipment_risk_score_history (
  id SERIAL PRIMARY KEY,
  shipment_id VARCHAR(36) NOT NULL,
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  weighted_score INT NOT NULL,
  risk_level VARCHAR(20) NOT NULL,
  score_change INT,
  FOREIGN KEY (shipment_id) REFERENCES shipments(id)
);

-- Financial Exposure Records
CREATE TABLE IF NOT EXISTS financial_exposure_records (
  id SERIAL PRIMARY KEY,
  shipment_id VARCHAR(36) NOT NULL,
  calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  currency VARCHAR(10) DEFAULT 'USD',
  commodity_value_usd DECIMAL(12,2),
  freight_cost_usd DECIMAL(10,2),
  insurance_premium_usd DECIMAL(10,2),
  port_handling_usd DECIMAL(10,2),
  inspection_fee_usd DECIMAL(10,2),
  total_committed_usd DECIMAL(12,2),
  rejection_scenario JSON,
  fx_component JSON,
  remediation_vs_loss JSON,
  buyer_relationship_impact TEXT,
  FOREIGN KEY (shipment_id) REFERENCES shipments(id)
);

-- Corrective Action Plans
CREATE TABLE IF NOT EXISTS corrective_action_plans (
  id SERIAL PRIMARY KEY,
  shipment_id VARCHAR(36) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  current_risk_score INT,
  projected_risk_score_after_actions INT,
  total_estimated_cost_usd DECIMAL(10,2),
  total_estimated_days INT,
  critical_path_action TEXT,
  FOREIGN KEY (shipment_id) REFERENCES shipments(id)
);

-- Corrective Actions
CREATE TABLE IF NOT EXISTS corrective_actions (
  id SERIAL PRIMARY KEY,
  plan_id INT NOT NULL,
  action_id VARCHAR(50) NOT NULL,
  sequence INT NOT NULL,
  priority VARCHAR(20) NOT NULL,
  category VARCHAR(30) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  specific_steps JSON,
  contact_name VARCHAR(100),
  contact_type VARCHAR(30),
  contact_details JSON,
  estimated_cost_usd DECIMAL(10,2),
  estimated_days_to_complete INT,
  fixes_risk_component VARCHAR(30),
  score_reduction_if_completed INT,
  status VARCHAR(20) DEFAULT 'PENDING',
  completed_at TIMESTAMP,
  evidence_url VARCHAR(500),
  FOREIGN KEY (plan_id) REFERENCES corrective_action_plans(id)
);

-- Exporter Compliance Scores
CREATE TABLE IF NOT EXISTS exporter_compliance_scores (
  id SERIAL PRIMARY KEY,
  exporter_id VARCHAR(36) NOT NULL UNIQUE,
  score_id VARCHAR(50) NOT NULL UNIQUE,
  calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  overall_score INT NOT NULL,
  compliance_grade VARCHAR(1) NOT NULL,
  components JSON,
  stats JSON,
  score_12_months_ago INT,
  score_6_months_ago INT,
  score_3_months_ago INT,
  trend VARCHAR(20) DEFAULT 'STABLE',
  trend_statement TEXT,
  shareable_summary JSON,
  share_token VARCHAR(64),
  share_url VARCHAR(255)
);

-- Exporter Score History
CREATE TABLE IF NOT EXISTS exporter_score_history (
  id SERIAL PRIMARY KEY,
  exporter_id VARCHAR(36) NOT NULL,
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  overall_score INT NOT NULL,
  compliance_grade VARCHAR(1) NOT NULL,
  FOREIGN KEY (exporter_id) REFERENCES exporters(id)
);

-- Exporter Share Tokens
CREATE TABLE IF NOT EXISTS exporter_share_tokens (
  token VARCHAR(64) PRIMARY KEY,
  exporter_id VARCHAR(36) NOT NULL,
  created_by VARCHAR(36),
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (exporter_id) REFERENCES exporters(id)
);

-- Indexes
CREATE INDEX idx_rasff_commodity ON rasff_alerts(culbridge_commodity);
CREATE INDEX idx_rasff_active ON rasff_alerts(is_active, alert_date);
CREATE INDEX idx_rasff_reference ON rasff_alerts(rasff_reference);
CREATE INDEX idx_commodity_risk_code ON commodity_risk_profiles(commodity_code);
CREATE INDEX idx_shipment_rasff_gate ON shipment_rasff_gate_results(shipment_id);
CREATE INDEX idx_shipment_risk_score ON shipment_risk_scores(shipment_id);
CREATE INDEX idx_financial_shipment ON financial_exposure_records(shipment_id);
CREATE INDEX idx_corrective_shipment ON corrective_action_plans(shipment_id);
CREATE INDEX idx_exporter_score ON exporter_compliance_scores(exporter_id);
CREATE INDEX idx_exporter_share_token ON exporter_share_tokens(token);
