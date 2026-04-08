-- Beans Lab Schema - EU NL/DE MVP
-- Brown & White Beans (Phaseolus vulgaris)

CREATE TABLE IF NOT EXISTS beans_labs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lab_id TEXT UNIQUE,
  name TEXT NOT NULL,
  tier INTEGER CHECK (tier IN (1,2)),
  iso_17025 BOOLEAN DEFAULT FALSE,
  historical_failure_rate REAL DEFAULT 0.0,
  aflatoxin_compliance_rate REAL DEFAULT 1.0,
  pesticide_mrl_rate REAL DEFAULT 1.0,
  salmonella_clean_rate REAL DEFAULT 1.0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Sample Tier1 Beans Labs (NG)
INSERT OR IGNORE INTO beans_labs (lab_id, name, tier, iso_17025) VALUES
('BEANS-LAB001', 'Lagos Beans Quality Lab', 1, TRUE),
('BEANS-LAB002', 'Abuja ISO Beans Lab', 1, TRUE),
('BEANS-LAB003', 'Kano Agro Beans Lab', 2, FALSE);

-- Indexes
CREATE INDEX idx_beans_labs_tier ON beans_labs(tier);
CREATE INDEX idx_beans_labs_iso ON beans_labs(iso_17025);

-- Enforcement Metrics Table
CREATE TABLE IF NOT EXISTS beans_enforcement_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lab_id TEXT REFERENCES beans_labs(lab_id),
  aflatoxin_b1_pass_rate REAL,
  aflatoxin_total_pass_rate REAL,
  pesticides_mrl_pass_rate REAL,
  salmonella_negative_rate REAL,
  moisture_compliant_rate REAL,
  botanical_correct_rate REAL,
  traceability_valid_rate REAL,
  certs_complete_rate REAL,
  batch_match_rate REAL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);


