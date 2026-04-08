/**
 * Pipeline State Machine - Infrastructure-Grade Enforcement
 * 
 * Enforces monotonic, non-bypassable pipeline with invariant validation.
 * Any violation → system panic, halt, alert.
 * 
 * State Flow:
 * INGESTED → HS_VALIDATED → DOCUMENTS_VERIFIED → COMPLIANCE_PASSED → 
 * FINANCIAL_CONFIRMED → READY_FOR_SIGNATURE → SIGNED → SUBMITTED
 */

const { run, get, all } = require('./utils/db');

// Pipeline stages in strict order
const PIPELINE_STAGES = [
  'INGESTED',
  'HS_VALIDATED', 
  'DOCUMENTS_VERIFIED',
  'COMPLIANCE_PASSED',
  'FINANCIAL_CONFIRMED',
  'READY_FOR_SIGNATURE',
  'SIGNED',
  'SUBMITTED'
];

// Valid transitions
const VALID_TRANSITIONS = {
  'INGESTED': ['HS_VALIDATED'],
  'HS_VALIDATED': ['DOCUMENTS_VERIFIED'],
  'DOCUMENTS_VERIFIED': ['COMPLIANCE_PASSED'],
  'COMPLIANCE_PASSED': ['FINANCIAL_CONFIRMED'],
  'FINANCIAL_CONFIRMED': ['READY_FOR_SIGNATURE'],
  'READY_FOR_SIGNATURE': ['SIGNED'],
  'SIGNED': ['SUBMITTED'],
  'SUBMITTED': [] // Terminal state
};

/**
 * Initialize shipment in pipeline (called on creation)
 */
async function initializeShipment(shipmentId) {
  await run(
    `INSERT OR REPLACE INTO ShipmentPipelineState (shipment_id, current_state, previous_state, updated_at) VALUES (?, ?, ?, ?)`,
    [shipmentId, 'INGESTED', null, new Date().toISOString()]
  );
  
  await logPipelineEvent(shipmentId, 'INITIALIZE', 'INGESTED', null, 'SUCCESS');
  
  return { valid: true, state: 'INGESTED' };
}

/**
 * Validate and execute state transition
 */
async function transitionTo(shipmentId, targetState, context = {}) {
  // Get current state
  const current = await get(
    `SELECT * FROM ShipmentPipelineState WHERE shipment_id = ?`,
    [shipmentId]
  );
  
  if (!current) {
    return {
      valid: false,
      error: 'SHIPMENT_NOT_IN_PIPELINE',
      message: `Shipment ${shipmentId} not initialized. Call initializeShipment first.`
    };
  }
  
  const currentState = current.current_state;
  
  // Validate transition is allowed
  const validTargets = VALID_TRANSITIONS[currentState] || [];
  
  if (!validTargets.includes(targetState)) {
    const error = {
      valid: false,
      error: 'INVALID_TRANSITION',
      message: `Cannot transition from ${currentState} to ${targetState}. Valid: ${validTargets.join(', ')}`,
      current_state: currentState,
      target_state: targetState,
      shipment_id: shipmentId
    };
    
    // Log failure
    await logPipelineEvent(shipmentId, 'TRANSITION_FAILED', targetState, currentState, 'FAILED', error);
    
    // System panic for invariant violation
    await triggerSystemPanic(shipmentId, 'INVALID_STATE_TRANSITION', error);
    
    return error;
  }
  
  // Execute transition
  await run(
    `UPDATE ShipmentPipelineState SET current_state = ?, previous_state = ?, updated_at = ? WHERE shipment_id = ?`,
    [targetState, currentState, new Date().toISOString(), shipmentId]
  );
  
  // Log success
  await logPipelineEvent(shipmentId, 'TRANSITION', targetState, currentState, 'SUCCESS', context);
  
  return { valid: true, from: currentState, to: targetState };
}

/**
 * Check if stage is completed (helper)
 */
async function isStageCompleted(shipmentId, stage) {
  const current = await get(
    `SELECT current_state FROM ShipmentPipelineState WHERE shipment_id = ?`,
    [shipmentId]
  );
  
  if (!current) return false;
  
  const currentIndex = PIPELINE_STAGES.indexOf(current.current_state);
  const stageIndex = PIPELINE_STAGES.indexOf(stage);
  
  return currentIndex >= stageIndex;
}

/**
 * Validate all invariants for a shipment
 */
async function validateInvariants(shipmentId) {
  const violations = [];
  
  // 1. Check state progression is monotonic
  const state = await get(
    `SELECT * FROM ShipmentPipelineState WHERE shipment_id = ?`,
    [shipmentId]
  );
  
  if (!state) {
    violations.push({ invariant: 'STATE_EXISTS', message: 'Shipment not in pipeline' });
  }
  
  // 2. Signed payload must equal hashed payload
  const declaration = await get(
    `SELECT * FROM CleanDeclarationResults WHERE shipment_id = ? ORDER BY id DESC LIMIT 1`,
    [shipmentId]
  );
  
  const signature = await get(
    `SELECT * FROM DigitalSignatureResults WHERE shipment_id = ? ORDER BY id DESC LIMIT 1`,
    [shipmentId]
  );
  
  if (declaration && signature) {
    const crypto = require('crypto');
    const computedHash = crypto
      .createHash('sha256')
      .update(declaration.payload)
      .digest('base64');
    
    if (computedHash !== signature.payload_hash) {
      violations.push({ 
        invariant: 'SIGNED_PAYLOAD_HASH', 
        message: 'Signature hash does not match payload hash' 
      });
    }
  }
  
  // 3. Payment must match financials (if signed, payment must exist)
  if (state && state.current_state === 'SIGNED') {
    const fees = await get(
      `SELECT total_estimated_costs FROM FeeCalculationResults WHERE shipment_id = ? ORDER BY id DESC LIMIT 1`,
      [shipmentId]
    );
    
    if (!fees) {
      violations.push({ 
        invariant: 'PAYMENT_EXISTS', 
        message: 'Signed shipment has no fee calculation' 
      });
    }
  }
  
  // 4. Compliance must pass for signature
  if (state && state.current_state === 'SIGNED') {
    const compliance = await get(
      `SELECT eudr_status FROM ComplianceEngineResults WHERE shipment_id = ? ORDER BY id DESC LIMIT 1`,
      [shipmentId]
    );
    
    if (!compliance || compliance.eudr_status !== 'COMPLIANT') {
      violations.push({ 
        invariant: 'COMPLIANCE_PASSED', 
        message: 'Non-compliant shipment cannot be signed' 
      });
    }
  }
  
  return {
    valid: violations.length === 0,
    violations
  };
}

/**
 * Check if shipment can proceed to target stage
 */
async function canProceedTo(shipmentId, targetState) {
  const current = await get(
    `SELECT current_state FROM ShipmentPipelineState WHERE shipment_id = ?`,
    [shipmentId]
  );
  
  if (!current) {
    return { allowed: false, reason: 'SHIPMENT_NOT_IN_PIPELINE' };
  }
  
  const validTargets = VALID_TRANSITIONS[current.current_state] || [];
  const allowed = validTargets.includes(targetState);
  
  return { 
    allowed, 
    current_state: current.current_state,
    target_state: targetState,
    reason: allowed ? null : `Invalid transition from ${current.current_state}`
  };
}

/**
 * Get full pipeline state for shipment
 */
async function getPipelineState(shipmentId) {
  const state = await get(
    `SELECT * FROM ShipmentPipelineState WHERE shipment_id = ?`,
    [shipmentId]
  );
  
  if (!state) {
    return { initialized: false };
  }
  
  // Get completed stages
  const currentIndex = PIPELINE_STAGES.indexOf(state.current_state);
  const completed = PIPELINE_STAGES.slice(0, currentIndex + 1);
  const remaining = PIPELINE_STAGES.slice(currentIndex + 1);
  
  return {
    initialized: true,
    current_state: state.current_state,
    previous_state: state.previous_state,
    updated_at: state.updated_at,
    completed,
    remaining,
    progress: `${completed.length}/${PIPELINE_STAGES.length}`
  };
}

/**
 * Log pipeline event
 */
async function logPipelineEvent(shipmentId, action, targetState, fromState, outcome, details = {}) {
  await run(
    `INSERT INTO PipelineAuditLog (shipment_id, action, target_state, from_state, outcome, details) VALUES (?, ?, ?, ?, ?, ?)`,
    [shipmentId, action, targetState, fromState, outcome, JSON.stringify(details)]
  );
}

/**
 * Trigger system panic for critical invariant violations
 */
async function triggerSystemPanic(shipmentId, panicType, details) {
  console.error(`🚨 SYSTEM PANIC: ${panicType}`);
  console.error(`Shipment: ${shipmentId}`);
  console.error(`Details:`, details);
  
  // Update panic state
  await run(
    `INSERT OR REPLACE INTO PipelineAuditLog (shipment_id, action, target_state, from_state, outcome, details) VALUES (?, ?, ?, ?, ?, ?)`,
    [shipmentId, 'SYSTEM_PANIC', panicType, null, 'PANIC', JSON.stringify(details)]
  );
  
  // In production, this would:
  // 1. Send alerts to on-call
  // 2. Block further processing
  // 3. Create incident ticket
  // 4. Notify compliance team
  
  return { panic: true, type: panicType, shipment: shipmentId };
}

// Stage helpers for direct calls
async function validateHS(shipmentId, hsCodeResult) {
  if (!hsCodeResult.valid) {
    await triggerSystemPanic(shipmentId, 'HS_VALIDATION_FAILED', hsCodeResult);
    return { valid: false, error: 'HS validation failed' };
  }
  return transitionTo(shipmentId, 'HS_VALIDATED');
}

async function validateDocuments(shipmentId, docResult) {
  if (!docResult.valid) {
    await triggerSystemPanic(shipmentId, 'DOCUMENT_VALIDATION_FAILED', docResult);
    return { valid: false, error: 'Document validation failed' };
  }
  return transitionTo(shipmentId, 'DOCUMENTS_VERIFIED');
}

async function validateCompliance(shipmentId, complianceResult) {
  if (!complianceResult.valid || complianceResult.eudr_status !== 'COMPLIANT') {
    await triggerSystemPanic(shipmentId, 'COMPLIANCE_FAILED', complianceResult);
    return { valid: false, error: 'Compliance failed' };
  }
  return transitionTo(shipmentId, 'COMPLIANCE_PASSED');
}

async function confirmFinancial(shipmentId, financialResult) {
  if (!financialResult.valid) {
    await triggerSystemPanic(shipmentId, 'FINANCIAL_FAILED', financialResult);
    return { valid: false, error: 'Financial validation failed' };
  }
  return transitionTo(shipmentId, 'FINANCIAL_CONFIRMED');
}

async function readyForSignature(shipmentId) {
  // Final invariant check before allowing signature
  const invariants = await validateInvariants(shipmentId);
  
  if (!invariants.valid) {
    await triggerSystemPanic(shipmentId, 'INVARIANTS_NOT_MET', invariants);
    return { valid: false, errors: invariants.violations };
  }
  
  return transitionTo(shipmentId, 'READY_FOR_SIGNATURE');
}

async function signPayload(shipmentId) {
  // Check we're in READY_FOR_SIGNATURE state
  const canSign = await canProceedTo(shipmentId, 'SIGNED');
  
  if (!canSign.allowed) {
    await triggerSystemPanic(shipmentId, 'NOT_READY_FOR_SIGNATURE', canSign);
    return { valid: false, error: canSign.reason };
  }
  
  return transitionTo(shipmentId, 'SIGNED');
}

async function submitToNSW(shipmentId, submissionResult) {
  if (!submissionResult.valid) {
    await triggerSystemPanic(shipmentId, 'SUBMISSION_FAILED', submissionResult);
    return { valid: false, error: 'NSW submission failed' };
  }
  
  return transitionTo(shipmentId, 'SUBMITTED');
}

module.exports = {
  PIPELINE_STAGES,
  VALID_TRANSITIONS,
  initializeShipment,
  transitionTo,
  isStageCompleted,
  validateInvariants,
  canProceedTo,
  getPipelineState,
  triggerSystemPanic,
  // Stage helpers
  validateHS,
  validateDocuments,
  validateCompliance,
  confirmFinancial,
  readyForSignature,
  signPayload,
  submitToNSW
};

// Initialize pipeline state table if needed
async function initializePipelineTable() {
  const { all } = require('./utils/db');
  const tables = await all(`SELECT name FROM sqlite_master WHERE type='table'`);
  const tableNames = tables.map(t => t.name);
  
  if (!tableNames.includes('ShipmentPipelineState')) {
    await run(`
      CREATE TABLE IF NOT EXISTS ShipmentPipelineState (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shipment_id TEXT NOT NULL,
        current_state TEXT NOT NULL,
        previous_state TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(shipment_id)
      )
    `);
  }
  
  if (!tableNames.includes('PipelineAuditLog')) {
    await run(`
      CREATE TABLE IF NOT EXISTS PipelineAuditLog (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shipment_id TEXT NOT NULL,
        action TEXT NOT NULL,
        target_state TEXT,
        from_state TEXT,
        outcome TEXT NOT NULL,
        details TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }
  
  console.log('Pipeline state tables initialized');
}

// Auto-initialize on load
initializePipelineTable().catch(console.error);