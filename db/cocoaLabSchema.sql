-- Cocoa Lab Schema - EU (NL/DE) Enforcement MVP
-- Direct mapping to True Enforcement Model + Extraction Layer

CREATE TABLE IF NOT EXISTS CocoaLabs (
  shipment_id VARCHAR(50) PRIMARY KEY,
  shipment_batch_number VARCHAR(50) NOT NULL,
  lab_batch_number VARCHAR(50) NOT NULL,
  lab_name VARCHAR(100) NOT NULL,
  lab_accreditation VARCHAR(50) NOT NULL DEFAULT '',
  lab_expiry_date DATE NOT NULL,
  report_date DATE NOT NULL,
  botanical_name VARCHAR(100) NOT NULL DEFAULT '',
  aflatoxin_b1 DECIMAL(5,2) NOT NULL,
  aflatoxin_total DECIMAL(5,2) NOT NULL,
  pesticides JSON,
  moisture_percent DECIMAL(4,2) NOT NULL,
  certificate_of_origin_number VARCHAR(50),
  phytosanitary_cert_number VARCHAR(50),
  health_cert_number VARCHAR(50),
  traceability_geo VARCHAR(50),
  traceability_farm_info VARCHAR(255),
  hs_code VARCHAR(10) NOT NULL,
  packing_list_complete BOOLEAN NOT NULL DEFAULT FALSE,
  exporter_id VARCHAR(50) NOT NULL,
  document_source VARCHAR(255) NOT NULL,
  eudr_compliance BOOLEAN NOT NULL DEFAULT FALSE,
  lab_tier TINYINT NOT NULL DEFAULT 2 CHECK (lab_tier IN (1,2)),
  historical_rasff_flag BOOLEAN NOT NULL DEFAULT FALSE,
  repeat_exporter_success_rate DECIMAL(5,2) DEFAULT NULL,
  metadata_consistency BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  cci_number VARCHAR(50),
  trms_id VARCHAR(50),
  ness_fee_paid BOOLEAN DEFAULT FALSE,
  naqs_inspection_passed BOOLEAN DEFAULT FALSE,
  naqs_inspection_date DATE,
  INDEX idx_batch (shipment_batch_number, lab_batch_number),
  INDEX idx_lab_name (lab_name),
  INDEX idx_exporter (exporter_id),
  CHECK (aflatoxin_b1 >= 0),
  CHECK (aflatoxin_total >= 0),
  CHECK (moisture_percent >= 0),
  CHECK (lab_tier IN (1,2))
);

-- Enforcement Views (deterministic queries)
CREATE VIEW IF NOT EXISTS CocoaBlockers AS
SELECT shipment_id
FROM CocoaLabs 
WHERE aflatoxin_b1 > 2 OR aflatoxin_total > 4
  OR shipment_batch_number != lab_batch_number
  OR certificate_of_origin_number IS NULL
  OR phytosanitary_cert_number IS NULL
  OR health_cert_number IS NULL
  OR traceability_geo IS NULL
OR eudr_compliance = FALSE
  OR cci_number IS NULL
  OR trms_id IS NULL
  OR ness_fee_paid = FALSE
  OR naqs_inspection_passed = FALSE
  OR lab_accreditation != 'ISO 17025'
  OR lab_expiry_date < CURRENT_DATE
  OR report_date < DATE('now', '-6 months');

CREATE VIEW IF NOT EXISTS CocoaPenalties AS
SELECT shipment_id, JSON_ARRAY(
  CASE WHEN pesticides IS NOT NULL THEN 'Pesticides over MRL' ELSE NULL END,
  CASE WHEN botanical_name != 'Theobroma cacao' THEN 'Botanical mismatch' ELSE NULL END,
  CASE WHEN historical_rasff_flag THEN 'RASFF flagged lab' ELSE NULL END
) as critical_issues
FROM CocoaLabs;

-- Sample cocoa lab data
INSERT OR IGNORE INTO CocoaLabs VALUES
('CB-002', 'BATCH-COC-2024-002', 'BATCH-COC-2024-002', 'Lagos ISO Lab', 'ISO 17025', '2029-01-01', '2024-04-01', 'Theobroma cacao', 1.5, 3.0, '[{"name":"Chlorpyrifos","value":0.02,"mrl":0.05}]', 6.2, 'CO-COC-001', 'PHY-COC-001', 'HC-COC-001', '6.5244,3.3792', 'Farm Alpha Nigeria', '180100', TRUE, 'EXP-002', 'lab_cocoa.pdf:page3', TRUE, 1, FALSE, 92.5, TRUE),
('CB-003', 'BATCH-COC-2024-003', 'BATCH-COC-2024-XXX', 'Kano Agro Lab', 'ISO 17025', '2028-01-01', '2024-03-01', 'Theobroma cacao', 2.5, 5.0, NULL, 8.1, NULL, NULL, NULL, NULL, NULL, '180100', FALSE, 'EXP-003', 'lab_cocoa_fail.pdf:page2', FALSE, 2, TRUE, 65.0, FALSE);

