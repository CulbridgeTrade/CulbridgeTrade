CREATE TABLE IF NOT EXISTS evaluation_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_id TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  status TEXT CHECK(status IN ('PASS', 'WARNING', 'BLOCKER', 'FAIL')) NOT NULL,
  input_snapshot TEXT NOT NULL,  -- JSON string
  message TEXT,
  evaluated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  rule_version TEXT DEFAULT 'v1.0',
  FOREIGN KEY (shipment_id) REFERENCES Shipments(id) ON DELETE CASCADE
);

CREATE INDEX idx_eval_events_shipment ON evaluation_events(shipment_id);
CREATE INDEX idx_eval_events_time ON evaluation_events(evaluated_at);
CREATE INDEX idx_eval_events_status ON evaluation_events(status);

-- Sample insert
INSERT OR IGNORE INTO evaluation_events (shipment_id, rule_id, status, input_snapshot, message, rule_version) VALUES
('test-shp-001', 'HS_CODE_MISSING', 'FAIL', '{"hsCode":null}', 'HS Code required', 'v1.0');
