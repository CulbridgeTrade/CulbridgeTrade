-- Compliance Rules Table (Access2Markets)
-- Stores MRL limits, required documents, special conditions

CREATE TABLE IF NOT EXISTS compliance_rules (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL, -- 'MRL', 'DOCUMENT_REQUIREMENT', 'SPECIAL_CONDITION'
  hs_code TEXT NOT NULL,
  product_name TEXT,
  pesticide_name TEXT,
  mrl_limit FLOAT,
  unit TEXT,
  country TEXT,
  required_documents JSONB,
  special_conditions JSONB,
  source TEXT DEFAULT 'Access2Markets',
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_compliance_rules_hs_code ON compliance_rules(hs_code);
CREATE INDEX IF NOT EXISTS idx_compliance_rules_type ON compliance_rules(type);
CREATE INDEX IF NOT EXISTS idx_compliance_rules_pesticide ON compliance_rules(pesticide_name);

-- Sample data
INSERT OR IGNORE INTO compliance_rules (id, type, hs_code, product_name, pesticide_name, mrl_limit, unit, country, source) VALUES
  ('MRL-120740-chlorpyrifos', 'MRL', '120740', 'Sesame seeds', 'chlorpyrifos', 0.01, 'mg/kg', 'NG', 'Access2Markets'),
  ('MRL-120740-pendimethalin', 'MRL', '120740', 'Sesame seeds', 'pendimethalin', 0.05, 'mg/kg', 'NG', 'Access2Markets'),
  ('MRL-120740-carbofuran', 'MRL', '120740', 'Sesame seeds', 'carbofuran', 0.02, 'mg/kg', 'NG', 'Access2Markets'),
  ('MRL-120729-aflatoxin_b1', 'MRL', '120729', 'Groundnuts', 'aflatoxin_b1', 0.002, 'mg/kg', 'NG', 'Access2Markets'),
  ('MRL-120729-total_aflatoxins', 'MRL', '120729', 'Groundnuts', 'total_aflatoxins', 0.004, 'mg/kg', 'NG', 'Access2Markets'),
  ('MRL-180100-cadmium', 'MRL', '180100', 'Cocoa beans', 'cadmium', 0.1, 'mg/kg', 'NG', 'Access2Markets'),
  ('MRL-180100-lead', 'MRL', '180100', 'Cocoa beans', 'lead', 0.2, 'mg/kg', 'NG', 'Access2Markets'),
  ('MRL-080131-chlorpyrifos', 'MRL', '080131', 'Cashew nuts', 'chlorpyrifos', 0.01, 'mg/kg', 'NG', 'Access2Markets'),
  ('MRL-120890-chlorpyrifos', 'MRL', '120890', 'Ginger', 'chlorpyrifos', 0.05, 'mg/kg', 'NG', 'Access2Markets');
