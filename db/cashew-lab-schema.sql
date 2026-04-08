-- Cashew Lab Schema EU NL/DE MVP

-- Full Schema
CREATE TABLE IF NOT EXISTS CashewLabReports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_id TEXT NOT NULL,
  lab_batch_number TEXT NOT NULL,
  shipment_batch_number TEXT NOT NULL,
  aflatoxin_b1 REAL CHECK (aflatoxin_b1 >= 0),
  aflatoxin_total REAL CHECK (aflatoxin_total >= 0),
  salmonella_present BOOLEAN NOT NULL,
  moisture REAL CHECK (moisture >= 0),
  botanical_name TEXT,
  traceability_chain TEXT, -- JSON array/string
  pesticides TEXT, -- JSON [{'name':str, 'value':float, 'mrl':float}]
  certificate_of_origin TEXT,
  phytosanitary_certificate TEXT,
  metadata_consistency BOOLEAN DEFAULT TRUE,
  lab_accreditation TEXT,
  historical_rasff_score INTEGER DEFAULT 0 CHECK (historical_rasff_score BETWEEN 0 AND 10),
  batch_consistency BOOLEAN DEFAULT FALSE,
  extracted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shipment_id) REFERENCES Shipments(id)
);

CREATE INDEX idx_cashew_lab_shipment ON CashewLabReports(shipment_id);

-- MVP Minimal View - Hard Gates Only
CREATE VIEW CashewLabMVP AS
SELECT 
  shipment_id,
  lab_batch_number,
  shipment_batch_number,
  aflatoxin_b1,
  aflatoxin_total,
  salmonella_present,
  moisture,
  botanical_name,
  traceability_chain,
  certificate_of_origin,
  phytosanitary_certificate
FROM CashewLabReports;

-- Enforcement Severity View
CREATE VIEW CashewEnforcement AS
SELECT *,
  CASE 
    WHEN salmonella_present = 1 OR aflatoxin_b1 > 2 OR aflatoxin_total > 4 OR moisture > 7 OR botanical_name != 'Anacardium occidentale' OR lab_batch_number != shipment_batch_number OR certificate_of_origin IS NULL OR phytosanitary_certificate IS NULL THEN 'HARD_BLOCKER'
    WHEN pesticides IS NOT NULL THEN 'CRITICAL_PENALTY'
    WHEN metadata_consistency = 0 THEN 'MODERATE_PENALTY'
    ELSE 'TRUST_BOOSTER'
  END as severity
FROM CashewLabReports;

-- Sample MVP Data
INSERT OR IGNORE INTO CashewLabReports (shipment_id, lab_batch_number, shipment_batch_number, aflatoxin_b1, aflatoxin_total, salmonella_present, moisture, botanical_name, traceability_chain, certificate_of_origin, phytosanitary_certificate)
VALUES 
('CASHEW-001', 'L-CAS-001', 'S-CAS-001', 1.8, 3.2, 0, 6.2, 'Anacardium occidentale', '["FarmX", "ProcY", "CASHEW-001"]', 'COO-CAS001', 'PHC-CAS001'),
('CASHEW-002', 'L-CAS-002', 'S-CAS-002', 2.5, 5.1, 0, 8.0, 'Anacardium occidentale', '["FarmZ"]', NULL, 'PHC-CAS002');

