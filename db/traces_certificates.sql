-- TRACES Certificates Table
-- Stores phytosanitary certificates and traceability data

CREATE TABLE IF NOT EXISTS traces_certificates (
  certificate_id TEXT PRIMARY KEY,
  exporter TEXT NOT NULL,
  origin_country TEXT NOT NULL,
  product TEXT NOT NULL,
  hs_code TEXT,
  batch_id TEXT NOT NULL,
  issue_date DATE,
  expiry_date DATE,
  status TEXT DEFAULT 'VALID', -- VALID, INVALID, REVOKED, EXPIRED, SUSPENDED
  issuing_authority TEXT DEFAULT 'NVWA',
  raw_data JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  validated_at TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_traces_exporter ON traces_certificates(exporter);
CREATE INDEX IF NOT EXISTS idx_traces_batch ON traces_certificates(batch_id);
CREATE INDEX IF NOT EXISTS idx_traces_origin ON traces_certificates(origin_country);
CREATE INDEX IF NOT EXISTS idx_traces_status ON traces_certificates(status);

-- Sample data
INSERT OR IGNORE INTO traces_certificates (certificate_id, exporter, origin_country, product, hs_code, batch_id, issue_date, status) VALUES
  ('TRACES-NG-001', 'Premium Foods Ltd', 'Nigeria', 'Sesame seeds', '120740', 'BATCH-NG-001', '2026-03-01', 'VALID'),
  ('TRACES-NG-002', 'Nigerian Exports Co', 'Nigeria', 'Sesame seeds', '120740', 'BATCH-NG-002', '2026-03-05', 'VALID'),
  ('TRACES-NG-003', 'Groundnut Pro Ltd', 'Nigeria', 'Groundnuts', '120729', 'BATCH-NG-003', '2026-03-08', 'VALID'),
  ('TRACES-NG-004', 'Cocoa Trade Intl', 'Nigeria', 'Cocoa beans', '180100', 'BATCH-NG-004', '2026-03-10', 'VALID'),
  ('TRACES-NG-005', 'Cashew Masters', 'Nigeria', 'Cashew nuts', '080131', 'BATCH-NG-005', '2026-03-12', 'VALID'),
  ('TRACES-NG-006', 'Ginger Fresh Co', 'Nigeria', 'Ginger', '120890', 'BATCH-NG-006', '2026-03-15', 'VALID'),
  ('TRACES-NG-007', 'Premium Foods Ltd', 'Nigeria', 'Sesame seeds', '120740', 'BATCH-NG-007', '2026-02-20', 'EXPIRED');
