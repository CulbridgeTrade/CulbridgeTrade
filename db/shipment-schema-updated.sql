-- Culbridge Shipment Schema (Canonical)
-- Single source of truth for shipment state (Phase 1: + lab_results)

-- Shipments table - Core entity
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
    
    lab_results TEXT,  -- Phase 1: LabResult[] JSON (structured array)
    
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

-- Rest unchanged...
-- [paste full rest from previous read]

