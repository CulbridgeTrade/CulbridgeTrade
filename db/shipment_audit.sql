-- Shipment Audit Log Table
-- Every deterministic decision is logged for traceability

CREATE TABLE IF NOT EXISTS shipment_audit (
    audit_id SERIAL PRIMARY KEY,
    shipment_id TEXT NOT NULL,
    
    -- EUDR Compliance
    eudr_status VARCHAR(20),
    eudr_risk_score FLOAT,
    eudr_certificate TEXT,
    eudr_checked_at TIMESTAMP,
    
    -- TRACES NT Compliance
    traces_certificate_status VARCHAR(20),
    traces_certificate_id TEXT,
    traces_checked_at TIMESTAMP,
    
    -- RASFF Signals
    rasff_signals JSONB,
    rasff_rejection_rate FLOAT,
    
    -- Access2Markets
    a2m_compliant BOOLEAN,
    a2m_violations JSONB,
    
    -- NVWA
    nvwa_decision VARCHAR(20),
    nvwa_blocks JSONB,
    
    -- Risk Scoring
    base_risk_score FLOAT,
    final_risk_score FLOAT,
    inspection_probability FLOAT,
    
    -- Decision
    decision VARCHAR(20) NOT NULL,
    confidence FLOAT,
    expected_loss_usd FLOAT,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    decision_reason TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_audit_shipment ON shipment_audit(shipment_id);
CREATE INDEX IF NOT EXISTS idx_audit_decision ON shipment_audit(decision);
CREATE INDEX IF NOT EXISTS idx_audit_created ON shipment_audit(created_at);

-- Sample audit records
INSERT INTO shipment_audit (
    shipment_id, 
    eudr_status, eudr_risk_score,
    traces_certificate_status,
    decision,
    created_at
) VALUES
    ('COCOA-NG-001', 'COMPLIANT', 0.12, 'VALID', 'CLEAR_TO_SHIP', '2026-03-20 10:00:00'),
    ('COCOA-NG-002', 'COMPLIANT', 0.28, 'VALID', 'REVIEW_REQUIRED', '2026-03-18 14:30:00'),
    ('TIMBER-LBR-001', 'NON_COMPLIANT', 0.78, 'INVALID', 'DO_NOT_SHIP', '2026-03-15 11:00:00'),
    ('SESAME-NG-001', 'NOT_APPLICABLE', 0, 'VALID', 'HIGH_RISK_INSPECTION', '2026-03-22 09:15:00'),
    ('COCOA-GH-001', 'COMPLIANT', 0.08, 'VALID', 'CLEAR_TO_SHIP', '2026-03-19 08:45:00');


-- Extended shipment table with compliance columns
ALTER TABLE shipments 
    ADD COLUMN IF NOT EXISTS eudr_status VARCHAR(20),
    ADD COLUMN IF NOT EXISTS eudr_risk_score FLOAT,
    ADD COLUMN IF NOT EXISTS eudr_last_checked TIMESTAMP,
    ADD COLUMN IF NOT EXISTS traces_certificate_status VARCHAR(20),
    ADD COLUMN IF NOT EXISTS traces_checked_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS decision VARCHAR(20),
    ADD COLUMN IF NOT EXISTS decision_confidence FLOAT,
    ADD COLUMN IF NOT EXISTS decision_expected_loss FLOAT;
