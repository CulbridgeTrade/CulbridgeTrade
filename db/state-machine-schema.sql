-- Culbridge State Machine Schema
-- Enforces legal progression of truth with hard state transitions

-- ============================================
-- Shipments table - add state fields
-- ============================================

ALTER TABLE Shipments ADD COLUMN IF NOT EXISTS current_state VARCHAR(30) DEFAULT 'INGESTED';
ALTER TABLE Shipments ADD COLUMN IF NOT EXISTS state_updated_at DATETIME;
ALTER TABLE Shipments ADD COLUMN IF NOT EXISTS state_updated_by VARCHAR(50);
ALTER TABLE Shipments ADD COLUMN IF NOT EXISTS payload_hash CHAR(64);
ALTER TABLE Shipments ADD COLUMN IF NOT EXISTS payment_total DECIMAL(15,2);
ALTER TABLE Shipments ADD COLUMN IF NOT EXISTS clearance_reference VARCHAR(100);
ALTER TABLE Shipments ADD COLUMN IF NOT EXISTS clearance_timestamp DATETIME;
ALTER TABLE Shipments ADD COLUMN IF NOT EXISTS real_world_outcome VARCHAR(20);

CREATE INDEX IF NOT EXISTS idx_shipment_state ON Shipments(current_state);
CREATE INDEX IF NOT EXISTS idx_shipment_payload_hash ON Shipments(payload_hash);

-- ============================================
-- Table: StateTransitions
-- Immutable audit log of all state changes
-- ============================================

CREATE TABLE IF NOT EXISTS StateTransitions (
    transition_id VARCHAR(50) PRIMARY KEY,
    shipment_id VARCHAR(50) NOT NULL,
    from_state VARCHAR(30) NOT NULL,
    to_state VARCHAR(30) NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    actor_id VARCHAR(50),
    context JSON,
    transition_hash CHAR(64),
    FOREIGN KEY (shipment_id) REFERENCES Shipments(id),
    INDEX idx_shipment (shipment_id),
    INDEX idx_timestamp (timestamp)
);

-- ============================================
-- Table: InvariantViolations
-- Log all invariant violations (for audit & debugging)
-- ============================================

CREATE TABLE IF NOT EXISTS InvariantViolations (
    violation_id VARCHAR(50) PRIMARY KEY,
    shipment_id VARCHAR(50) NOT NULL,
    invariant_name VARCHAR(100) NOT NULL,
    expected_value TEXT,
    actual_value TEXT,
    violated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    blocked_transition VARCHAR(30),
    FOREIGN KEY (shipment_id) REFERENCES Shipments(id),
    INDEX idx_shipment (shipment_id),
    INDEX idx_invariant (invariant_name)
);

-- ============================================
-- Table: DigitalSignatureResults
-- Store signatures for invariant checks
-- ============================================

CREATE TABLE IF NOT EXISTS DigitalSignatureResults (
    signature_id VARCHAR(50) PRIMARY KEY,
    shipment_id VARCHAR(50) NOT NULL,
    payload_hash CHAR(64) NOT NULL,
    signature_value TEXT NOT NULL,
    signer_identity VARCHAR(100),
    signed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    nonce VARCHAR(64),
    FOREIGN KEY (shipment_id) REFERENCES Shipments(id),
    INDEX idx_shipment (shipment_id),
    INDEX idx_payload_hash (payload_hash)
);

-- ============================================
-- Table: ComplianceResults
-- Store compliance engine results
-- ============================================

CREATE TABLE IF NOT EXISTS ComplianceResults (
    compliance_id VARCHAR(50) PRIMARY KEY,
    shipment_id VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('COMPLIANT', 'NON_COMPLIANT')),
    violations JSON,
    required_documents JSON,
    checked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    rules_version VARCHAR(20),
    FOREIGN KEY (shipment_id) REFERENCES Shipments(id),
    INDEX idx_shipment (shipment_id),
    INDEX idx_status (status)
);

-- ============================================
-- Table: FeeCalculations
-- Store fee calculations for invariant checks
-- ============================================

CREATE TABLE IF NOT EXISTS FeeCalculations (
    fee_id VARCHAR(50) PRIMARY KEY,
    shipment_id VARCHAR(50) NOT NULL,
    total_estimated_fee_naira DECIMAL(15,2) NOT NULL,
    certificate_breakdown JSON,
    calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (shipment_id) REFERENCES Shipments(id),
    INDEX idx_shipment (shipment_id)
);

-- ============================================
-- Table: ShipmentDocuments
-- Extended with status for verification tracking
-- ============================================

ALTER TABLE ShipmentDocuments ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending' 
    CHECK (status IN ('pending', 'uploaded', 'verified', 'rejected'));
ALTER TABLE ShipmentDocuments ADD COLUMN IF NOT EXISTS verified_at DATETIME;
ALTER TABLE ShipmentDocuments ADD COLUMN IF NOT EXISTS verified_by VARCHAR(50);

-- ============================================
-- Function: Validate state transition
-- ============================================

CREATE FUNCTION IF NOT EXISTS validate_state_transition(
    current_state VARCHAR(30),
    new_state VARCHAR(30)
)
RETURNS BOOLEAN
AS $$
BEGIN
    -- INGESTED can go to HS_VALIDATED or REJECTED
    IF current_state = 'INGESTED' AND new_state IN ('HS_VALIDATED', 'REJECTED') THEN
        RETURN TRUE;
    END IF;
    
    -- HS_VALIDATED can go to DOCUMENTS_VERIFIED or REJECTED
    IF current_state = 'HS_VALIDATED' AND new_state IN ('DOCUMENTS_VERIFIED', 'REJECTED') THEN
        RETURN TRUE;
    END IF;
    
    -- DOCUMENTS_VERIFIED can go to COMPLIANCE_PASSED or REJECTED
    IF current_state = 'DOCUMENTS_VERIFIED' AND new_state IN ('COMPLIANCE_PASSED', 'REJECTED') THEN
        RETURN TRUE;
    END IF;
    
    -- COMPLIANCE_PASSED can go to FINANCIAL_CONFIRMED or REJECTED
    IF current_state = 'COMPLIANCE_PASSED' AND new_state IN ('FINANCIAL_CONFIRMED', 'REJECTED') THEN
        RETURN TRUE;
    END IF;
    
    -- FINANCIAL_CONFIRMED can go to READY_FOR_SIGNATURE or REJECTED
    IF current_state = 'FINANCIAL_CONFIRMED' AND new_state IN ('READY_FOR_SIGNATURE', 'REJECTED') THEN
        RETURN TRUE;
    END IF;
    
    -- READY_FOR_SIGNATURE can go to SIGNED or REJECTED
    IF current_state = 'READY_FOR_SIGNATURE' AND new_state IN ('SIGNED', 'REJECTED') THEN
        RETURN TRUE;
    END IF;
    
    -- SIGNED can go to SUBMITTED
    IF current_state = 'SIGNED' AND new_state = 'SUBMITTED' THEN
        RETURN TRUE;
    END IF;
    
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- View: Current State Summary
-- ============================================

CREATE VIEW IF NOT EXISTS ShipmentStateSummary AS
SELECT 
    s.id as shipment_id,
    s.current_state,
    s.state_updated_at,
    s.product,
    s.destination,
    s.exporter_id,
    ds.payload_hash as signed_payload_hash,
    cr.status as compliance_status,
    fc.total_estimated_fee_naira as calculated_fees,
    s.payment_total as paid_fees
FROM Shipments s
LEFT JOIN DigitalSignatureResults ds ON s.id = ds.shipment_id
LEFT JOIN ComplianceResults cr ON s.id = cr.shipment_id
LEFT JOIN FeeCalculations fc ON s.id = fc.shipment_id;

-- ============================================
-- Sample state transitions
-- ============================================

INSERT OR IGNORE INTO StateTransitions (transition_id, shipment_id, from_state, to_state, timestamp, actor_id, context)
VALUES 
('TRANS-001', 'CB-001', 'INGESTED', 'HS_VALIDATED', '2026-03-28T09:00:00Z', 'system', '{"module":"hs_code_validator"}'),
('TRANS-002', 'CB-001', 'HS_VALIDATED', 'DOCUMENTS_VERIFIED', '2026-03-28T09:30:00Z', 'system', '{"module":"document_vault"}'),
('TRANS-003', 'CB-001', 'DOCUMENTS_VERIFIED', 'COMPLIANCE_PASSED', '2026-03-28T10:00:00Z', 'system', '{"module":"compliance_engine"}'),
('TRANS-004', 'CB-001', 'COMPLIANCE_PASSED', 'FINANCIAL_CONFIRMED', '2026-03-28T10:15:00Z', 'system', '{"module":"fee_calculator"}'),
('TRANS-005', 'CB-001', 'FINANCIAL_CONFIRMED', 'READY_FOR_SIGNATURE', '2026-03-28T10:20:00Z', 'system', '{"module":"submission_prep"}'),
('TRANS-006', 'CB-001', 'READY_FOR_SIGNATURE', 'SIGNED', '2026-03-28T10:30:00Z', 'system', '{"module":"digital_signature"}'),
('TRANS-007', 'CB-001', 'SIGNED', 'SUBMITTED', '2026-03-28T11:00:00Z', 'system', '{"module":"nsw_submission"}');