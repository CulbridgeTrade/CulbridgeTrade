-- Farm Registry Schema
CREATE TABLE IF NOT EXISTS farms (
  farm_id VARCHAR(36) PRIMARY KEY,
  external_id VARCHAR(50),
  registered_by VARCHAR(36) NOT NULL,
  farmer_name VARCHAR(255) NOT NULL,
  farmer_phone VARCHAR(20) NOT NULL,
  farmer_nin VARCHAR(20),
  cooperative_id VARCHAR(50),
  gps_lat DECIMAL(10,8) NOT NULL,
  gps_lng DECIMAL(11,8) NOT NULL,
  gps_polygon JSON,
  state VARCHAR(50) NOT NULL,
  lga VARCHAR(100) NOT NULL,
  zone VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Crop Records
CREATE TABLE IF NOT EXISTS crop_records (
  crop_id VARCHAR(36) PRIMARY KEY,
  farm_id VARCHAR(36) REFERENCES farms(farm_id),
  crop_name VARCHAR(50) NOT NULL,
  crop_variety VARCHAR(100),
  planting_date DATE NOT NULL,
  expected_harvest DATE NOT NULL,
  actual_harvest DATE,
  field_area_hectares DECIMAL(6,2) NOT NULL,
  estimated_yield_kg DECIMAL(10,2)
);

-- Pesticide Logs
CREATE TABLE IF NOT EXISTS pesticide_logs (
  log_id VARCHAR(36) PRIMARY KEY,
  farm_id VARCHAR(36) REFERENCES farms(farm_id),
  crop_id VARCHAR(36) REFERENCES crop_records(crop_id),
  logged_by VARCHAR(36),
  log_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  pesticide_name VARCHAR(255) NOT NULL,
  active_ingredient VARCHAR(100) NOT NULL,
  application_date DATE NOT NULL,
  pre_harvest_interval_days INT NOT NULL,
  dosage_per_hectare DECIMAL(10,2) NOT NULL,
  dosage_unit ENUM('ml', 'g') NOT NULL,
  application_method VARCHAR(50),
  area_treated_hectares DECIMAL(6,2),
  photo_evidence_url VARCHAR(500),
  purchased_from VARCHAR(255)
);

-- Indexes
CREATE INDEX idx_pesticide_logs_farm_crop ON pesticide_logs(farm_id, crop_id);
CREATE INDEX idx_pesticide_active ON pesticide_logs(active_ingredient);

