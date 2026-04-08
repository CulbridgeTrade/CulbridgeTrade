-- EU MRL Database Schema
-- Ingested quarterly from EUR-Lex / EU Pesticides Database
CREATE TABLE IF NOT EXISTS eu_mrl_database (
  id SERIAL PRIMARY KEY,
  active_ingredient VARCHAR(100) NOT NULL,
  commodity VARCHAR(255) NOT NULL,
  commodity_code VARCHAR(20) NOT NULL,
  mrl_value DECIMAL(10,4) NOT NULL,
  mrl_unit VARCHAR(10) DEFAULT 'mg/kg',
  legal_basis VARCHAR(100),
  effective_date DATE NOT NULL,
  notes TEXT,
  is_default_mrl BOOLEAN DEFAULT FALSE,
  version VARCHAR(20) NOT NULL,
  imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(active_ingredient, commodity, version)
);

-- Pesticide Commodity Risk Matrix
-- Curated reference table combining EU MRL, Nigerian usage patterns, RASFF alerts
CREATE TABLE IF NOT EXISTS pesticide_commodity_risk_matrix (
  id SERIAL PRIMARY KEY,
  active_ingredient VARCHAR(100) NOT NULL,
  commodity VARCHAR(255) NOT NULL,
  nigerian_usage_frequency VARCHAR(20) DEFAULT 'Unknown',
  eu_mrl_mg_kg DECIMAL(10,4),
  is_banned_in_eu BOOLEAN DEFAULT FALSE,
  is_default_mrl BOOLEAN DEFAULT FALSE,
  typical_application_rate_nigeria DECIMAL(10,2),
  typical_phi_days INT,
  baseline_risk VARCHAR(20) DEFAULT 'Unknown',
  historical_rasff_alerts INT DEFAULT 0,
  notes TEXT,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(active_ingredient, commodity)
);

-- Pesticide Half-Life Reference Table
-- For residue decay estimation model
CREATE TABLE IF NOT EXISTS pesticide_half_life (
  id SERIAL PRIMARY KEY,
  active_ingredient VARCHAR(100) UNIQUE NOT NULL,
  half_life_days DECIMAL(6,2) NOT NULL,
  degradation_model VARCHAR(50) DEFAULT 'first_order',
  source VARCHAR(255),
  last_verified DATE
);

-- Shipment MRL Assessments
CREATE TABLE IF NOT EXISTS shipment_mrl_assessments (
  id SERIAL PRIMARY KEY,
  shipment_id VARCHAR(36) NOT NULL,
  commodity VARCHAR(255) NOT NULL,
  harvest_date DATE,
  shipment_risk_level VARCHAR(20) NOT NULL,
  chemical_breakdown JSONB NOT NULL,
  lab_test_required BOOLEAN DEFAULT FALSE,
  shipment_blocked BOOLEAN DEFAULT FALSE,
  mrl_database_version VARCHAR(20) NOT NULL,
  generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shipment_id) REFERENCES shipments(id)
);

-- Lab Test Results linked to MRL assessment
CREATE TABLE IF NOT EXISTS lab_test_results (
  id SERIAL PRIMARY KEY,
  shipment_id VARCHAR(36) NOT NULL,
  lab_name VARCHAR(255) NOT NULL,
  lab_accreditation_number VARCHAR(50),
  test_date DATE NOT NULL,
  passed_eu_mrl BOOLEAN NOT NULL,
  failed_chemicals JSONB,
  raw_results JSONB,
  report_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shipment_id) REFERENCES shipments(id)
);

-- Shipment Gate Decisions
CREATE TABLE IF NOT EXISTS shipment_gate_decisions (
  id SERIAL PRIMARY KEY,
  shipment_id VARCHAR(36) NOT NULL,
  decision_status VARCHAR(50) NOT NULL,
  can_proceed BOOLEAN NOT NULL,
  reason TEXT,
  required_actions JSONB,
  advisory TEXT,
  warning_chemicals JSONB,
  decided_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shipment_id) REFERENCES shipments(id)
);

-- Indexes for MRL lookups
CREATE INDEX idx_eu_mrl_ingredient ON eu_mrl_database(active_ingredient);
CREATE INDEX idx_eu_mrl_commodity ON eu_mrl_database(commodity);
CREATE INDEX idx_eu_mrl_lookup ON eu_mrl_database(active_ingredient, commodity);
CREATE INDEX idx_pcr_ingredient ON pesticide_commodity_risk_matrix(active_ingredient);
CREATE INDEX idx_pcr_commodity ON pesticide_commodity_risk_matrix(commodity);
CREATE INDEX idx_shipment_mrl ON shipment_mrl_assessments(shipment_id, generated_at);

-- Shipment-Farm Linkage (for MRL Risk Scan)
CREATE TABLE IF NOT EXISTS shipment_farms (
  id SERIAL PRIMARY KEY,
  shipment_id VARCHAR(36) NOT NULL,
  farm_id VARCHAR(36) NOT NULL,
  crop_id VARCHAR(36) NOT NULL,
  linked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shipment_id) REFERENCES shipments(id),
  FOREIGN KEY (farm_id) REFERENCES farms(farm_id),
  FOREIGN KEY (crop_id) REFERENCES crop_records(crop_id),
  UNIQUE(shipment_id, farm_id)
);
