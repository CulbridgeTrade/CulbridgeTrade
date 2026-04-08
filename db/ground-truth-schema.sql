-- Ground Truth Layer - Shipment Outcomes Tracking
-- Purpose: Closed feedback loop for measuring decision accuracy

-- Shipment outcomes table - tracks predicted vs actual
CREATE TABLE IF NOT EXISTS shipment_outcomes (
    shipment_id TEXT PRIMARY KEY,
    predicted_decision VARCHAR(20),       -- DO_NOT_SHIP / SHIP / REQUIRES_MANUAL_REVIEW
    actual_outcome VARCHAR(20),           -- rejected / cleared
    predicted_loss_usd FLOAT,
    actual_loss_usd FLOAT,
    confidence FLOAT,
    sample_size INT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Fix rules table for optimization
CREATE TABLE IF NOT EXISTS fix_rules (
    fix_id INTEGER PRIMARY KEY AUTOINCREMENT,
    condition TEXT,              -- e.g., 'aflatoxin_high', 'lab_untrusted'
    action TEXT,                 -- e.g., 'retest', 'switch_lab', 'apply_certification'
    cost_usd FLOAT,
    risk_reduction FLOAT,        -- 0..1, proportionate reduction in risk_score
    prerequisites TEXT[],        -- array of fix_ids that must be applied first
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Fix plan log for auditing
CREATE TABLE IF NOT EXISTS fix_plan_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shipment_id TEXT,
    fix_sequence JSONB,          -- ordered array of actions applied
    total_cost FLOAT,
    total_risk_reduction FLOAT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Actor behavior patterns for adversarial detection
CREATE TABLE IF NOT EXISTS actor_behavior_patterns (
    actor_id TEXT,
    actor_type TEXT,                -- exporter | lab | port
    pattern_type TEXT,              -- e.g., 'lab_rotation', 'batch_splitting', 'near_threshold_submission'
    pattern_count INT DEFAULT 0,    -- how many times detected
    last_detected TIMESTAMP,
    risk_multiplier FLOAT DEFAULT 1.0,  -- scales shipment risk_score
    notes TEXT
);

-- Suspicious shipments log
CREATE TABLE IF NOT EXISTS suspicious_shipments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shipment_id TEXT,
    actor_id TEXT,
    detected_patterns JSONB,
    penalty_applied BOOLEAN DEFAULT FALSE,
    risk_multiplier FLOAT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_outcomes_shipment ON shipment_outcomes(shipment_id);
CREATE INDEX IF NOT EXISTS idx_outcomes_actual ON shipment_outcomes(actual_outcome);
CREATE INDEX IF NOT EXISTS idx_outcomes_timestamp ON shipment_outcomes(timestamp);
CREATE INDEX IF NOT EXISTS idx_fix_rules_condition ON fix_rules(condition);
CREATE INDEX IF NOT EXISTS idx_actor_patterns_actor ON actor_behavior_patterns(actor_id, actor_type);
CREATE INDEX IF NOT EXISTS idx_suspicious_shipments ON suspicious_shipments(shipment_id);

-- Insert sample fix rules (matching spec)
INSERT OR IGNORE INTO fix_rules (condition, action, cost_usd, risk_reduction, prerequisites) VALUES
  ('aflatoxin_high', 'retest', 120, 0.4, NULL),
  ('lab_untrusted', 'switch_lab', 200, 0.3, NULL),
  ('document_expired', 'renew_document', 150, 0.5, NULL),
  ('traceability_gap', 'enhance_traceability', 300, 0.6, NULL),
  ('mrl_near_limit', 'alternative_lab', 180, 0.35, NULL),
  ('rasff_alert', 'additional_inspection', 250, 0.45, NULL),
  ('country_high_risk', 'enhanced_documentation', 100, 0.25, NULL),
  ('exporter_new', 'manual_review', 0, 0.1, NULL),
  ('certificate_missing', 'obtain_certificate', 400, 0.55, NULL),
  ('origin_unclear', 'verify_origin', 220, 0.42, NULL),
  ('phytosanitary_concern', 'extra_fumigation', 350, 0.38, NULL),
  ('weight_discrepancy', 'reweigh', 50, 0.15, NULL);

-- End Ground Truth Schema
