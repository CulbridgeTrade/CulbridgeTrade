-- Culbridge MVP Database Schema
-- SQLite - Deterministic Rule Engine supporting tables

-- Labs table: Approved labs whitelist, ISO 17025, tier, risk_score
CREATE TABLE IF NOT EXISTS Labs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  iso_17025 BOOLEAN NOT NULL DEFAULT FALSE,
  tier INTEGER NOT NULL CHECK (tier IN (1,2,3)),
  risk_score INTEGER DEFAULT 100 CHECK (risk_score BETWEEN 0 AND 100),
  country TEXT DEFAULT 'NG',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_labs_tier ON Labs(tier);
CREATE INDEX IF NOT EXISTS idx_labs_iso ON Labs(iso_17025);

-- Shipments table: Core shipment metadata
CREATE TABLE IF NOT EXISTS Shipments (
  id TEXT PRIMARY KEY,
  exporter_id TEXT NOT NULL,
  product TEXT NOT NULL,  -- e.g. 'sesame', 'cocoa'
  category TEXT NOT NULL, -- e.g. 'agro-export'
  destination TEXT NOT NULL, -- e.g. 'NL', 'DE'
  batch_number TEXT NOT NULL,
  production_date DATE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ShipmentDocuments table: Documents linked to shipments
CREATE TABLE IF NOT EXISTS ShipmentDocuments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_id TEXT NOT NULL,
  doc_type TEXT NOT NULL, -- 'lab_report', 'coa', 'phytosanitary', 'origin'
  lab_id INTEGER,
  file_hash TEXT,
  status TEXT DEFAULT 'pending', -- 'verified', 'expired', 'rejected'
  expiry_date DATE,
  upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shipment_id) REFERENCES Shipments(id),
  FOREIGN KEY (lab_id) REFERENCES Labs(id)
);

CREATE INDEX IF NOT EXISTS idx_docs_shipment ON ShipmentDocuments(shipment_id);
CREATE INDEX IF NOT EXISTS idx_docs_type ON ShipmentDocuments(doc_type);

-- ShipmentEvaluations table: Deterministic evaluation results
CREATE TABLE IF NOT EXISTS ShipmentEvaluations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_id TEXT NOT NULL,
  status TEXT NOT NULL, -- 'SAFE', 'WARNING', 'HIGH_RISK', 'BLOCKED'
  health_score INTEGER NOT NULL CHECK (health_score BETWEEN 0 AND 100),
  confidence_level TEXT NOT NULL, -- 'HIGH', 'MEDIUM', 'LOW'
  blockers TEXT, -- JSON array
  critical_issues TEXT, -- JSON array
  warnings TEXT, -- JSON array
  verified TEXT, -- JSON array
  evaluated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shipment_id) REFERENCES Shipments(id)
);

CREATE INDEX IF NOT EXISTS idx_eval_shipment ON ShipmentEvaluations(shipment_id);

-- Enhanced RuleLogs - Immutable Audit MVP (Culbridge spec)
CREATE TABLE IF NOT EXISTS RuleLogs (
  log_id INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_id TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('HARD_BLOCKER', 'CRITICAL', 'MODERATE', 'TRUST_BOOSTER')),
  result TEXT NOT NULL CHECK (result IN ('PASS', 'FAIL', 'BLOCKED')),
  reason TEXT NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  lab_batch_number TEXT NOT NULL,
  document_source TEXT NOT NULL,
  previous_score INTEGER NOT NULL DEFAULT 100,
  new_score INTEGER NOT NULL CHECK (new_score BETWEEN 0 AND 100),
  country TEXT NOT NULL DEFAULT 'NL',
  immutable_hash TEXT NOT NULL,
  FOREIGN KEY (shipment_id) REFERENCES Shipments(id)
);

CREATE INDEX IF NOT EXISTS idx_rulelog_shipment ON RuleLogs(shipment_id);
CREATE INDEX IF NOT EXISTS idx_rulelog_batch ON RuleLogs(lab_batch_number);
CREATE INDEX IF NOT EXISTS idx_rulelog_country ON RuleLogs(country);
CREATE INDEX IF NOT EXISTS idx_rulelog_rule ON RuleLogs(rule_id);

-- =============================================
-- MODULE OUTPUT CAPTURE TABLES (Deterministic Flags)
-- =============================================

-- ShipmentModuleResults: Stores outputs from all modules before downstream merge
CREATE TABLE IF NOT EXISTS ShipmentModuleResults (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_id TEXT NOT NULL,
  module TEXT NOT NULL CHECK (module IN (
    'hs_code_validator',
    'document_vault',
    'entity_sync',
    'compliance_engine',
    'fee_calculator',
    'clean_declaration_builder',
    'digital_signature',
    'nsw_esb_submission',
    'webhook_listener',
    'audit_logger'
  )),
  output TEXT NOT NULL, -- JSON blob
  deterministic_flag BOOLEAN NOT NULL DEFAULT FALSE,
  verified_deterministic BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT DEFAULT 'system',
  FOREIGN KEY (shipment_id) REFERENCES Shipments(id)
);

CREATE INDEX IF NOT EXISTS idx_mod_results_shipment ON ShipmentModuleResults(shipment_id);
CREATE INDEX IF NOT EXISTS idx_mod_results_module ON ShipmentModuleResults(module);
CREATE INDEX IF NOT EXISTS idx_mod_results_deterministic ON ShipmentModuleResults(deterministic_flag);

-- HS Code Validator outputs
CREATE TABLE IF NOT EXISTS HSCodeValidationResults (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_id TEXT NOT NULL,
  validated_hs_code TEXT NOT NULL,
  hs_mapping TEXT NOT NULL, -- JSON: chapter, heading, subheading
  commodity_description TEXT NOT NULL,
  deterministic_flag BOOLEAN NOT NULL DEFAULT TRUE,
  validated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shipment_id) REFERENCES Shipments(id)
);

CREATE INDEX IF NOT EXISTS idx_hs_shipment ON HSCodeValidationResults(shipment_id);

-- Document Vault outputs (certificates, NAQS, NEPC, NAFDAC, SON references)
CREATE TABLE IF NOT EXISTS DocumentVaultResults (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_id TEXT NOT NULL,
  certificates TEXT NOT NULL, -- JSON array
  naqs_reference TEXT,
  nepc_reference TEXT,
  nafdac_reference TEXT,
  son_reference TEXT,
  deterministic_flag BOOLEAN NOT NULL DEFAULT TRUE,
  stored_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shipment_id) REFERENCES Shipments(id)
);

CREATE INDEX IF NOT EXISTS idx_doc_vault_shipment ON DocumentVaultResults(shipment_id);

-- Entity Sync outputs (TIN, RC, CAC, AEO status)
CREATE TABLE IF NOT EXISTS EntitySyncResults (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_id TEXT NOT NULL,
  tin TEXT NOT NULL,
  rc_number TEXT,
  cac_reference TEXT,
  aeo_status TEXT CHECK (aeo_status IN ('ACTIVE', 'EXPIRED', 'SUSPENDED', 'NOT_APPLICABLE')),
  aeo_expiry_date DATE,
  deterministic_flag BOOLEAN NOT NULL DEFAULT TRUE,
  synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shipment_id) REFERENCES Shipments(id)
);

CREATE INDEX IF NOT EXISTS idx_entity_sync_shipment ON EntitySyncResults(shipment_id);

-- Compliance Engine outputs (EUDR, farm coordinates, residue limits, PADE)
CREATE TABLE IF NOT EXISTS ComplianceEngineResults (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_id TEXT NOT NULL,
  eudr_status TEXT CHECK (eudr_status IN ('COMPLIANT', 'NON_COMPLIANT', 'PENDING', 'NOT_APPLICABLE')),
  eudr_assessment TEXT, -- JSON with deforestation risk assessment
  farm_coordinates TEXT, -- JSON array of GeoJSON points
  farm_polygons TEXT, -- JSON array of GeoJSON polygons
  residue_limits TEXT, -- JSON with pesticide/mycotoxin limits
  pade_status TEXT,
  deterministic_flag BOOLEAN NOT NULL DEFAULT TRUE,
  evaluated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shipment_id) REFERENCES Shipments(id)
);

CREATE INDEX IF NOT EXISTS idx_compliance_shipment ON ComplianceEngineResults(shipment_id);

-- Fee Calculator outputs (NES levy, duty, agency fees, total_estimated_costs, payment_ref)
CREATE TABLE IF NOT EXISTS FeeCalculationResults (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_id TEXT NOT NULL,
  nes_levy REAL,
  duty REAL,
  agency_fees TEXT, -- JSON object
  total_estimated_costs REAL NOT NULL,
  payment_ref TEXT NOT NULL,
  currency TEXT DEFAULT 'NGN',
  exchange_rate REAL,
  deterministic_flag BOOLEAN NOT NULL DEFAULT TRUE,
  calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shipment_id) REFERENCES Shipments(id)
);

CREATE INDEX IF NOT EXISTS idx_fee_calc_shipment ON FeeCalculationResults(shipment_id);

-- Clean Declaration Builder outputs (JSON v2026.1 payload)
CREATE TABLE IF NOT EXISTS CleanDeclarationResults (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_id TEXT NOT NULL,
  payload_version TEXT DEFAULT '2026.1',
  payload TEXT NOT NULL, -- Full JSON v2026.1 declaration
  deterministic_flag BOOLEAN NOT NULL DEFAULT TRUE,
  built_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shipment_id) REFERENCES Shipments(id)
);

CREATE INDEX IF NOT EXISTS idx_clean_decl_shipment ON CleanDeclarationResults(shipment_id);

-- Digital Signature Module outputs
CREATE TABLE IF NOT EXISTS DigitalSignatureResults (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  digital_signature TEXT NOT NULL,
  signer_identity TEXT NOT NULL,
  certificate_serial TEXT,
  signed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shipment_id) REFERENCES Shipments(id)
);

CREATE INDEX IF NOT EXISTS idx_dig_sig_shipment ON DigitalSignatureResults(shipment_id);
CREATE INDEX IF NOT EXISTS idx_dig_sig_hash ON DigitalSignatureResults(payload_hash);

-- NSW ESB Submission outputs
CREATE TABLE IF NOT EXISTS NSWSubmissionResults (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_id TEXT NOT NULL,
  sgd_number TEXT,
  submission_status TEXT CHECK (submission_status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'DRAFT')),
  priority_lane TEXT CHECK (priority_lane IN ('GREEN', 'AMBER', 'RED')),
  rejection_reason TEXT,
  submitted_at DATETIME,
  response_received_at DATETIME,
  FOREIGN KEY (shipment_id) REFERENCES Shipments(id)
);

CREATE INDEX IF NOT EXISTS idx_nsw_sub_shipment ON NSWSubmissionResults(shipment_id);
CREATE INDEX IF NOT EXISTS idx_nsw_sgd ON NSWSubmissionResults(sgd_number);

-- Webhook Listener: Status events (C100 → C105)
CREATE TABLE IF NOT EXISTS NSWWebhookEvents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_id TEXT NOT NULL,
  event_type TEXT NOT NULL, -- C100, C101, C102, C103, C104, C105
  event_data TEXT, -- JSON payload from NSW
  received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  processed BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (shipment_id) REFERENCES Shipments(id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_shipment ON NSWWebhookEvents(shipment_id);
CREATE INDEX IF NOT EXISTS idx_webhook_event_type ON NSWWebhookEvents(event_type);

-- Audit Logger: Module executions, timestamp, actor, outcome
CREATE TABLE IF NOT EXISTS AuditLogs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_id TEXT,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('SUCCESS', 'FAILURE', 'WARNING')),
  details TEXT, -- JSON with additional context
  ip_address TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_shipment ON AuditLogs(shipment_id);
CREATE INDEX IF NOT EXISTS idx_audit_module ON AuditLogs(module);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON AuditLogs(timestamp);

-- =============================================
-- EVENT-DRIVEN ARCHITECTURE TABLES
-- =============================================

-- Event Bus: For triggering demurrage alerts, EEG timers, dashboard updates
CREATE TABLE IF NOT EXISTS EventBus (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  shipment_id TEXT,
  payload TEXT NOT NULL, -- JSON
  triggered_by TEXT NOT NULL,
  processed BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_event_bus_type ON EventBus(event_type);
CREATE INDEX IF NOT EXISTS idx_event_bus_shipment ON EventBus(shipment_id);

-- Demurrage Alerts
CREATE TABLE IF NOT EXISTS DemurrageAlerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_id TEXT NOT NULL,
  container_number TEXT,
  free_time_expiry DATETIME,
  daily_rate REAL,
  alert_sent BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shipment_id) REFERENCES Shipments(id)
);

-- EEG (Export Exit Certificate) Timers
CREATE TABLE IF NOT EXISTS EEGTimers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_id TEXT NOT NULL,
  eeg_reference TEXT,
  issued_at DATETIME,
  expiry_date DATE,
  status TEXT DEFAULT 'ACTIVE',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shipment_id) REFERENCES Shipments(id)
);

-- =============================================
-- DATA RETENTION POLICY
-- =============================================
-- Note: SQLite doesn't support automatic retention, implement via cron job
-- Intermediate payloads stored for 5 years (1825 days)
-- Cleanup job should run daily and delete records older than 5 years

CREATE TABLE IF NOT EXISTS DataRetentionPolicy (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name TEXT NOT NULL,
  retention_days INTEGER NOT NULL DEFAULT 1825,
  last_cleanup DATETIME,
  enabled BOOLEAN DEFAULT TRUE
);

-- Insert retention policies
INSERT OR IGNORE INTO DataRetentionPolicy (table_name, retention_days) VALUES
  ('ShipmentModuleResults', 1825),
  ('HSCodeValidationResults', 1825),
  ('DocumentVaultResults', 1825),
  ('EntitySyncResults', 1825),
  ('ComplianceEngineResults', 1825),
  ('FeeCalculationResults', 1825),
  ('CleanDeclarationResults', 1825),
  ('DigitalSignatureResults', 1825),
  ('NSWSubmissionResults', 1825),
  ('NSWWebhookEvents', 1825),
  ('AuditLogs', 1825),
  ('EventBus', 1825);

-- End Schema

