-- Ginger Lab Schema EU NL/DE - Full + MVP

CREATE TABLE IF NOT EXISTS GingerLabReports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_id TEXT NOT NULL,
  aflatoxin_b1 REAL CHECK (aflatoxin_b1 >= 0),
  aflatoxin_total REAL CHECK (aflatoxin_total >= 0),
  Salmonella_present BOOLEAN NOT NULL,
  moisture REAL CHECK (moisture >= 0),
  botanical_name TEXT,
  pesticides TEXT, -- JSON
  traceability_chain TEXT, -- JSON array
  certificate_of_origin TEXT,
  phytosanitary_certificate TEXT,
  metadata_consistency BOOLEAN DEFAULT TRUE,
  lab_accreditation TEXT,
  packaging_integrity TEXT,
  extracted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shipment_id) REFERENCES Shipments(id)
);

CREATE INDEX idx_ginger_lab_shipment ON GingerLabReports(shipment_id);

-- MVP Hard-Gate View
CREATE VIEW GingerLabMVP AS
SELECT 
  shipment_id,
  aflatoxin_total, Salmonella_present, moisture,
  botanical_name, traceability_chain,
  certificate_of_origin, phytosanitary_certificate
FROM GingerLabReports;

-- Enforcement Severity
CREATE VIEW GingerEnforcement AS
SELECT *,
  CASE 
    WHEN Salmonella_present OR aflatoxin_b1 > 2 OR aflatoxin_total > 4 OR moisture > 12 THEN 'HARD_BLOCKER'
    WHEN pesticides IS NOT NULL THEN 'CRITICAL_PENALTY'
    ELSE 'PASS'
  END as severity
FROM GingerLabReports;

-- Sample Data
INSERT OR IGNORE INTO GingerLabReports (shipment_id, aflatoxin_b1, aflatoxin_total, Salmonella_present, moisture, botanical_name, traceability_chain, certificate_of_origin, phytosanitary_certificate)
VALUES 
('GINGER-NL-001', 1.5, 3.2, 0, 10.5, 'Zingiber officinale', '["FarmG", "ProcH", "GINGER-NL-001"]', 'COO-G001', 'PHC-G001'),
('GINGER-DE-002', 3.0, 5.5, 0, 13.2, 'Zingiber officinale', '["FarmI"]', NULL, 'PHC-G002');

