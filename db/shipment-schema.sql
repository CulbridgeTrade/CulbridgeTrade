-- Culbridge Shipment Schema (Canonical)
-- Single source of truth for shipment state

-- ============================================
-- Shipments table - Core entity
-- ============================================

CREATE TABLE IF NOT EXISTS Shipments (
    id VARCHAR(50) PRIMARY KEY,
    
    -- Status (canonical state)
    status VARCHAR(20) DEFAULT 'DRAFT' 
        CHECK (status IN ('DRAFT', 'PARTIAL', 'VALIDATING', 'READY', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED')),
    
    -- Commodity data (JSON)
    commodity_data JSON,
    category VARCHAR(50),
    
    -- Entity
    exporter_id VARCHAR(50),
    
    -- Destination (JSON)
    destination_data JSON,
    
    -- Compliance results
    compliance_status VARCHAR(20) DEFAULT 'PASS'
        CHECK (compliance_status IN ('PASS', 'WARNING', 'BLOCKER')),
    compliance_flags JSON,
    
    -- Submission
    submission_ready INTEGER DEFAULT 0,
    evaluation_errors JSON,
    
    -- EUDR
    eudr_compliant INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_evaluated_at DATETIME,
    submitted_at DATETIME,
    
    -- Foreign keys
    FOREIGN KEY (exporter_id) REFERENCES Entities(id),
    
    -- Indexes
    INDEX idx_status (status),
    INDEX idx_exporter (exporter_id),
    INDEX idx_updated (updated_at),
    INDEX idx_submitted (submitted_at)
);

-- ============================================
-- Shipment Documents
-- ============================================

CREATE TABLE IF NOT EXISTS ShipmentDocuments (
    id VARCHAR(50) PRIMARY KEY,
    shipment_id VARCHAR(50) NOT NULL,
    doc_type VARCHAR(50) NOT NULL,
    file_hash VARCHAR(64),
    status VARCHAR(20) DEFAULT 'UPLOADED'
        CHECK (status IN ('UPLOADED', 'VALID', 'INVALID')),
    rejection_reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    verified_at DATETIME,
    verified_by VARCHAR(50),
    FOREIGN KEY (shipment_id) REFERENCES Shipments(id),
    INDEX idx_shipment (shipment_id),
    INDEX idx_type (doc_type),
    INDEX idx_status (status)
);

-- ============================================
-- Submissions (for idempotency)
-- ============================================

CREATE TABLE IF NOT EXISTS Submissions (
    id VARCHAR(50) PRIMARY KEY,
    shipment_id VARCHAR(50) NOT NULL,
    token VARCHAR(64) UNIQUE NOT NULL,
    sgd_number VARCHAR(50),
    status VARCHAR(20) DEFAULT 'SUBMITTED',
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    response_data JSON,
    FOREIGN KEY (shipment_id) REFERENCES Shipments(id),
    INDEX idx_shipment (shipment_id),
    INDEX idx_token (token),
    INDEX idx_sgd (sgd_number)
);

-- ============================================
-- Sample Shipments
-- ============================================

INSERT OR IGNORE INTO Shipments (id, status, category, commodity_data, destination_data, exporter_id, compliance_status, submission_ready, created_at)
VALUES 
('shp_001', 'DRAFT', 'cocoa', '{"description":"Raw cocoa beans for export","hsCode":null}', '{"country":null}', 'ENT-002', 'PASS', 0, datetime('now')),
('shp_002', 'PARTIAL', 'cocoa', '{"description":"Raw cocoa beans grade A","hsCode":"180100"}', '{"country":"NL"}', 'ENT-002', 'WARNING', 0, datetime('now')),
('shp_003', 'READY', 'cocoa', '{"description":"Premium raw cocoa beans","hsCode":"180100"}', '{"country":"NL"}', 'ENT-002', 'PASS', 1, datetime('now'));

INSERT OR IGNORE INTO ShipmentDocuments (id, shipment_id, doc_type, file_hash, status)
VALUES 
('doc_001', 'shp_003', 'COO', 'abc123hash', 'VALID'),
('doc_002', 'shp_003', 'PHYTO', 'def456hash', 'VALID'),
('doc_003', 'shp_003', 'LAB', 'ghi789hash', 'VALID'),
('doc_004', 'shp_003', 'NAFDAC', 'jkl012hash', 'VALID');

-- ============================================
-- View: Shipment Summary (for queries)
-- ============================================

CREATE VIEW IF NOT EXISTS ShipmentSummary AS
SELECT 
    s.id,
    s.status,
    s.category,
    JSON_EXTRACT(s.commodity_data, '$.hsCode') as hs_code,
    JSON_EXTRACT(s.destination_data, '$.country') as destination,
    s.compliance_status,
    s.submission_ready,
    s.created_at,
    s.updated_at,
    e.name as exporter_name,
    COUNT(d.id) as document_count
FROM Shipments s
LEFT JOIN Entities e ON s.exporter_id = e.id
LEFT JOIN ShipmentDocuments d ON s.id = d.shipment_id
GROUP BY s.id;

-- ============================================
-- Function: Evaluate shipment (triggered by changes)
-- ============================================

CREATE TRIGGER IF NOT EXISTS trg_shipment_evaluate
AFTER UPDATE ON Shipments
FOR EACH ROW
BEGIN
  -- Note: In production, this would call the evaluation function
  -- For now, status is updated manually via API
  SELECT NEW.status;
END;

CREATE TRIGGER IF NOT EXISTS trg_document_evaluate
AFTER INSERT OR UPDATE ON ShipmentDocuments
FOR EACH ROW
BEGIN
  -- Would trigger re-evaluation
  SELECT NEW.shipment_id;
END;