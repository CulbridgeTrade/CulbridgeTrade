-- Sesame Lab Schema EU NL/DE - Deterministic Fields
CREATE TABLE IF NOT EXISTS SesameLabReports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_id TEXT NOT NULL,
  aflatoxin_b1 REAL CHECK (aflatoxin_b1 >= 0),
  aflatoxin_total REAL CHECK (aflatoxin_total >= 0),
  salmonella_present BOOLEAN NOT NULL,
  pesticides TEXT, -- JSON array [{'name':'pesticide1','value':0.01,'mrl':0.05}]
  moisture_percent REAL CHECK (moisture_percent BETWEEN 0 AND 15),
  botanical_name TEXT CHECK (botanical_name = 'Sesamum indicum'),
  traceability_chain TEXT NOT NULL,
  certificate_of_origin TEXT,
  phytosanitary_certificate TEXT,
  lab_batch_number TEXT NOT NULL,
  shipment_batch_number TEXT NOT NULL,
  lab_accreditation TEXT CHECK (lab_accreditation IN ('ISO17025', 'ILAC')),
  lab_reliability_score INTEGER CHECK (lab_reliability_score BETWEEN 0 AND 100),
  metadata_match BOOLEAN NOT NULL,
  extracted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shipment_id) REFERENCES Shipments(id)
);

CREATE INDEX idx_sesame_lab_shipment ON SesameLabReports(shipment_id);

-- View for enforcement severity
CREATE VIEW SesameLabEnforcement AS
SELECT 
  *,
  CASE 
    WHEN salmonella_present = 1 THEN 'HARD_BLOCKER'
    WHEN aflatoxin_b1 IS NULL OR aflatoxin_b1 > 4.0 THEN 'HARD_BLOCKER'
    WHEN aflatoxin_total IS NULL OR aflatoxin_total > 10.0 THEN 'HARD_BLOCKER'
    WHEN botanical_name != 'Sesamum indicum' THEN 'CRITICAL_PENALTY'
    WHEN lab_accreditation NOT IN ('ISO17025', 'ILAC') THEN 'CRITICAL_PENALTY'
    WHEN lab_batch_number != shipment_batch_number THEN 'HARD_BLOCKER'
    WHEN moisture_percent IS NULL OR moisture_percent > 7 THEN 'MODERATE_PENALTY'
    ELSE 'PASS'
  END as enforcement_severity
FROM SesameLabReports;

