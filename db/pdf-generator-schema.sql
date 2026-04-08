-- Culbridge PDF Generation Database Schema
-- Stores PDF generation metadata for audit and retrieval

CREATE TABLE IF NOT EXISTS GeneratedPdfs (
  shipment_id VARCHAR(50) PRIMARY KEY,
  pdf_path VARCHAR(255) NOT NULL,
  pdf_hash VARCHAR(64) NOT NULL,
  payload_hash VARCHAR(64),
  generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  generated_by VARCHAR(50),
  deleted_at DATETIME,
  deleted_by VARCHAR(50),
  INDEX idx_shipment (shipment_id),
  INDEX idx_hash (pdf_hash),
  INDEX idx_generated_at (generated_at)
);

-- Trigger to ensure PDF is only generated for verified shipments
CREATE TRIGGER IF NOT EXISTS trg_pdf_generation_check
BEFORE INSERT ON GeneratedPdfs
FOR EACH ROW
BEGIN
  SELECT CASE
    WHEN (SELECT status FROM Shipments WHERE id = NEW.shipment_id) NOT IN ('READY_TO_SUBMIT', 'SIGNED', 'SUBMITTED')
    THEN RAISE(ABORT, 'Shipment must be in READY_TO_SUBMIT state or beyond')
  END;
END;

-- View for active PDFs
CREATE VIEW IF NOT EXISTS ActivePdfs AS
SELECT 
  shipment_id,
  pdf_path,
  pdf_hash,
  payload_hash,
  generated_at,
  generated_by
FROM GeneratedPdfs
WHERE deleted_at IS NULL;

-- Sample PDF generation log entry
INSERT OR IGNORE INTO GeneratedPdfs (shipment_id, pdf_path, pdf_hash, payload_hash, generated_at, generated_by)
VALUES (
  'CB-001',
  '/storage/pdfs/CB-001.pdf',
  'a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd',
  'deadbeef12345678901234567890123456789012345678901234567890abcdef',
  '2026-03-28T10:30:00Z',
  'system'
);