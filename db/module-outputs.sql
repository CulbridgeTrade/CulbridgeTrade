-- Module Output Capture Tables for Headless Results API

-- Central table for ALL module outputs (immutable after signature)
CREATE TABLE IF NOT EXISTS ShipmentModuleResults (
  shipment_id TEXT NOT NULL,
  module TEXT NOT NULL,
  output TEXT NOT NULL,  -- JSON stringified
  deterministic_flag BOOLEAN NOT NULL DEFAULT 1,
  verified_deterministic BOOLEAN NOT NULL DEFAULT 1,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  immutable BOOLEAN DEFAULT 0,
  PRIMARY KEY (shipment_id, module)
);
CREATE INDEX IF NOT EXISTS idx_shipment_module ON ShipmentModuleResults (shipment_id, module);
CREATE INDEX IF NOT EXISTS idx_shipment_timestamp ON ShipmentModuleResults (shipment_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_deterministic ON ShipmentModuleResults (deterministic_flag, verified_deterministic);

-- NSW ESB Submission & Webhook Events (C100 -> C105)
CREATE TABLE IF NOT EXISTS NSWWebhookEvents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_id TEXT NOT NULL,
  sgd_number TEXT,
  event_type TEXT NOT NULL,  -- cargo_arrived, scanning_complete, exit_note etc.
  submission_status TEXT,    -- ACCEPTED/REJECTED/PENDING
  priority_lane TEXT,
  status TEXT,
  port_event JSON,
  raw_payload TEXT,
  received_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_nsw_shipment ON NSWWebhookEvents (shipment_id);
CREATE INDEX IF NOT EXISTS idx_nsw_status ON NSWWebhookEvents (submission_status);
CREATE INDEX IF NOT EXISTS idx_nsw_time ON NSWWebhookEvents (received_at);

-- Extend EventLog for actor/outcome if exists
CREATE TABLE IF NOT EXISTS EventLog (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ShipmentID TEXT,
  EventType TEXT,
  Data TEXT,
  actor TEXT,
  outcome TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5-year retention policy trigger (manual cron for now)
-- DELETE FROM ShipmentModuleResults WHERE timestamp < date('now', '-5 years');

-- Sample data for testing
INSERT OR REPLACE INTO ShipmentModuleResults (shipment_id, module, output, deterministic_flag, verified_deterministic) VALUES
('TEST-SHIP001', 'HSCodeValidator', '{"validated_hs_code":"12074000","confidence":98.5,"mapping":"Sesame seeds cleaned","alternatives":[]}', 1, 1),
('TEST-SHIP001', 'FeeCalculator', '{"total_estimated_costs":250000,"nes_levy":50000,"duty":150000,"agency_fees":50000,"payment_ref":"PAY-TEST001"}', 1, 1),
('TEST-SHIP001', 'CleanDeclarationBuilder', '{"culbridge_ref":"CUL-TEST-SHIP001-1234567890","priority_lane":"STANDARD","verified_deterministic":true}', 1, 1),
('TEST-SHIP001', 'DigitalSignatureModule', '{"payload_hash":"sha256:abc123...","digital_signature":"sigvalue...","signer_identity":"AGENT-001","certificate_authority":"DigitalJewels-CA"}', 1, 1);

INSERT OR REPLACE INTO NSWWebhookEvents (shipment_id, sgd_number, event_type, submission_status, priority_lane, status) VALUES
('TEST-SHIP001', 'SGD123456789', 'submission_received', 'ACCEPTED', 'STANDARD', 'C102'),
('TEST-SHIP001', 'SGD123456789', 'scanning_completed', 'CLEAR', 'STANDARD', 'C104');

-- Mark complete pipeline immutable
UPDATE ShipmentModuleResults SET immutable = 1 WHERE shipment_id = 'TEST-SHIP001';

