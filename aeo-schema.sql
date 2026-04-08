-- AEO MVP Schema Extension
-- Deterministic State Machine for Authorized Economic Operator

CREATE TABLE IF NOT EXISTS ExporterProfile (
  TIN TEXT PRIMARY KEY,
  CACNumber TEXT UNIQUE NOT NULL,
  LegalEntityName TEXT NOT NULL,
  RegistrationDate DATE NOT NULL,
  PrincipalBusiness TEXT NOT NULL,
  TradeHistory JSON,
  TaxClearance BOOLEAN DEFAULT FALSE,
  TaxClearanceExpiry DATE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS AEOApplication (
  ApplicationID TEXT PRIMARY KEY,
  ExporterProfileTIN TEXT NOT NULL,
  Status TEXT NOT NULL CHECK(Status IN ('NOI_Submitted', 'SAQ_Validated', 'Provisional', 'Full_Certified')) DEFAULT 'NOI_Submitted',
  Tier TEXT NOT NULL CHECK(Tier IN ('AEO-C', 'AEO-S')),
  TraderSegmentationScore INTEGER CHECK(TraderSegmentationScore BETWEEN 0 AND 100),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ExporterProfileTIN) REFERENCES ExporterProfile(TIN)
);

CREATE INDEX idx_aeo_status ON AEOApplication(Status);
CREATE INDEX idx_aeo_tier ON AEOApplication(Tier);

CREATE TABLE IF NOT EXISTS UploadEvidence (
  EvidenceID TEXT PRIMARY KEY,
  ApplicationID TEXT NOT NULL,
  Type TEXT NOT NULL CHECK(Type IN ('CCTV', 'SOP', 'FinancialStatement', 'TaxCertificate', 'AuditReport', 'TrainingLog', 'PersonnelVetting')),
  FilePath TEXT NOT NULL, -- S3/MinIO path
  UploadDate DATETIME DEFAULT CURRENT_TIMESTAMP,
  SizeBytes INTEGER CHECK(SizeBytes <= 10485760), -- 10MB max
  Validated BOOLEAN DEFAULT FALSE,
  Version INTEGER DEFAULT 1,
  FOREIGN KEY (ApplicationID) REFERENCES AEOApplication(ApplicationID)
);

CREATE INDEX idx_evidence_app ON UploadEvidence(ApplicationID);
CREATE INDEX idx_evidence_type ON UploadEvidence(Type);

CREATE TABLE IF NOT EXISTS RemediationTask (
  TaskID TEXT PRIMARY KEY,
  ApplicationID TEXT NOT NULL,
  Track TEXT NOT NULL CHECK(Track IN ('PhysicalSecurity', 'Documentation', 'FinancialTax')),
  Milestone TEXT NOT NULL CHECK(Milestone IN ('AuditReportUploaded', 'EvidenceCollection', 'InternalPreReview', 'FinalSubmission')),
  Deadline DATE NOT NULL,
  Status TEXT DEFAULT 'Pending' CHECK(Status IN ('Pending', 'Completed', 'Overdue')),
  EvidenceIDs TEXT, -- JSON array
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ApplicationID) REFERENCES AEOApplication(ApplicationID)
);

CREATE INDEX idx_task_app ON RemediationTask(ApplicationID);
CREATE INDEX idx_task_deadline ON RemediationTask(Deadline);
CREATE INDEX idx_task_status ON RemediationTask(Status);

-- Audit Log (immutable)
CREATE TABLE AEOAuditLog (
  LogID INTEGER PRIMARY KEY AUTOINCREMENT,
  ApplicationID TEXT NOT NULL,
  EventType TEXT NOT NULL,
  ActorID TEXT, -- User/System ID
  EvidenceRef TEXT, -- EvidenceID if applicable
  Outcome TEXT, -- PASS/FAIL
  Timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ApplicationID) REFERENCES AEOApplication(ApplicationID)
);

CREATE INDEX idx_audit_app ON AEOAuditLog(ApplicationID);
CREATE INDEX idx_audit_time ON AEOAuditLog(Timestamp);

-- Sample Data
INSERT OR IGNORE INTO ExporterProfile (TIN, CACNumber, LegalEntityName, RegistrationDate, PrincipalBusiness) VALUES
('TIN001', 'CAC123456', 'Culbridge Exporters Ltd', '2024-01-01', 'Agro-Export');

INSERT OR IGNORE INTO AEOApplication (ApplicationID, ExporterProfileTIN, Tier) VALUES
('APP001', 'TIN001', 'AEO-S');
