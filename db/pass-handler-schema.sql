-- Culbridge PASS_HANDLER - Ground Truth Capture & Learning System
-- Tracks real-world outcomes to build confidence scores and proven compliance templates

-- ============================================
-- Table 1: shipment_outcomes
-- Stores real-world clearance results (append-only, immutable)
-- ============================================

CREATE TABLE IF NOT EXISTS ShipmentOutcomes (
    outcome_id VARCHAR(50) PRIMARY KEY,
    shipment_id VARCHAR(50) NOT NULL,
    real_world_outcome VARCHAR(20) NOT NULL CHECK (real_world_outcome IN ('PASSED', 'REJECTED')),
    clearance_reference VARCHAR(100),
    clearance_timestamp DATETIME NOT NULL,
    port VARCHAR(100),
    destination_country VARCHAR(50),
    notes TEXT,
    payload_hash CHAR(64),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (shipment_id) REFERENCES Shipments(id),
    INDEX idx_shipment (shipment_id),
    INDEX idx_outcome (real_world_outcome),
    INDEX idx_clearance_timestamp (clearance_timestamp)
);

-- ============================================
-- Table 2: prediction_accuracy
-- Stores correctness of predictions vs reality
-- ============================================

CREATE TABLE IF NOT EXISTS PredictionAccuracy (
    accuracy_id VARCHAR(50) PRIMARY KEY,
    shipment_id VARCHAR(50) NOT NULL,
    predicted_status VARCHAR(20) NOT NULL CHECK (predicted_status IN ('COMPLIANT', 'NON-COMPLIANT')),
    real_world_outcome VARCHAR(20) NOT NULL,
    accuracy_status VARCHAR(20) NOT NULL CHECK (accuracy_status IN ('CORRECT', 'DANGEROUS', 'OVER-RESTRICTIVE')),
    module_details JSON,
    evaluated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (shipment_id) REFERENCES Shipments(id),
    INDEX idx_shipment (shipment_id),
    INDEX idx_accuracy_status (accuracy_status)
);

-- ============================================
-- Table 3: confidence_scores
-- Per route + product + certificate combination
-- ============================================

CREATE TABLE IF NOT EXISTS ConfidenceScores (
    score_id VARCHAR(50) PRIMARY KEY,
    route VARCHAR(20) NOT NULL,
    product_id VARCHAR(50) NOT NULL,
    commodity_type VARCHAR(50),
    certificates JSON NOT NULL,
    hs_code VARCHAR(10),
    proven_shipments INTEGER DEFAULT 0,
    total_shipments INTEGER DEFAULT 0,
    confidence_score DECIMAL(5,4) DEFAULT 0.0,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(route, product_id, certificates, hs_code),
    INDEX idx_route_product (route, product_id),
    INDEX idx_confidence (confidence_score DESC)
);

-- ============================================
-- Table 4: proven_templates
-- Stores repeatedly successful shipment patterns
-- ============================================

CREATE TABLE IF NOT EXISTS ProvenTemplates (
    template_id VARCHAR(50) PRIMARY KEY,
    route VARCHAR(20) NOT NULL,
    product_id VARCHAR(50) NOT NULL,
    commodity_type VARCHAR(50),
    certificates JSON NOT NULL,
    hs_code VARCHAR(10),
    destination_country VARCHAR(50),
    exporter_tier INTEGER,
    avg_processing_days DECIMAL(5,2),
    residue_limit DECIMAL(10,4),
    proven_count INTEGER DEFAULT 1,
    last_used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    payload_hash CHAR(64),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(route, product_id, certificates, hs_code, destination_country),
    INDEX idx_route_product (route, product_id),
    INDEX idx_proven_count (proven_count DESC)
);

-- ============================================
-- View: accuracy_summary
-- Aggregated metrics for dashboard
-- ============================================

CREATE VIEW IF NOT EXISTS AccuracySummary AS
SELECT 
    route,
    product_id,
    COUNT(*) as total_evaluated,
    SUM(CASE WHEN accuracy_status = 'CORRECT' THEN 1 ELSE 0 END) as correct_predictions,
    SUM(CASE WHEN accuracy_status = 'DANGEROUS' THEN 1 ELSE 0 END) as dangerous_predictions,
    SUM(CASE WHEN accuracy_status = 'OVER-RESTRICTIVE' THEN 1 ELSE 0 END) as over_restrictive,
    ROUND(CAST(SUM(CASE WHEN accuracy_status = 'CORRECT' THEN 1 ELSE 0 END) AS FLOAT) / COUNT(*), 4) as accuracy_rate
FROM PredictionAccuracy pa
JOIN Shipments s ON pa.shipment_id = s.id
GROUP BY route, product_id;

-- ============================================
-- View: proven_shipments_summary
-- Shows proven patterns for UI
-- ============================================

CREATE VIEW IF NOT EXISTS ProvenShipmentsSummary AS
SELECT 
    route,
    product_id,
    commodity_type,
    certificates,
    hs_code,
    destination_country,
    proven_count,
    confidence_score
FROM ProvenTemplates pt
JOIN ConfidenceScores cs ON pt.route = cs.route 
    AND pt.product_id = cs.product_id
ORDER BY proven_count DESC;

-- ============================================
-- Trigger: Auto-update confidence on new outcome
-- ============================================

CREATE TRIGGER IF NOT EXISTS trg_update_confidence_on_outcome
AFTER INSERT ON ShipmentOutcomes
FOR EACH ROW
BEGIN
    UPDATE ConfidenceScores 
    SET 
        proven_shipments = proven_shipments + CASE WHEN NEW.real_world_outcome = 'PASSED' THEN 1 ELSE 0 END,
        total_shipments = total_shipments + 1,
        confidence_score = CAST(proven_shipments + CASE WHEN NEW.real_world_outcome = 'PASSED' THEN 1 ELSE 0 END AS FLOAT) / (total_shipments + 1),
        last_updated = CURRENT_TIMESTAMP
    WHERE route = (
        SELECT route FROM Shipments WHERE id = NEW.shipment_id
    );
END;

-- ============================================
-- Sample Data
-- ============================================

INSERT OR IGNORE INTO ShipmentOutcomes (outcome_id, shipment_id, real_world_outcome, clearance_reference, clearance_timestamp, port, destination_country, notes, payload_hash)
VALUES 
('OUT-001', 'CB-001', 'PASSED', 'SGD-2026-001234', '2026-03-28T14:30:00Z', 'Rotterdam', 'Netherlands', 'No inspection, cleared immediately', 'a1b2c3d4e5f6...'),
('OUT-002', 'CB-002', 'PASSED', 'SGD-2026-001235', '2026-03-28T15:00:00Z', 'Hamburg', 'Germany', 'Standard clearance', 'b2c3d4e5f6g7...');

INSERT OR IGNORE INTO PredictionAccuracy (accuracy_id, shipment_id, predicted_status, real_world_outcome, accuracy_status, module_details)
VALUES 
('ACC-001', 'CB-001', 'COMPLIANT', 'PASSED', 'CORRECT', '{"HSCodeValidator":"pass","DocumentVault":"pass","ComplianceEngine":"pass"}'),
('ACC-002', 'CB-002', 'COMPLIANT', 'PASSED', 'CORRECT', '{"HSCodeValidator":"pass","DocumentVault":"pass","ComplianceEngine":"pass"}');

INSERT OR IGNORE INTO ConfidenceScores (score_id, route, product_id, commodity_type, certificates, hs_code, proven_shipments, total_shipments, confidence_score)
VALUES 
('CS-001', 'NG-NL', 'PROD-180100', 'cocoa', '["NAQS","NAFDAC","SONCAP"]', '180100', 12, 14, 0.8571),
('CS-002', 'NG-DE', 'PROD-180100', 'cocoa', '["NAQS","NAFDAC"]', '180100', 8, 10, 0.8000);

INSERT OR IGNORE INTO ProvenTemplates (template_id, route, product_id, commodity_type, certificates, hs_code, destination_country, proven_count, payload_hash)
VALUES 
('TMPL-001', 'NG-NL', 'PROD-180100', 'cocoa', '["NAQS","NAFDAC","SONCAP"]', '180100', 'Netherlands', 12, 'deadbeef123...'),
('TMPL-002', 'NG-DE', 'PROD-180100', 'cocoa', '["NAQS","NAFDAC"]', '180100', 'Germany', 8, 'cafebabe456...');