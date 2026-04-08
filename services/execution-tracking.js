/**
 * Execution Tracking Service - Infrastructure-Grade Action Confirmation
 * 
 * Tracks real-world execution of each step with status, timestamps, and output.
 * Enforces that steps cannot proceed until prior step is confirmed complete.
 */

const { run, get, all } = require('./utils/db');

const ACTION_TYPES = {
  LAB_TEST: 'conduct_lab_test',
  NAQS_INSPECTION: 'book_naqs_inspection',
  COO_ISSUANCE: 'apply_certificate_of_origin',
  TRMS_REGISTRATION: 'complete_trms_registration',
  EUDR_SUBMISSION: 'submit_eudr_claim',
  PRE_NOTIFICATION: 'submit_pre_notification',
  FINAL_CLEARANCE: 'request_export_clearance'
};

const EXECUTION_STATUS = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  BLOCKED: 'BLOCKED'
};

const STEP_DEPENDENCIES = {
  'conduct_lab_test': [],
  'apply_certificate_of_origin': ['conduct_lab_test'],
  'book_naqs_inspection': ['apply_certificate_of_origin'],
  'complete_trms_registration': ['book_naqs_inspection'],
  'submit_eudr_claim': ['complete_trms_registration'],
  'submit_pre_notification': ['submit_eudr_claim'],
  'request_export_clearance': ['submit_pre_notification']
};

/**
 * Initialize execution tracking for a shipment based on next_actions
 */
async function initializeExecution(shipmentId, nextActions) {
  const results = [];
  
  for (const action of nextActions) {
    const result = await createExecutionStep(shipmentId, action.step, action.action);
    results.push(result);
  }
  
  return results;
}

/**
 * Create a single execution step
 */
async function createExecutionStep(shipmentId, stepNumber, actionType) {
  const stepName = `step_${stepNumber}_${actionType}`;
  
  await run(
    `INSERT INTO execution_tracking (shipment_id, step_name, action_type, status, scheduled_at)
     VALUES (?, ?, ?, ?, ?)`,
    [shipmentId, stepName, actionType, EXECUTION_STATUS.PENDING, new Date().toISOString()]
  );
  
  return { step: stepNumber, action: actionType, status: EXECUTION_STATUS.PENDING };
}

/**
 * Check if a step can be executed (dependencies complete)
 */
async function canExecuteStep(shipmentId, actionType) {
  const dependencies = STEP_DEPENDENCIES[actionType] || [];
  
  for (const depAction of dependencies) {
    const depStep = await get(
      `SELECT status FROM execution_tracking WHERE shipment_id = ? AND action_type = ? ORDER BY id DESC LIMIT 1`,
      [shipmentId, depAction]
    );
    
    if (!depStep || depStep.status !== EXECUTION_STATUS.COMPLETED) {
      return {
        can_execute: false,
        blocked_by: depAction,
        reason: `Dependency ${depAction} not completed`
      };
    }
  }
  
  return { can_execute: true };
}

/**
 * Mark step as started
 */
async function startStep(shipmentId, actionType) {
  const canExecute = await canExecuteStep(shipmentId, actionType);
  
  if (!canExecute.can_execute) {
    return {
      success: false,
      error: canExecute.reason,
      blocked: true
    };
  }
  
  await run(
    `UPDATE execution_tracking SET status = ?, started_at = ? 
     WHERE shipment_id = ? AND action_type = ? AND status = ?`,
    [EXECUTION_STATUS.IN_PROGRESS, new Date().toISOString(), shipmentId, actionType, EXECUTION_STATUS.PENDING]
  );
  
  return { success: true, status: EXECUTION_STATUS.IN_PROGRESS };
}

/**
 * Mark step as completed with output
 */
async function completeStep(shipmentId, actionType, outputData = {}) {
  await run(
    `UPDATE execution_tracking SET status = ?, completed_at = ?, output_data = ? 
     WHERE shipment_id = ? AND action_type = ?`,
    [EXECUTION_STATUS.COMPLETED, new Date().toISOString(), JSON.stringify(outputData), shipmentId, actionType]
  );
  
  return { success: true, status: EXECUTION_STATUS.COMPLETED };
}

/**
 * Mark step as failed
 */
async function failStep(shipmentId, actionType, failureReason) {
  await run(
    `UPDATE execution_tracking SET status = ?, failed_at = ?, failure_reason = ? 
     WHERE shipment_id = ? AND action_type = ?`,
    [EXECUTION_STATUS.FAILED, new Date().toISOString(), failureReason, shipmentId, actionType]
  );
  
  return { success: false, status: EXECUTION_STATUS.FAILED, reason: failureReason };
}

/**
 * Get execution status for shipment
 */
async function getExecutionStatus(shipmentId) {
  const steps = await all(
    `SELECT step_name, action_type, status, started_at, completed_at, failure_reason 
     FROM execution_tracking WHERE shipment_id = ? ORDER BY id`,
    [shipmentId]
  );
  
  const pending = steps.filter(s => s.status === EXECUTION_STATUS.PENDING).length;
  const inProgress = steps.filter(s => s.status === EXECUTION_STATUS.IN_PROGRESS).length;
  const completed = steps.filter(s => s.status === EXECUTION_STATUS.COMPLETED).length;
  const failed = steps.filter(s => s.status === EXECUTION_STATUS.FAILED).length;
  
  return {
    shipment_id: shipmentId,
    total_steps: steps.length,
    completed,
    in_progress: inProgress,
    pending,
    failed,
    all_completed: failed === 0 && pending === 0 && inProgress === 0,
    steps: steps.map(s => ({
      step: s.step_name,
      action: s.action_type,
      status: s.status,
      completed_at: s.completed_at,
      failure: s.failure_reason
    }))
  };
}

/**
 * Detect agent override (deviation from system output)
 */
async function detectOverride(shipmentId, systemOutput, overrideAction, overrideReason = '') {
  const deviation = {
    deviation_detected: true,
    system_expected: systemOutput,
    user_action: overrideAction,
    reason: overrideReason,
    timestamp: new Date().toISOString()
  };
  
  await run(
    `INSERT INTO override_detections (shipment_id, system_output, override_action, override_reason)
     VALUES (?, ?, ?, ?)`,
    [shipmentId, JSON.stringify(systemOutput), overrideAction, overrideReason]
  );
  
  return deviation;
}

/**
 * Get override history for shipment
 */
async function getOverrideHistory(shipmentId) {
  return await all(
    `SELECT * FROM override_detections WHERE shipment_id = ? ORDER BY detected_at DESC`,
    [shipmentId]
  );
}

/**
 * Validate time-sensitive validity windows
 */
async function checkValidityWindow(shipmentId, documentType) {
  const window = await get(
    `SELECT * FROM validity_windows WHERE shipment_id = ? AND document_type = ? AND is_active = 1`,
    [shipmentId, documentType]
  );
  
  if (!window) {
    return { valid: false, reason: 'No validity window found' };
  }
  
  const now = new Date();
  const validFrom = new Date(window.valid_from);
  const validUntil = new Date(window.valid_until);
  
  if (now < validFrom) {
    return { valid: false, reason: 'Not yet valid', valid_from: validFrom };
  }
  
  if (now > validUntil) {
    return { valid: false, reason: 'Expired', expired_at: validUntil };
  }
  
  return { 
    valid: true, 
    remaining_days: Math.ceil((validUntil - now) / (1000 * 60 * 60 * 24))
  };
}

/**
 * Get port intelligence
 */
async function getPortIntelligence(portCode) {
  return await get(
    `SELECT * FROM port_intelligence WHERE port_code = ?`,
    [portCode]
  );
}

/**
 * Apply port-specific adjustments to evaluation
 */
async function applyPortAdjustments(shipmentId, evaluation, destinationPort) {
  const portIntel = await getPortIntelligence(destinationPort);
  
  if (!portIntel) {
    return evaluation;
  }
  
  const adjusted = { ...evaluation };
  
  if (portIntel.inspection_probability > 0.5) {
    if (adjusted.status === 'PASS') {
      adjusted.status = 'RISK';
      adjusted.port_adjustment = `High inspection port: ${portIntel.port_name}`;
    }
  }
  
  adjusted.port_intelligence = {
    port: portIntel.port_name,
    inspection_probability: portIntel.inspection_probability,
    strictness_level: portIntel.strictness_level,
    avg_clearance_days: portIntel.avg_clearance_days
  };
  
  return adjusted;
}

module.exports = {
  ACTION_TYPES,
  EXECUTION_STATUS,
  STEP_DEPENDENCIES,
  initializeExecution,
  createExecutionStep,
  canExecuteStep,
  startStep,
  completeStep,
  failStep,
  getExecutionStatus,
  detectOverride,
  getOverrideHistory,
  checkValidityWindow,
  getPortIntelligence,
  applyPortAdjustments
};