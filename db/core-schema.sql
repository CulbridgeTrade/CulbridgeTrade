-- =====================================================
-- Culbridge Core Schema (Normalized, Minimal, Enforceable)
-- Version: 1.0
-- Purpose: State transitions + evidence + rule outputs
-- =====================================================

-- =====================================================
-- Core: Shipments
-- =====================================================

CREATE TABLE IF NOT EXISTS shipments (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    final_outcome TEXT,
    rules_version TEXT DEFAULT 'v1',
    exporter_id TEXT,
    assigned_officer TEXT,
    priority_flag TEXT DEFAULT 'NORMAL' CHECK (priority_flag IN ('NORMAL', 'HIGH', 'URGENT')),
    fraud_status TEXT DEFAULT 'CLEAN' CHECK (fraud_status IN ('CLEAN', 'FLAGGED', 'FRAUD_HOLD', 'FRAUD_SUSPECTED')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_shipments_status ON shipments(status);
CREATE INDEX idx_shipments_updated ON shipments(updated_at);

-- =====================================================
-- Core: Commodity Data
-- =====================================================

CREATE TABLE IF NOT EXISTS shipment_commodity (
    shipment_id TEXT PRIMARY KEY REFERENCES shipments(id) ON DELETE CASCADE,
    description TEXT,
    hs_code TEXT,
    hs_code_confidence REAL,
    commodity_type TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
);

-- =====================================================
-- Core: Entity (Exporter/Agent)
-- =====================================================

CREATE TABLE IF NOT EXISTS shipment_entity (
    shipment_id TEXT PRIMARY KEY REFERENCES shipments(id) ON DELETE CASCADE,
    exporter_id TEXT,
    exporter_name TEXT,
    exporter_verified INTEGER DEFAULT 0,
    agent_id TEXT,
    agent_name TEXT,
    agent_verified INTEGER DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now'))
);

-- =====================================================
-- Core: Destination
-- =====================================================

CREATE TABLE IF NOT EXISTS shipment_destination (
    shipment_id TEXT PRIMARY KEY REFERENCES shipments(id) ON DELETE CASCADE,
    country_code TEXT,
    country_name TEXT,
    port_code TEXT,
    port_name TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
);

-- =====================================================
-- Core: Documents
-- =====================================================

CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    file_name TEXT,
    storage_path TEXT,
    hash TEXT,
    mime_type TEXT,
    size_bytes INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_documents_hash ON documents(hash);

-- =====================================================
-- Core: Shipment Documents Junction
-- =====================================================

CREATE TABLE IF NOT EXISTS shipment_documents (
    id TEXT PRIMARY KEY,
    shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    status TEXT DEFAULT 'UPLOADED',
    rejection_reason TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    verified_at TEXT,
    verified_by TEXT,
    fraud_status TEXT DEFAULT 'UNREVIEWED' CHECK (fraud_status IN ('UNREVIEWED', 'CLEARED', 'FLAGGED', 'CONFIRMED_FRAUD')),
    fraud_flags JSON,
    fraud_reviewed_by TEXT,
    fraud_reviewed_at TEXT,
    fraud_review_notes TEXT
);

CREATE INDEX idx_shipment_documents_shipment ON shipment_documents(shipment_id);
CREATE INDEX idx_shipment_documents_type ON shipment_documents(type);
CREATE INDEX idx_shipment_documents_status ON shipment_documents(status);

-- =====================================================
-- Core: Compliance Flags
-- =====================================================

CREATE TABLE IF NOT EXISTS compliance_flags (
    id TEXT PRIMARY KEY,
    shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'BLOCKER')),
    message TEXT NOT NULL,
    module TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_compliance_flags_shipment ON compliance_flags(shipment_id);
CREATE INDEX idx_compliance_flags_severity ON compliance_flags(severity);
CREATE INDEX idx_compliance_flags_code ON compliance_flags(code);

-- =====================================================
-- Core: Fees
-- =====================================================

CREATE TABLE IF NOT EXISTS fees (
    id TEXT PRIMARY KEY,
    shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'NGN',
    processing_days INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_fees_shipment ON fees(shipment_id);

-- =====================================================
-- Core: Submissions (Idempotency)
-- =====================================================

CREATE TABLE IF NOT EXISTS submissions (
    id TEXT PRIMARY KEY,
    shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
    submission_token TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'PENDING',
    sgd_number TEXT,
    external_response JSON,
    created_at TEXT DEFAULT (datetime('now')),
    submitted_at TEXT
);

CREATE INDEX idx_submissions_shipment ON submissions(shipment_id);
CREATE INDEX idx_submissions_token ON submissions(submission_token);
CREATE INDEX idx_submissions_sgd ON submissions(sgd_number);

-- =====================================================
-- Feedback Loop Engine: Feedback Events
-- =====================================================

CREATE TABLE IF NOT EXISTS feedback_events (
    id TEXT PRIMARY KEY,
    shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (event_type IN ('DECISION_ACCURACY', 'OUTCOME', 'FIX_RESULT')),
    value TEXT NOT NULL CHECK (value IN ('TRUE_POSITIVE', 'FALSE_POSITIVE', 'FALSE_NEGATIVE', 'CLEARED', 'DELAYED', 'REJECTED', 'FIX_SUCCESS', 'FIX_FAILED')),
    metadata JSON,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_feedback_events_shipment ON feedback_events(shipment_id);
CREATE INDEX idx_feedback_events_type ON feedback_events(event_type);
CREATE INDEX idx_feedback_events_value ON feedback_events(value);

-- =====================================================
-- Core: Audit Logs (Immutable)
-- =====================================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    shipment_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    actor_id TEXT,
    actor_name TEXT,
    actor_role TEXT,
    details JSON,
    previous_state JSON,
    new_state JSON,
    hash TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_audit_shipment ON audit_logs(shipment_id);
CREATE INDEX idx_audit_event ON audit_logs(event_type);
CREATE INDEX idx_audit_created ON audit_logs(created_at);
CREATE INDEX idx_audit_actor ON audit_logs(actor_id);

-- =====================================================
-- Computed: Shipment Status View
-- =====================================================

CREATE VIEW IF NOT EXISTS shipment_status AS
SELECT 
    s.id,
    s.status,
    s.created_at,
    s.updated_at,
    sc.hs_code,
    sc.commodity_type,
    se.exporter_name,
    sd.country_name as destination,
    COUNT(DISTINCT cf.id) as flag_count,
    SUM(CASE WHEN cf.severity = 'BLOCKER' THEN 1 ELSE 0 END) as blocker_count,
    SUM(CASE WHEN cf.severity = 'WARNING' THEN 1 ELSE 0 END) as warning_count
FROM shipments s
LEFT JOIN shipment_commodity sc ON s.id = sc.shipment_id
LEFT JOIN shipment_entity se ON s.id = se.shipment_id
LEFT JOIN shipment_destination sd ON s.id = sd.shipment_id
LEFT JOIN compliance_flags cf ON s.id = cf.shipment_id
GROUP BY s.id;

-- =====================================================
-- Computed: Compliance Summary View
-- =====================================================

CREATE VIEW IF NOT EXISTS compliance_summary AS
SELECT 
    s.id as shipment_id,
    CASE 
        WHEN SUM(CASE WHEN cf.severity = 'BLOCKER' THEN 1 ELSE 0 END) > 0 THEN 'BLOCKER'
        WHEN SUM(CASE WHEN cf.severity = 'WARNING' THEN 1 ELSE 0 END) > 0 THEN 'WARNING'
        WHEN COUNT(cf.id) > 0 THEN 'INFO'
        ELSE 'PASS'
    END as compliance_status,
    COUNT(DISTINCT cf.id) as total_flags,
    COUNT(DISTINCT sd.id) as doc_count,
    COUNT(DISTINCT CASE WHEN sd.status = 'VALID' THEN sd.id END) as valid_doc_count
FROM shipments s
LEFT JOIN compliance_flags cf ON s.id = cf.shipment_id
LEFT JOIN shipment_documents sd ON s.id = sd.shipment_id
GROUP BY s.id;

-- =====================================================
-- Function: Log Audit Event
-- =====================================================

CREATE FUNCTION IF NOT EXISTS log_audit(
    p_shipment_id TEXT,
    p_event_type TEXT,
    p_actor_id TEXT,
    p_actor_name TEXT,
    p_actor_role TEXT,
    p_details JSON,
    p_prev_state JSON,
    p_new_state JSON
) RETURNS TEXT
BEGIN
    DECLARE v_id TEXT;
    DECLARE v_hash TEXT;
    DECLARE v_timestamp TEXT;
    
    SET v_id = lower(hex(randomblob(16)));
    SET v_timestamp = datetime('now');
    SET v_hash = lower(hex(sha256(
        p_shipment_id || p_event_type || COALESCE(p_actor_id, '') || v_timestamp || COALESCE(p_details, '')
    )));
    
    INSERT INTO audit_logs (id, shipment_id, event_type, actor_id, actor_name, actor_role, details, previous_state, new_state, hash, created_at)
    VALUES (v_id, p_shipment_id, p_event_type, p_actor_id, p_actor_name, p_actor_role, p_details, p_prev_state, p_new_state, v_hash, v_timestamp);
    
    RETURN v_id;
END;

-- =====================================================
-- Function: Get Shipment Full State
-- =====================================================

CREATE FUNCTION IF NOT EXISTS get_shipment_full(p_shipment_id TEXT) RETURNS JSON
BEGIN
    DECLARE RESULT JSON;
    
    SELECT json_object(
        'id', s.id,
        'status', s.status,
        'created_at', s.created_at,
        'updated_at', s.updated_at,
        'commodity', (
            SELECT json_object(
                'description', sc.description,
                'hs_code', sc.hs_code,
                'hs_code_confidence', sc.hs_code_confidence,
                'commodity_type', sc.commodity_type
            ) FROM shipment_commodity sc WHERE sc.shipment_id = s.id
        ),
        'entity', (
            SELECT json_object(
                'exporter_id', se.exporter_id,
                'exporter_name', se.exporter_name,
                'exporter_verified', se.exporter_verified,
                'agent_id', se.agent_id,
                'agent_name', se.agent_name
            ) FROM shipment_entity se WHERE se.shipment_id = s.id
        ),
        'destination', (
            SELECT json_object(
                'country_code', sd.country_code,
                'country_name', sd.country_name,
                'port_code', sd.port_code,
                'port_name', sd.port_name
            ) FROM shipment_destination sd WHERE sd.shipment_id = s.id
        ),
        'documents', (
            SELECT json_group_array(
                json_object(
                    'id', sd.id,
                    'type', sd.type,
                    'status', sd.status,
                    'rejection_reason', sd.rejection_reason,
                    'created_at', sd.created_at
                )
            ) FROM shipment_documents sd WHERE sd.shipment_id = s.id
        ),
        'compliance_flags', (
            SELECT json_group_array(
                json_object(
                    'id', cf.id,
                    'code', cf.code,
                    'severity', cf.severity,
                    'message', cf.message,
                    'module', cf.module
                )
            ) FROM compliance_flags cf WHERE cf.shipment_id = s.id
        ),
        'fees', (
            SELECT json_group_array(
                json_object(
                    'id', f.id,
                    'name', f.name,
                    'amount', f.amount,
                    'currency', f.currency
                )
            ) FROM fees f WHERE f.shipment_id = s.id
        ),
        'audit_log_count', (SELECT COUNT(*) FROM audit_logs al WHERE al.shipment_id = s.id)
    ) INTO RESULT
    FROM shipments s
    WHERE s.id = p_shipment_id;
    
    RETURN RESULT;
END;

-- =====================================================
-- Sample Data
-- =====================================================

INSERT OR IGNORE INTO shipments (id, status) VALUES ('shp_001', 'DRAFT');
INSERT OR IGNORE INTO shipment_commodity (shipment_id, description, hs_code, hs_code_confidence, commodity_type)
VALUES ('shp_001', 'Raw cocoa beans for export', '180100', 0.95, 'cocoa');
INSERT OR IGNORE INTO shipment_entity (shipment_id, exporter_name, exporter_verified)
VALUES ('shp_001', 'Acme Export Ltd', 1);
INSERT OR IGNORE INTO shipment_destination (shipment_id, country_code, country_name)
VALUES ('shp_001', 'NL', 'Netherlands');

INSERT OR IGNORE INTO shipments (id, status) VALUES ('shp_002', 'DRAFT');
INSERT OR IGNORE INTO shipment_commodity (shipment_id, description, hs_code, hs_code_confidence, commodity_type)
VALUES ('shp_002', 'Sesame seeds for export', '120740', 0.88, 'sesame');
INSERT OR IGNORE INTO shipment_entity (shipment_id, exporter_name, exporter_verified)
VALUES ('shp_002', 'Kano Agro Ltd', 1);
INSERT OR IGNORE INTO shipment_destination (shipment_id, country_code, country_name)
VALUES ('shp_002', 'NL', 'Netherlands');

-- Audit log samples
INSERT OR IGNORE INTO audit_logs (id, shipment_id, event_type, actor_name, actor_role, details, created_at)
VALUES 
('evt_001', 'shp_001', 'SHIPMENT_CREATED', 'system', 'SYSTEM', '{"source": "user_form"}', datetime('now')),
('evt_002', 'shp_001', 'COMMODITY_UPDATED', 'system', 'SYSTEM', '{"field": "hs_code", "value": "180100"}', datetime('now'));

-- =====================================================
-- Pipeline State Machine (Infrastructure-Grade Enforcement)
-- =====================================================

CREATE TABLE IF NOT EXISTS shipment_pipeline_state (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shipment_id TEXT NOT NULL,
    current_state TEXT NOT NULL,
    previous_state TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(shipment_id)
);

CREATE TABLE IF NOT EXISTS pipeline_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shipment_id TEXT NOT NULL,
    action TEXT NOT NULL,
    target_state TEXT,
    from_state TEXT,
    outcome TEXT NOT NULL,
    details JSON,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_pipeline_shipment ON shipment_pipeline_state(shipment_id);
CREATE INDEX idx_pipeline_audit_shipment ON pipeline_audit_log(shipment_id);

-- =====================================================
-- Execution Tracking (Real-world action confirmation)
-- =====================================================

CREATE TABLE IF NOT EXISTS execution_tracking (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shipment_id TEXT NOT NULL,
    step_name TEXT NOT NULL,
    action_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    scheduled_at DATETIME,
    started_at DATETIME,
    completed_at DATETIME,
    failed_at DATETIME,
    failure_reason TEXT,
    output_data JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_execution_shipment ON execution_tracking(shipment_id);
CREATE INDEX idx_execution_status ON execution_tracking(status);

-- =====================================================
-- Validity Windows (Time-sensitive compliance)
-- =====================================================

CREATE TABLE IF NOT EXISTS validity_windows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shipment_id TEXT NOT NULL,
    document_type TEXT NOT NULL,
    window_type TEXT NOT NULL,
    valid_from DATETIME,
    valid_until DATETIME,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_validity_shipment ON validity_windows(shipment_id);
CREATE INDEX idx_validity_dates ON validity_windows(valid_from, valid_until);

-- =====================================================
-- Agent Override Detection
-- =====================================================

CREATE TABLE IF NOT EXISTS override_detections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shipment_id TEXT NOT NULL,
    system_output JSON NOT NULL,
    override_action TEXT NOT NULL,
    override_reason TEXT,
    risk_impact JSON,
    detected_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_override_shipment ON override_detections(shipment_id);

-- =====================================================
-- Port Intelligence (Rotterdam vs Hamburg nuances)
-- =====================================================

CREATE TABLE IF NOT EXISTS port_intelligence (
    port_code TEXT PRIMARY KEY,
    port_name TEXT NOT NULL,
    country_code TEXT NOT NULL,
    inspection_probability REAL DEFAULT 0.5,
    strictness_level TEXT DEFAULT 'MEDIUM',
    avg_clearance_days INTEGER DEFAULT 3,
    specific_requirements JSON,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert port intelligence data
INSERT OR IGNORE INTO port_intelligence (port_code, port_name, country_code, inspection_probability, strictness_level, avg_clearance_days)
VALUES 
('NLRTM', 'Rotterdam', 'NL', 0.45, 'MEDIUM', 2),
('DEHAM', 'Hamburg', 'DE', 0.55, 'HIGH', 4),
('BEANR', 'Antwerp', 'BE', 0.50, 'MEDIUM', 3);

-- =====================================================
-- Rule Versioning (Addendum 1)
-- =====================================================

CREATE TABLE IF NOT EXISTS rule_versions (
    rule_id TEXT PRIMARY KEY,
    rule_version TEXT NOT NULL,
    effective_from DATE NOT NULL,
    deprecated INTEGER DEFAULT 0,
    deprecated_on DATE,
    deprecated_reason TEXT,
    superseded_by TEXT,
    source TEXT,
    confidence TEXT DEFAULT 'high',
    last_verified DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rule_audit_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shipment_id TEXT NOT NULL,
    evaluated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    rules_applied JSON NOT NULL,
    UNIQUE(shipment_id, evaluated_at)
);

-- =====================================================
-- Lab Accreditation Registry (Addendum 4)
-- =====================================================

CREATE TABLE IF NOT EXISTS accredited_labs (
    lab_id TEXT PRIMARY KEY,
    lab_name TEXT NOT NULL,
    accreditation_number TEXT NOT NULL,
    country TEXT NOT NULL,
    accreditation_body TEXT,
    valid_until DATE,
    products_covered JSON,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert accredited labs
INSERT OR IGNORE INTO accredited_labs (lab_id, lab_name, accreditation_number, country, accreditation_body, valid_until, products_covered, active)
VALUES 
('LAB_NEPC_001', 'Nigerian Export Promotion Council Laboratory', 'ISO17025-2024-001', 'NG', 'SON', '2026-12-31', '["cocoa_beans", "sesame", "ginger"]', 1),
('LAB_SGS_001', 'SGS Nigeria Ltd', 'ISO17025-2023-089', 'NG', 'SON', '2026-06-30', '["cocoa_beans", "sesame"]', 1),
('LAB_EU_001', 'Eurofins Scientific', 'ISO17025-ENAC-042', 'NL', 'ENAC', '2027-03-31', '["cocoa_beans", "sesame", "ginger", "groundnuts"]', 1);

-- =====================================================
-- Shipment Outcome Classification (Addendum 6)
-- =====================================================

CREATE TABLE IF NOT EXISTS shipment_outcomes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shipment_id TEXT NOT NULL,
    outcome TEXT NOT NULL,
    outcome_classification TEXT CHECK (outcome_classification IN ('RULE_FAILURE', 'EXPORTER_ERROR', 'SYSTEM_ERROR')),
    classified_by TEXT,
    classified_at DATETIME,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_outcomes_shipment ON shipment_outcomes(shipment_id);
CREATE INDEX idx_outcomes_classification ON shipment_outcomes(outcome_classification);

-- =====================================================
-- Fraud Detection Tables
-- =====================================================

CREATE TABLE IF NOT EXISTS fraud_audit_log (
    id TEXT PRIMARY KEY,
    shipment_id TEXT,
    document_id TEXT,
    event_type TEXT,
    decision TEXT,
    actor_id TEXT,
    discovered_by TEXT,
    discovery_method TEXT,
    notes TEXT,
    details JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_fraud_audit_shipment ON fraud_audit_log(shipment_id);
CREATE INDEX idx_fraud_audit_document ON fraud_audit_log(document_id);

CREATE TABLE IF NOT EXISTS fraud_reports (
    id TEXT PRIMARY KEY,
    shipment_id TEXT NOT NULL,
    exporter_id TEXT NOT NULL,
    report_data JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_fraud_reports_shipment ON fraud_reports(shipment_id);
CREATE INDEX idx_fraud_reports_exporter ON fraud_reports(exporter_id);

CREATE TABLE IF NOT EXISTS fraud_suspect_exporter (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exporter_id TEXT NOT NULL,
    flag_reason TEXT,
    document_id TEXT,
    flagged_by TEXT,
    flagged_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'ACTIVE'
);

CREATE INDEX idx_fraud_exporter ON fraud_suspect_exporter(exporter_id);
CREATE INDEX idx_fraud_exporter_status ON fraud_suspect_exporter(status);

-- =====================================================
-- Exporter Accounts
-- =====================================================

CREATE TABLE IF NOT EXISTS exporter_accounts (
    id TEXT PRIMARY KEY,
    exporter_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    address TEXT,
    country TEXT DEFAULT 'NG',
    status TEXT DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DEACTIVATED')),
    fraud_status TEXT DEFAULT 'CLEAN' CHECK (fraud_status IN ('CLEAN', 'FLAGGED', 'FRAUD_SUSPECTED', 'CONFIRMED_FRAUD')),
    fraud_flagged_at TEXT,
    fraud_flagged_reason TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_exporter_email ON exporter_accounts(email);
CREATE INDEX idx_exporter_status ON exporter_accounts(status);
CREATE INDEX idx_exporter_fraud ON exporter_accounts(fraud_status);

CREATE TABLE IF NOT EXISTS feedback_loop_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_id TEXT NOT NULL,
    total_evaluated INTEGER DEFAULT 0,
    total_failures INTEGER DEFAULT 0,
    failure_rate REAL DEFAULT 0,
    current_confidence TEXT DEFAULT 'high',
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_feedback_metrics_rule ON feedback_loop_metrics(rule_id);

-- =====================================================
-- Pending Review Queue
-- =====================================================

CREATE TABLE IF NOT EXISTS pending_review_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shipment_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    triggered_by_rule TEXT,
    triggered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    reviewed_by TEXT,
    reviewed_at DATETIME,
    review_decision TEXT CHECK (review_decision IN ('APPROVED', 'REJECTED', 'PENDING')),
    review_notes TEXT
);

CREATE INDEX idx_pending_review_shipment ON pending_review_queue(shipment_id);
CREATE INDEX idx_pending_review_status ON pending_review_queue(review_decision);