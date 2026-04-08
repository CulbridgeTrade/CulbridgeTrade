-- Lab Trust Layer MVP Schema
-- Deterministic tiering + confidence for Culbridge

-- Enhanced Labs table (add trust fields)
ALTER TABLE Labs ADD COLUMN accreditation TEXT DEFAULT NULL;
ALTER TABLE Labs ADD COLUMN rasff_history_score INTEGER DEFAULT 10 CHECK (rasff_history_score BETWEEN 0 AND 20);
ALTER TABLE Labs ADD COLUMN confidence_score INTEGER DEFAULT 90 CHECK (confidence_score BETWEEN 0 AND 100);

-- LabBatchTrust table - per batch trust scores
CREATE TABLE IF NOT EXISTS LabBatchTrust (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lab_id INTEGER NOT NULL,
  batch_number TEXT NOT NULL,
  tier TEXT CHECK (tier IN ('Tier1', 'Tier2', 'Tier3')) NOT NULL,
  batch_link_verified BOOLEAN NOT NULL DEFAULT FALSE,
  confidence_score INTEGER NOT NULL CHECK (confidence_score BETWEEN 0 AND 100),
  evaluated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (lab_id) REFERENCES Labs(id)
);

CREATE INDEX idx_labtrust_batch ON LabBatchTrust(batch_number);
CREATE INDEX idx_labtrust_lab ON LabBatchTrust(lab_id);

-- View: Lab Trust Computation (deterministic)
CREATE VIEW LabTrustView AS
SELECT 
  l.id as lab_id,
  l.name,
  l.accreditation,
  CASE 
    WHEN l.iso_17025 = 1 AND l.rasff_history_score >= 10 THEN 'Tier1'
    WHEN l.iso_17025 = 1 THEN 'Tier2'
    ELSE 'Tier3'
  END as computed_tier,
  l.confidence_score,
  l.rasff_history_score,
  'ISO/IEC 17025 verified, RASFF compliant' as notes
FROM Labs l
WHERE l.tier IN (1,2);

-- Lab Trust Scoring Function (SQLite trigger example)
CREATE TRIGGER lab_confidence_update
AFTER INSERT ON LabBatchTrust
FOR EACH ROW
BEGIN
  UPDATE Labs 
  SET confidence_score = NEW.confidence_score
  WHERE id = NEW.lab_id;
END;

-- Sample Data
INSERT OR REPLACE INTO Labs (id, name, accreditation, iso_17025, tier, rasff_history_score, confidence_score) VALUES
(1, 'Lagos Tier1 Lab', 'ISO/IEC 17025', 1, 1, 15, 95),
(2, 'Abuja Tier2 Lab', 'ISO/IEC 17025', 1, 2, 8, 78),
(3, 'Kano Non-Accredited', NULL, 0, 3, 2, 45);

INSERT OR IGNORE INTO LabBatchTrust (lab_id, batch_number, tier, batch_link_verified, confidence_score) VALUES
(1, 'BATCH-SES-2024-001', 'Tier1', 1, 98),
(2, 'BATCH-COC-2024-002', 'Tier2', 1, 82);


