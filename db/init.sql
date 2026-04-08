-- Sample Data for Culbridge MVP
-- Run after schema.sql

-- Sample Approved Labs (5 labs, mix of tiers/ISO)
INSERT OR IGNORE INTO Labs (id, name, iso_17025, tier, risk_score) VALUES
(1, 'Lagos ISO Lab', TRUE, 1, 95),
(2, 'Abuja Standard Lab', TRUE, 1, 92),
(3, 'Kano Agro Lab', FALSE, 2, 75),
(4, 'Ibadan Quality Lab', TRUE, 2, 88),
(5, 'Enugu Test Lab', FALSE, 3, 60);

-- Sample Shipments (2: sesame/cocoa to NL/DE)
INSERT OR IGNORE INTO Shipments (id, exporter_id, product, category, destination, batch_number, production_date) VALUES
('CB-001', 'EXP-001', 'sesame', 'agro-export', 'NL', 'BATCH-SES-2024-001', '2024-03-15'),
('CB-002', 'EXP-002', 'cocoa', 'agro-export', 'DE', 'BATCH-COC-2024-002', '2024-04-01');

-- Sample Documents for CB-001
INSERT OR IGNORE INTO ShipmentDocuments (shipment_id, doc_type, lab_id, file_hash, status, expiry_date) VALUES
('CB-001', 'lab_report', 1, 'hash_lab_ses_001', 'verified', '2024-09-15'),
('CB-001', 'coa', NULL, 'hash_coa_ses_001', 'verified', NULL),
('CB-001', 'phytosanitary', NULL, NULL, 'missing', NULL);

-- =============================================
-- MODULE OUTPUT SAMPLE DATA (Deterministic Flags)
-- =============================================

-- HS Code Validator outputs
INSERT OR IGNORE INTO HSCodeValidationResults (shipment_id, validated_hs_code, hs_mapping, commodity_description, deterministic_flag) VALUES
('CB-001', '12074000', '{"chapter":12,"heading":"07","subheading":"40","description":"Sesame seeds, whether or not broken"}', 'Sesame seeds, cleaned, sorted', 1);

-- Document Vault outputs
INSERT OR IGNORE INTO DocumentVaultResults (shipment_id, certificates, naqs_reference, nepc_reference, nafdac_reference, son_reference, deterministic_flag) VALUES
('CB-001', '[{"type":"phytosanitary","ref":"NAQS-PHY-001","status":"valid"},{"type":"lab_report","ref":"LAB-2024-001","status":"valid"}]', 'NAQS-REF-001', 'NEPC-REF-001', 'NAFDAC-REF-001', 'SON-REF-001', 1);

-- Entity Sync outputs
INSERT OR IGNORE INTO EntitySyncResults (shipment_id, tin, rc_number, cac_reference, aeo_status, aeo_expiry_date, deterministic_flag) VALUES
('CB-001', 'TIN-12345678', 'RC-987654', 'CAC-REF-001', 'ACTIVE', '2025-12-31', 1);

-- Compliance Engine outputs
INSERT OR IGNORE INTO ComplianceEngineResults (shipment_id, eudr_status, eudr_assessment, farm_coordinates, farm_polygons, residue_limits, pade_status, deterministic_flag) VALUES
('CB-001', 'COMPLIANT', '{"deforestation_risk":"LOW","risk_score":15}', '[{"lat":6.5244,"lng":3.3792}]', '[]', '{"pesticides":[],"mycotoxins":[]}', 'APPROVED', 1);

-- Fee Calculator outputs
INSERT OR IGNORE INTO FeeCalculationResults (shipment_id, nes_levy, duty, agency_fees, total_estimated_costs, payment_ref, currency, exchange_rate, deterministic_flag) VALUES
('CB-001', 50000.00, 150000.00, '{"inspection":10000,"processing":15000," clearance":5000}', 215000.00, 'PAY-CB-001-2024', 'NGN', 1500.00, 1);

-- Clean Declaration Builder outputs
INSERT OR IGNORE INTO CleanDeclarationResults (shipment_id, payload_version, payload, deterministic_flag) VALUES
('CB-001', '2026.1', '{"declaration_ref":"CUL-CB-001-20240315","version":"2026.1","exporter":{"tin":"TIN-12345678"},"product":{"hs_code":"12074000","description":"Sesame seeds"},"destination":"NL","priority_lane":"STANDARD"}', 1);

-- Digital Signature outputs
INSERT OR IGNORE INTO DigitalSignatureResults (shipment_id, payload_hash, digital_signature, signer_identity, certificate_serial) VALUES
('CB-001', 'sha256:a1b2c3d4e5f6...', 'MIAGCSqGSIb3DQEHAqCAMIACAQExCzAJBgUrDgMCGgUAMAsGCSqGSIb3DQEHAaCA...', 'SIGNER-AGENT-001', 'CERT-2024-001');

-- NSW Submission outputs
INSERT OR IGNORE INTO NSWSubmissionResults (shipment_id, sgd_number, submission_status, priority_lane, rejection_reason, submitted_at, response_received_at) VALUES
('CB-001', 'SGD-2024-000001', 'ACCEPTED', 'GREEN', NULL, '2024-03-20 10:00:00', '2024-03-20 14:30:00');

-- NSW Webhook Events (C100 → C105)
INSERT OR IGNORE INTO NSWWebhookEvents (shipment_id, event_type, event_data, processed) VALUES
('CB-001', 'C100', '{"status":"SUBMITTED","timestamp":"2024-03-20T10:00:00Z"}', 1),
('CB-001', 'C101', '{"status":"PROCESSING","timestamp":"2024-03-20T12:00:00Z"}', 1),
('CB-001', 'C102', '{"status":"ACCEPTED","sgd_number":"SGD-2024-000001","timestamp":"2024-03-20T14:30:00Z"}', 1),
('CB-001', 'C104', '{"status":"CLEAR","timestamp":"2024-03-21T09:00:00Z"}', 1);

-- Audit Logs
INSERT OR IGNORE INTO AuditLogs (shipment_id, module, action, actor, outcome, details) VALUES
('CB-001', 'hs_code_validator', 'VALIDATE', 'system', 'SUCCESS', '{"validated_hs_code":"12074000"}'),
('CB-001', 'document_vault', 'STORE_CERTS', 'system', 'SUCCESS', '{"cert_count":2}'),
('CB-001', 'entity_sync', 'SYNC', 'system', 'SUCCESS', '{"aeo_status":"ACTIVE"}'),
('CB-001', 'compliance_engine', 'EVALUATE', 'system', 'SUCCESS', '{"eudr_status":"COMPLIANT"}'),
('CB-001', 'fee_calculator', 'CALCULATE', 'system', 'SUCCESS', '{"total":215000}'),
('CB-001', 'clean_declaration_builder', 'BUILD', 'system', 'SUCCESS', '{"ref":"CUL-CB-001-20240315"}'),
('CB-001', 'digital_signature', 'SIGN', 'system', 'SUCCESS', '{"signer":"SIGNER-AGENT-001"}'),
('CB-001', 'nsw_esb_submission', 'SUBMIT', 'system', 'SUCCESS', '{"sgd_number":"SGD-2024-000001"}'),
('CB-001', 'webhook_listener', 'RECEIVE', 'nsw_esb', 'SUCCESS', '{"event_type":"C102"}'),
('CB-001', 'audit_logger', 'LOG', 'system', 'SUCCESS', '{"modules_completed":10}');

-- Event Bus
INSERT OR IGNORE INTO EventBus (event_type, shipment_id, payload, triggered_by, processed) VALUES
('NSW_ACCEPTED', 'CB-001', '{"sgd_number":"SGD-2024-000001","priority_lane":"GREEN"}', 'nsw_esb_submission', 1),
('DECLARATION_SIGNED', 'CB-001', '{"signer_identity":"SIGNER-AGENT-001"}', 'digital_signature', 1);

-- No initial evaluations/logs (generated by engine)

