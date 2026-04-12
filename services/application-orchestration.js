/**
 * Application Layer - Orchestration
 * 
 * Coordinates between frontend API, rule engine, state machine, audit logs, and alerts.
 * This is where side effects happen - database writes, state updates, notifications.
 * 
 * The rule engine is called as a pure function. This layer handles everything else.
 */

const { run, get, all } = require('../utils/db');
// const evaluationEngine = require('./evaluation-engine');
// const pipelineStateMachine = require('./engine/pipeline-state-machine');
// const fraudDetection = require('./services/fraud-detection');
// const mrlRiskScan = require('./services/mrl-risk-scan');
const crypto = require('crypto');

const SHIPMENT_STATUS = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  EVALUATING: 'EVALUATING',
  PENDING_REVIEW: 'PENDING_REVIEW',
  READY: 'READY',
  BLOCKED: 'BLOCKED',
  FRAUD_HOLD: 'FRAUD_HOLD',
  SUBMITTED_TO_CUSTOM: 'SUBMITTED_TO_CUSTOM',
  CLEARED: 'CLEARED',
  REJECTED: 'REJECTED'
};

/**
 * Main entry point: Process a shipment evaluation request
 * Returns compliance result with audit trail
 */
async function processShipmentEvaluation(shipmentId, actor = 'system') {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();
  
  // Load shipment
  const shipment = await loadShipment(shipmentId);
  if (!shipment) {
    throw new Error(`Shipment not found: ${shipmentId}`);
  }
  
  // Write audit record BEFORE anything else (Pillar 1)
  const auditId = await writeAuditRecord({
    type: 'COMPLIANCE_EVALUATION_STARTED',
    shipment_id: shipmentId,
    performed_by: actor,
    timestamp: timestamp,
    details: { product: shipment.product, destination: shipment.destination }
  });
  
  // Update shipment state to EVALUATING
  await updateShipmentState(shipmentId, SHIPMENT_STATUS.EVALUATING);
  
  try {
    // Call the pure rule engine - no side effects
    const complianceResult = evaluationEngine.evaluateDeterministic(shipment);
    
    // Record which rule versions were applied (for audit)
    if (complianceResult.rules_applied) {
      await writeRuleVersionSnapshot(shipmentId, complianceResult.rules_applied);
    }
    
    // Run fraud detection on documents (Stage 1 passive signals)
    const fraudCheck = await runFraudDetection(shipment);
    if (fraudCheck.flags.length > 0) {
      complianceResult.fraud_flags = fraudCheck.flags;
      if (complianceResult.status === 'PASS') {
        complianceResult.status = 'PENDING_REVIEW';
        complianceResult.review_reason = 'Fraud detection flags detected';
      }
    }
    
    // Run MRL Risk Scan (if farms linked)
    try {
      const mrlAssessment = await mrlRiskScan.calculateMRLRisk(shipmentId);
      if (mrlAssessment) {
        complianceResult.mrl_assessment = mrlAssessment;
        
        // Update status based on MRL risk
        if (mrlAssessment.shipment_blocked) {
          complianceResult.status = 'BLOCKED';
          complianceResult.block_reason = 'MRL risk CRITICAL - shipment blocked';
        } else if (mrlAssessment.lab_test_required && complianceResult.status === 'PASS') {
          complianceResult.status = 'PENDING_REVIEW';
          complianceResult.review_reason = 'MRL risk HIGH - lab test required';
        }
        
        // Save MRL assessment
        await mrlRiskScan.saveMRLAssessment(shipmentId, mrlAssessment);
        
        // Evaluate gate decision
        const gateDecision = await mrlRiskScan.evaluateShipmentGate(shipmentId, mrlAssessment, null);
        await mrlRiskScan.saveGateDecision(shipmentId, gateDecision);
        complianceResult.gate_decision = gateDecision;
      }
    } catch (mrlError) {
      // MRL scan is optional - log but don't fail
      console.error('MRL Risk Scan failed:', mrlError.message);
    }
    
    // Determine new state based on compliance result
    const newState = determineNewState(shipment.status, complianceResult.status);
    
    // Validate state transition
    const transitionValidation = await validateStateTransition(shipmentId, shipment.status, newState);
    if (!transitionValidation.valid) {
      throw new Error(`Invalid state transition: ${transitionValidation.reason}`);
    }
    
    // Update shipment state
    await updateShipmentState(shipmentId, newState, {
      final_outcome: complianceResult.status,
      rules_version: 'v1.0'
    });
    
    // Save compliance result to database
    await saveComplianceResult(shipmentId, complianceResult);
    
    // Send alerts if required (non-blocking)
    await sendAlerts(shipmentId, complianceResult, actor);
    
    // Complete audit record
    await updateAuditRecord(auditId, {
      outcome: complianceResult.status,
      duration_ms: Date.now() - startTime,
      rules_count: complianceResult.rules_applied?.length || 0
    });
    
    return {
      ...complianceResult,
      shipment_id: shipmentId,
      evaluated_at: timestamp,
      duration_ms: Date.now() - startTime,
      audit_id: auditId
    };
    
  } catch (error) {
    // Log error to audit
    await updateAuditRecord(auditId, {
      outcome: 'ERROR',
      error: error.message,
      duration_ms: Date.now() - startTime
    });
    
    // Set shipment to error state
    await updateShipmentState(shipmentId, SHIPMENT_STATUS.BLOCKED, {
      final_outcome: 'EVALUATION_ERROR',
      error_message: error.message
    });
    
    throw error;
  }
}

/**
 * Load shipment with all related data
 */
async function loadShipment(shipmentId) {
  const shipment = await get('SELECT * FROM shipments WHERE id = ?', [shipmentId]);
  if (!shipment) return null;
  
  // Load commodity data
  const commodity = await get('SELECT * FROM shipment_commodity WHERE shipment_id = ?', [shipmentId]);
  
  // Load destination
  const destination = await get('SELECT * FROM shipment_destination WHERE shipment_id = ?', [shipmentId]);
  
  // Load documents
  const documents = await all(`
    SELECT sd.*, d.file_name, d.report_reference, d.lab_name, d.lab_accreditation_number
    FROM shipment_documents sd
    JOIN documents d ON sd.document_id = d.id
    WHERE sd.shipment_id = ?
  `, [shipmentId]);
  
  // Build shipment object for rule engine
  return {
    shipment_id: shipmentId,
    product: commodity?.commodity_type || commodity?.description?.toLowerCase().replace(/\s+/g, '_'),
    product_description: commodity?.description,
    hs_code: commodity?.hs_code,
    origin: 'Nigeria',
    origin_country: 'NG',
    destination: destination?.country_name || destination?.country_code,
    destination_country: destination?.country_code,
    entry_port: destination?.port_code?.toLowerCase() || destination?.port_name?.toLowerCase(),
    
    // Lab results would come from a separate table in full implementation
    // For now, check documents for lab reports
    lab_results: extractLabResultsFromDocuments(documents),
    
    // Documents as boolean map
    documents: documentsToBooleanMap(documents),
    
    // Entity info for fraud detection
    exporter_id: shipment.exporter_id,
    
    // Additional context
    shipment_context: {
      status: shipment.status,
      rules_version: shipment.rules_version
    }
  };
}

/**
 * Extract lab results from documents
 */
function extractLabResultsFromDocuments(documents) {
  const labDocs = documents.filter(d => d.type === 'lab_report');
  if (labDocs.length === 0) return null;
  
  // In full implementation, this would parse actual lab result data
  // For now, return null to trigger "no lab results" validation
  return null;
}

/**
 * Convert documents array to boolean map for rule engine
 */
function documentsToBooleanMap(documents) {
  const map = {};
  documents.forEach(doc => {
    map[doc.type] = true;
  });
  return map;
}

/**
 * Write immutable audit record
 */
async function writeAuditRecord(record) {
  const id = crypto.randomUUID();
  const timestamp = record.timestamp || new Date().toISOString();
  
  await run(`
    INSERT INTO audit_logs (id, shipment_id, event_type, actor_id, actor_name, actor_role, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    record.shipment_id,
    record.type,
    record.performed_by,
    record.performed_by,
    'SYSTEM',
    JSON.stringify(record.details || {}),
    timestamp
  ]);
  
  return id;
}

/**
 * Update audit record with outcome
 */
async function updateAuditRecord(auditId, updates) {
  await run(`
    UPDATE audit_logs 
    SET details = JSON_SET(details, '$.outcome', ?),
        details = JSON_SET(details, '$.duration_ms', ?),
        details = JSON_SET(details, '$.error', ?)
    WHERE id = ?
  `, [
    updates.outcome || 'UNKNOWN',
    updates.duration_ms || 0,
    updates.error || null,
    auditId
  ]);
}

/**
 * Write rule version snapshot for audit trail
 */
async function writeRuleVersionSnapshot(shipmentId, rulesApplied) {
  await run(`
    INSERT INTO rule_audit_snapshots (shipment_id, rules_applied)
    VALUES (?, ?)
  `, [shipmentId, JSON.stringify(rulesApplied)]);
}

/**
 * Determine new shipment state based on compliance result
 */
function determineNewState(currentStatus, complianceStatus) {
  const stateMapping = {
    'PASS': SHIPMENT_STATUS.READY,
    'RISK': SHIPMENT_STATUS.PENDING_REVIEW,
    'PENDING_REVIEW': SHIPMENT_STATUS.PENDING_REVIEW,
    'BLOCKED': SHIPMENT_STATUS.BLOCKED,
    'UNCERTAIN': SHIPMENT_STATUS.BLOCKED
  };
  
  return stateMapping[complianceStatus] || SHIPMENT_STATUS.BLOCKED;
}

/**
 * Validate state transition using state machine
 */
async function validateStateTransition(shipmentId, fromState, toState) {
  // Get current pipeline state
  const pipeline = await pipelineStateMachine.getPipelineState(shipmentId);
  
  if (!pipeline.initialized) {
    // Initialize if not done
    await pipelineStateMachine.initializeShipment(shipmentId);
  }
  
  // Check if transition is valid
  const canTransition = await pipelineStateMachine.canProceedTo(shipmentId, toState);
  
  if (!canTransition.allowed) {
    return { valid: false, reason: canTransition.reason };
  }
  
  return { valid: true };
}

/**
 * Update shipment state in database
 */
async function updateShipmentState(shipmentId, newState, additionalFields = {}) {
  const fields = ['status = ?', 'updated_at = ?'];
  const values = [newState, new Date().toISOString()];
  
  if (additionalFields.final_outcome) {
    fields.push('final_outcome = ?');
    values.push(additionalFields.final_outcome);
  }
  
  if (additionalFields.rules_version) {
    fields.push('rules_version = ?');
    values.push(additionalFields.rules_version);
  }
  
  if (additionalFields.error_message) {
    fields.push('status = ?');
    values.push(additionalFields.error_message);
  }
  
  if (additionalFields.assigned_officer) {
    fields.push('assigned_officer = ?');
    values.push(additionalFields.assigned_officer);
  }
  
  values.push(shipmentId);
  
  await run(`UPDATE shipments SET ${fields.join(', ')} WHERE id = ?`, values);
}

/**
 * Save compliance result to database
 */
async function saveComplianceResult(shipmentId, result) {
  await run(`
    INSERT OR REPLACE INTO compliance_results (
      shipment_id, 
      status, 
      failures, 
      missing, 
      next_actions,
      rules_applied,
      exporter_message,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    shipmentId,
    result.status,
    JSON.stringify(result.failures || []),
    JSON.stringify(result.missing_documents || result.missing || []),
    JSON.stringify(result.next_actions || []),
    JSON.stringify(result.rules_applied || []),
    result.exporter_message || null,
    new Date().toISOString()
  ]);
}

/**
 * Run fraud detection on shipment documents (Stage 1)
 */
async function runFraudDetection(shipment) {
  const flags = [];
  
  // Get documents for this shipment
  const documents = await all(`
    SELECT d.*, sd.type as doc_type
    FROM documents d
    JOIN shipment_documents sd ON d.id = sd.document_id
    WHERE sd.shipment_id = ?
  `, [shipment.shipment_id]);
  
  // Run detection on each document
  for (const doc of documents) {
    const docFlags = await fraudDetection.detectFraud(
      {
        lab_name: doc.lab_name,
        lab_accreditation_number: doc.lab_accreditation_number,
        report_reference: doc.report_reference,
        report_date: doc.report_date,
        validity_days: 30
      },
      shipment.shipment_id,
      shipment.exporter_id
    );
    
    flags.push(...docFlags);
  }
  
  return { flags };
}

/**
 * Send alerts based on compliance result
 */
async function sendAlerts(shipmentId, result, actor) {
  const alerts = [];
  
  // PENDING_REVIEW alert
  if (result.status === 'PENDING_REVIEW') {
    alerts.push({
      type: 'PENDING_REVIEW',
      shipment_id: shipmentId,
      reason: result.review_reason || 'Compliance review required',
      priority: 'MEDIUM'
    });
  }
  
  // High priority alerts for specific conditions
  if (result.warnings?.some(w => w.confidence === 'low')) {
    alerts.push({
      type: 'LOW_CONFIDENCE_RULES',
      shipment_id: shipmentId,
      reason: 'Low confidence rules applied - human approval required',
      priority: 'HIGH'
    });
  }
  
  if (result.fraud_flags?.length > 0) {
    alerts.push({
      type: 'FRAUD_DETECTION',
      shipment_id: shipmentId,
      reason: `Fraud flags detected: ${result.fraud_flags.map(f => f.flag).join(', ')}`,
      priority: 'CRITICAL'
    });
  }
  
  // Store alerts (in production, would also send email/push notifications)
  for (const alert of alerts) {
    await run(`
      INSERT INTO compliance_flags (id, shipment_id, code, severity, message, module, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      crypto.randomUUID(),
      alert.shipment_id,
      alert.type,
      alert.priority,
      alert.reason,
      'orchestration',
      new Date().toISOString()
    ]);
  }
  
  return alerts;
}

/**
 * Process a human review decision
 */
async function processReviewDecision(shipmentId, decision, reviewerId, notes) {
  // decision: 'APPROVED' | 'REJECTED'
  
  const newStatus = decision === 'APPROVED' ? SHIPMENT_STATUS.READY : SHIPMENT_STATUS.REJECTED;
  
  await updateShipmentState(shipmentId, newStatus, {
    assigned_officer: reviewerId
  });
  
  // Write audit record
  await writeAuditRecord({
    type: `REVIEW_${decision}`,
    shipment_id: shipmentId,
    performed_by: reviewerId,
    timestamp: new Date().toISOString(),
    details: { decision, notes }
  });
  
  return { status: newStatus, reviewed_by: reviewerId, reviewed_at: new Date().toISOString() };
}

/**
 * Handle post-shipment fraud discovery (Stage 3)
 */
async function handleFraudDiscovery(shipmentId, discoveredBy, discoveryMethod, details) {
  return await fraudDetection.handlePostShipmentFraudDiscovery(
    shipmentId,
    discoveredBy,
    discoveryMethod,
    details
  );
}

module.exports = {
  processShipmentEvaluation,
  loadShipment,
  processReviewDecision,
  handleFraudDiscovery,
  SHIPMENT_STATUS
};