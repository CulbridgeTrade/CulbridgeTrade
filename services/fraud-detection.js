/**
 * Fraud Detection Protocol Service
 * 
 * Implements Stage 1: Passive signals the system detects automatically
 * Implements Stage 2: Human review decision workflow
 * Implements Stage 3: Post-shipment fraud discovery
 * 
 * This is the boundary between system verification and physical world trust.
 * The system can verify document structure but cannot verify document authenticity.
 */

const { run, get, all } = require('../utils/db');

const FRAUD_STATUS = {
  UNREVIEWED: 'UNREVIEWED',
  CLEARED: 'CLEARED',
  FLAGGED: 'FLAGGED',
  CONFIRMED_FRAUD: 'CONFIRMED_FRAUD'
};

const FRAUD_FLAGS = {
  LAB_ACCREDITATION_REUSE: 'LAB_ACCREDITATION_REUSE',
  FUTURE_DATE: 'FUTURE_DATE',
  EXPIRED_DATE: 'EXPIRED_DATE',
  DUPLICATE_REFERENCE: 'DUPLICATE_REFERENCE',
  LAB_NAME_MISMATCH: 'LAB_NAME_MISMATCH',
  IDENTICAL_PARAMETERS: 'IDENTICAL_PARAMETERS'
};

/**
 * Stage 1: Run passive fraud detection on a document
 * Returns fraud flags if any are detected
 */
async function detectFraud(documentData, shipmentId, exporterId) {
  const flags = [];
  
  // Flag 1: Same lab accreditation number used by more than 3 different exporters in same month
  if (documentData.lab_accreditation_number) {
    const labReuseCount = await checkLabAccreditationReuse(documentData.lab_accreditation_number, exporterId);
    if (labReuseCount > 3) {
      flags.push({
        flag: FRAUD_FLAGS.LAB_ACCREDITATION_REUSE,
        severity: 'HIGH',
        message: `Lab accreditation ${documentData.lab_accreditation_number} used by ${labReuseCount} exporters this month`,
        data: { accreditation_number: documentData.lab_accreditation_number, count: labReuseCount }
      });
    }
  }
  
  // Flag 2: Lab report date is in the future
  if (documentData.report_date) {
    const reportDate = new Date(documentData.report_date);
    const today = new Date();
    if (reportDate > today) {
      flags.push({
        flag: FRAUD_FLAGS.FUTURE_DATE,
        severity: 'HIGH',
        message: `Lab report date ${documentData.report_date} is in the future`,
        data: { report_date: documentData.report_date }
      });
    }
  }
  
  // Flag 3: Lab report date is older than validity window
  if (documentData.report_date && documentData.validity_days) {
    const reportDate = new Date(documentData.report_date);
    const today = new Date();
    const validityDays = parseInt(documentData.validity_days);
    const daysSinceReport = Math.floor((today - reportDate) / (1000 * 60 * 60 * 24));
    if (daysSinceReport > validityDays) {
      flags.push({
        flag: FRAUD_FLAGS.EXPIRED_DATE,
        severity: 'MEDIUM',
        message: `Lab report is ${daysSinceReport} days old, exceeds ${validityDays} day validity`,
        data: { report_date: documentData.report_date, validity_days: validityDays, days_since: daysSinceReport }
      });
    }
  }
  
  // Flag 4: Report reference number appears on more than one shipment
  if (documentData.report_reference) {
    const duplicateCount = await checkDuplicateReference(documentData.report_reference, shipmentId);
    if (duplicateCount > 1) {
      flags.push({
        flag: FRAUD_FLAGS.DUPLICATE_REFERENCE,
        severity: 'HIGH',
        message: `Report reference ${documentData.report_reference} appears on ${duplicateCount} shipments`,
        data: { report_reference: documentData.report_reference, count: duplicateCount }
      });
    }
  }
  
  // Flag 5: Lab name in document doesn't match accredited labs database
  if (documentData.lab_name && documentData.lab_accreditation_number) {
    const labMatch = await verifyLabNameMatchesAccreditation(documentData.lab_name, documentData.lab_accreditation_number);
    if (!labMatch) {
      flags.push({
        flag: FRAUD_FLAGS.LAB_NAME_MISMATCH,
        severity: 'HIGH',
        message: `Lab name "${documentData.lab_name}" does not match accreditation number ${documentData.lab_accreditation_number}`,
        data: { lab_name: documentData.lab_name, accreditation_number: documentData.lab_accreditation_number }
      });
    }
  }
  
  // Flag 6: Parameter values are identical to previous shipment from same exporter
  if (documentData.parameters && exporterId) {
    const identicalCount = await checkIdenticalParameters(documentData.parameters, exporterId, shipmentId);
    if (identicalCount > 0) {
      flags.push({
        flag: FRAUD_FLAGS.IDENTICAL_PARAMETERS,
        severity: 'MEDIUM',
        message: `Lab parameters identical to ${identicalCount} previous shipment(s) from this exporter`,
        data: { identical_count: identicalCount }
      });
    }
  }
  
  return flags;
}

/**
 * Check if same lab accreditation used by multiple exporters in same month
 */
async function checkLabAccreditationReuse(accreditationNumber, currentExporterId) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const results = await all(`
    SELECT COUNT(DISTINCT sd.shipment_id) as count
    FROM shipment_documents sd
    JOIN shipments s ON sd.shipment_id = s.id
    WHERE sd.document_id IN (
      SELECT id FROM documents WHERE lab_accreditation_number = ?
    )
    AND sd.fraud_status != 'CONFIRMED_FRAUD'
    AND s.created_at > ?
    AND s.exporter_id != ?
  `, [accreditationNumber, thirtyDaysAgo.toISOString(), currentExporterId]);
  
  return results[0]?.count || 0;
}

/**
 * Check if report reference appears on multiple shipments
 */
async function checkDuplicateReference(reportReference, currentShipmentId) {
  const results = await all(`
    SELECT COUNT(DISTINCT shipment_id) as count
    FROM documents
    WHERE report_reference = ?
    AND shipment_id != ?
  `, [reportReference, currentShipmentId]);
  
  return results[0]?.count || 0;
}

/**
 * Verify lab name matches accreditation number in database
 */
async function verifyLabNameMatchesAccreditation(labName, accreditationNumber) {
  const lab = await get(`
    SELECT lab_name FROM accredited_labs 
    WHERE accreditation_number = ? AND active = 1
  `, [accreditationNumber]);
  
  if (!lab) return false;
  return lab.lab_name.toLowerCase() === labName.toLowerCase();
}

/**
 * Check for identical parameter values across shipments from same exporter
 */
async function checkIdenticalParameters(parameters, exporterId, currentShipmentId) {
  // Serialize parameters to compare
  const paramString = JSON.stringify(parameters);
  
  const results = await all(`
    SELECT COUNT(*) as count
    FROM documents
    WHERE exporter_id = ?
    AND shipment_id != ?
    AND parameters_json = ?
  `, [exporterId, currentShipmentId, paramString]);
  
  return results[0]?.count || 0;
}

/**
 * Stage 2: Human review decision
 * Called when compliance officer reviews a flagged document
 */
async function fraudReviewDecision(documentId, decision, reviewerId, notes) {
  const VALID_DECISIONS = ['CLEAR', 'REQUEST_VERIFICATION', 'BLOCK_FRAUD'];
  
  if (!VALID_DECISIONS.includes(decision)) {
    throw new Error(`Invalid decision: ${decision}. Must be one of: ${VALID_DECISIONS.join(', ')}`);
  }
  
  if (decision === 'BLOCK_FRAUD' && !notes) {
    throw new Error('Notes are mandatory when blocking for fraud');
  }
  
  const timestamp = new Date().toISOString();
  
  await run(`
    UPDATE shipment_documents 
    SET fraud_status = ?, 
        fraud_reviewed_by = ?, 
        fraud_reviewed_at = ?,
        fraud_review_notes = ?
    WHERE id = ?
  `, [decision === 'BLOCK_FRAUD' ? FRAUD_STATUS.CONFIRMED_FRAUD : decision, reviewerId, timestamp, notes || null, documentId]);
  
  // If confirmed fraud, also flag the exporter
  if (decision === 'BLOCK_FRAUD') {
    const doc = await get('SELECT shipment_id FROM shipment_documents WHERE id = ?', [documentId]);
    if (doc) {
      const shipment = await get('SELECT exporter_id FROM shipments WHERE id = ?', [doc.shipment_id]);
      if (shipment?.exporter_id) {
        await flagExporterAsFraudSuspect(shipment.exporter_id, documentId, reviewerId, notes);
      }
    }
  }
  
  // Create audit record
  await createFraudAuditRecord(documentId, decision, reviewerId, notes);
  
  return { 
    status: decision,
    document_id: documentId,
    reviewed_at: timestamp,
    reviewed_by: reviewerId
  };
}

/**
 * Flag exporter as fraud suspect
 */
async function flagExporterAsFraudSuspect(exporterId, documentId, flaggedBy, notes) {
  await run(`
    INSERT OR REPLACE INTO fraud_suspect_exporter (
      exporter_id, 
      flag_reason, 
      document_id,
      flagged_by,
      flagged_at,
      status
    ) VALUES (?, ?, ?, ?, ?, 'ACTIVE')
  `, [exporterId, notes || 'Document confirmed as fraud', documentId, flaggedBy, new Date().toISOString()]);
}

/**
 * Create immutable fraud audit record
 */
async function createFraudAuditRecord(documentId, decision, actorId, notes) {
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256')
    .update(`${documentId}${decision}${actorId}${Date.now()}`)
    .digest('hex');
  
  await run(`
    INSERT INTO fraud_audit_log (
      id, document_id, decision, actor_id, notes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `, [hash, documentId, decision, actorId, notes || '', new Date().toISOString()]);
}

/**
 * Stage 3: Post-shipment fraud discovery
 * Called when fraud is discovered after shipment has been submitted
 */
async function handlePostShipmentFraudDiscovery(shipmentId, discoveredBy, discoveryMethod, fraudDetails) {
  // Step 1: Block all active shipments from that exporter
  const shipment = await get('SELECT exporter_id FROM shipments WHERE id = ?', [shipmentId]);
  if (!shipment?.exporter_id) {
    throw new Error('Shipment not found');
  }
  
  await run(`
    UPDATE shipments 
    SET status = 'FRAUD_HOLD', 
        final_outcome = 'BLOCKED_FRAUD_DISCOVERED'
    WHERE exporter_id = ? 
    AND status IN ('DRAFT', 'SUBMITTED', 'PROCESSING', 'READY')
  `, [shipment.exporter_id]);
  
  // Step 2: Flag exporter account as FRAUD_SUSPECTED
  await run(`
    UPDATE exporters 
    SET fraud_status = 'FRAUD_SUSPECTED',
        fraud_flagged_at = ?,
        fraud_flagged_reason = ?
    WHERE id = ?
  `, [new Date().toISOString(), `Post-shipment fraud discovered on shipment ${shipmentId}`, shipment.exporter_id]);
  
  // Step 3: Write immutable audit record
  const crypto = require('crypto');
  const auditId = crypto.createHash('sha256')
    .update(`${shipmentId}${discoveredBy}${Date.now()}`)
    .digest('hex');
  
  await run(`
    INSERT INTO fraud_audit_log (
      id, shipment_id, event_type, discovered_by, discovery_method, details, created_at
    ) VALUES (?, ?, 'POST_SHIPMENT_DISCOVERY', ?, ?, ?, ?)
  `, [auditId, shipmentId, discoveredBy, discoveryMethod, JSON.stringify(fraudDetails), new Date().toISOString()]);
  
  // Step 4: Notify internal team (in production, this would send emails/push notifications)
  console.log(`FRAUD ALERT: Post-shipment fraud discovered on shipment ${shipmentId}`);
  console.log(`Exporter ${shipment.exporter_id} has been flagged as FRAUD_SUSPECTED`);
  console.log(`All active shipments from this exporter have been blocked`);
  
  // Step 5: Generate fraud report (returns report data for internal use)
  const fraudReport = await generateFraudReport(shipmentId, shipment.exporter_id, fraudDetails);
  
  return {
    action_taken: 'FRAUD_DISCOVERED',
    shipment_id: shipmentId,
    exporter_id: shipment.exporter_id,
    active_shipments_blocked: true,
    fraud_report_id: fraudReport.id,
    note: 'Do NOT automatically notify NSW or EU authorities - this is a human decision'
  };
}

/**
 * Generate fraud report document
 */
async function generateFraudReport(shipmentId, exporterId, fraudDetails) {
  const crypto = require('crypto');
  const reportId = `FRAUD_REPORT_${Date.now()}`;
  
  const shipment = await get('SELECT * FROM shipments WHERE id = ?', [shipmentId]);
  const documents = await all('SELECT * FROM shipment_documents WHERE shipment_id = ?', [shipmentId]);
  const auditLog = await all('SELECT * FROM fraud_audit_log WHERE shipment_id = ?', [shipmentId]);
  
  const report = {
    id: reportId,
    generated_at: new Date().toISOString(),
    shipment_id: shipmentId,
    exporter_id: exporterId,
    nature_of_fraud: fraudDetails.nature,
    documents_involved: fraudDetails.documents,
    culbridge_audit_trail: auditLog,
    system_action: 'Culbridge system acted in good faith - fraudulent document passed validation',
    conclusion: 'This report demonstrates that Culbridge followed proper procedures and detected what it could within system constraints'
  };
  
  // Store report
  await run(`
    INSERT INTO fraud_reports (id, shipment_id, exporter_id, report_data, created_at)
    VALUES (?, ?, ?, ?, ?)
  `, [reportId, shipmentId, exporterId, JSON.stringify(report), new Date().toISOString()]);
  
  return report;
}

/**
 * Get fraud status for a shipment's documents
 */
async function getShipmentFraudStatus(shipmentId) {
  const documents = await all(`
    SELECT sd.*, d.file_name, d.report_reference, d.lab_name, d.lab_accreditation_number
    FROM shipment_documents sd
    JOIN documents d ON sd.document_id = d.id
    WHERE sd.shipment_id = ?
  `, [shipmentId]);
  
  const flagged = documents.filter(d => d.fraud_status === 'FLAGGED');
  const confirmed = documents.filter(d => d.fraud_status === 'CONFIRMED_FRAUD');
  
  return {
    total_documents: documents.length,
    unreviewed: documents.filter(d => d.fraud_status === 'UNREVIEWED').length,
    cleared: documents.filter(d => d.fraud_status === 'CLEARED').length,
    flagged: flagged.length,
    confirmed_fraud: confirmed.length,
    requires_review: flagged.length > 0 || confirmed.length > 0,
    flagged_documents: flagged,
    confirmed_documents: confirmed
  };
}

module.exports = {
  FRAUD_STATUS,
  FRAUD_FLAGS,
  detectFraud,
  fraudReviewDecision,
  handlePostShipmentFraudDiscovery,
  getShipmentFraudStatus
};