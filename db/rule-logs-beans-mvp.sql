-- Rule Logs & Audit Layer - Beans MVP NL/DE
-- Immutable deterministic logging for brown/white beans enforcement

CREATE TABLE IF NOT EXISTS beans_rule_logs (
  log_id INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_id TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  result VARCHAR(10) NOT NULL CHECK (result IN ('PASS', 'FAIL')),
  reason TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  immutable_snapshot JSON NOT NULL,
  rule_engine_version VARCHAR(20) DEFAULT '1.0-beans-mvp'
);

-- Indexes for audit queries
CREATE INDEX idx_beans_logs_shipment ON beans_rule_logs(shipment_id);
CREATE INDEX idx_beans_logs_rule ON beans_rule_logs(rule_id);
CREATE INDEX idx_beans_logs_result ON beans_rule_logs(result, timestamp);

-- API retrieval view for internal audit
CREATE VIEW beans_audit_summary AS
SELECT 
  shipment_id,
  COUNT(*) as total_rules,
  SUM(CASE WHEN result = 'FAIL' THEN 1 ELSE 0 END) as failures,
  GROUP_CONCAT(reason) as failure_reasons,
  MAX(timestamp) as last_evaluation
FROM beans_rule_logs 
GROUP BY shipment_id;

-- Sample log entry insert (for testing)
INSERT OR IGNORE INTO beans_rule_logs (shipment_id, rule_id, result, reason, immutable_snapshot) VALUES
('BEANS-SH001', 'RULE_AF_TOTAL', 'FAIL', 'aflatoxin_total exceeds EU MRL', '{"aflatoxin_total":35.2,"shipment_id":"BEANS-SH001"}');


