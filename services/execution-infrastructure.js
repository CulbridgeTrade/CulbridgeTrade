/**
 * Execution Infrastructure Service - Orchestrates deterministic export compliance
 * 
 * Integrates:
 * - Evaluation Engine (PASS|BLOCKED|RISK)
 * - State Machine (pipeline enforcement)
 * - Execution Tracking (real-world confirmation)
 * - Validity Windows (time-sensitive compliance)
 * - Port Intelligence (Rotterdam vs Hamburg)
 * - Override Detection
 */

const evaluationEngine = require('./evaluation-engine');
const pipelineStateMachine = require('./engine/pipeline-state-machine');
const executionTracking = require('./services/execution-tracking');

/**
 * Main execution entry point
 * Takes shipment through complete deterministic workflow
 */
async function executeShipment(shipmentInput) {
  const shipmentId = shipmentInput.shipment_id || `SHP-${Date.now()}`;
  const timestamp = new Date().toISOString();
  
  const executionResult = {
    shipment_id: shipmentId,
    started_at: timestamp,
    stages: []
  };
  
  try {
    // Stage 1: Input Validation (Hard Constraint: No missing inputs)
    const validationResult = validateInput(shipmentInput);
    if (!validationResult.valid) {
      return buildResult('BLOCKED', validationResult.errors, [], executionResult);
    }
    
    executionResult.stages.push({
      stage: 'INPUT_VALIDATION',
      status: 'PASS',
      output: validationResult
    });
    
    // Initialize in pipeline
    await pipelineStateMachine.initializeShipment(shipmentId);
    
    // Stage 2: Deterministic Evaluation
    const evaluation = evaluationEngine.evaluateDeterministic(shipmentInput);
    
    executionResult.stages.push({
      stage: 'DETERMINISTIC_EVALUATION',
      status: evaluation.status,
      output: evaluation
    });
    
    if (evaluation.status === 'BLOCKED') {
      await pipelineStateMachine.triggerSystemPanic(shipmentId, 'EVALUATION_BLOCKED', evaluation);
      return buildResult('BLOCKED', evaluation.failures, evaluation.missing, executionResult);
    }
    
    // Transition to compliance passed
    await pipelineStateMachine.transitionTo(shipmentId, 'COMPLIANCE_PASSED');
    
    // Stage 3: Initialize Execution Steps
    if (evaluation.next_actions && evaluation.next_actions.length > 0) {
      await executionTracking.initializeExecution(shipmentId, evaluation.next_actions);
      
      executionResult.stages.push({
        stage: 'EXECUTION_INITIALIZED',
        status: 'INITIATED',
        output: { steps: evaluation.next_actions }
      });
    }
    
    // Stage 4: Apply Port Intelligence
    const portCode = resolvePortCode(shipmentInput.destination);
    if (portCode) {
      const portAdjusted = await executionTracking.applyPortAdjustments(
        shipmentId, 
        evaluation, 
        portCode
      );
      
      executionResult.stages.push({
        stage: 'PORT_INTELLIGENCE',
        status: 'APPLIED',
        output: portAdjusted.port_intelligence || {}
      });
      
      if (portAdjusted.status === 'RISK' && evaluation.status === 'PASS') {
        evaluation.status = 'RISK';
        evaluation.port_warning = portAdjusted.port_adjustment;
      }
    }
    
    // Stage 5: Check Validity Windows (if documents provided)
    if (shipmentInput.document_validity) {
      for (const [docType, validity] of Object.entries(shipmentInput.document_validity)) {
        const windowCheck = await executionTracking.checkValidityWindow(shipmentId, docType);
        if (!windowCheck.valid) {
          evaluation.status = 'BLOCKED';
          evaluation.failures.push({
            rule: 'validity_window',
            reason: windowCheck.reason,
            document_type: docType
          });
        }
      }
    }
    
    executionResult.completed_at = new Date().toISOString();
    
    return buildResult(evaluation.status, evaluation.failures, evaluation.missing, executionResult);
    
  } catch (error) {
    await pipelineStateMachine.triggerSystemPanic(shipmentId, 'EXECUTION_ERROR', { error: error.message });
    return {
      status: 'BLOCKED',
      failures: [{ rule: 'system_error', reason: error.message }],
      missing: [],
      next_actions: [],
      evidence_required: [],
      execution_error: true
    };
  }
}

/**
 * Validate input schema (Hard Constraint: No missing inputs)
 */
function validateInput(shipment) {
  const errors = [];
  const required = ['product', 'origin', 'destination'];
  
  for (const field of required) {
    if (!shipment[field]) {
      errors.push({ field, reason: 'required' });
    }
  }
  
  // Validate product is in allowed list
  const allowedProducts = ['cocoa_beans', 'sesame', 'ginger', 'cashew', 'groundnuts', 'shea_butter'];
  if (shipment.product && !allowedProducts.includes(shipment.product)) {
    errors.push({ field: 'product', reason: 'not_supported' });
  }
  
  // Validate destination ports
  const allowedPorts = ['Netherlands', 'Germany', 'Belgium', 'rotterdam', 'hamburg', 'antwerp'];
  if (shipment.destination && !allowedPorts.includes(shipment.destination.toLowerCase())) {
    errors.push({ field: 'destination', reason: 'not_supported' });
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Resolve port code from destination
 */
function resolvePortCode(destination) {
  const portMap = {
    'netherlands': 'NLRTM',
    'rotterdam': 'NLRTM',
    'nl': 'NLRTM',
    'germany': 'DEHAM',
    'hamburg': 'DEHAM',
    'de': 'DEHAM',
    'belgium': 'BEANR',
    'antwerp': 'BEANR',
    'be': 'BEANR'
  };
  
  return portMap[destination?.toLowerCase()] || null;
}

/**
 * Build standardized output
 */
function buildResult(status, failures, missing, executionResult) {
  return {
    status,
    failures,
    missing,
    next_actions: executionResult.stages
      .find(s => s.stage === 'EXECUTION_INITIALIZED')?.output?.steps || [],
    evidence_required: [],
    execution_pipeline: {
      stages_completed: executionResult.stages.length,
      started_at: executionResult.started_at,
      completed_at: executionResult.completed_at
    }
  };
}

/**
 * Execute a single action and confirm completion
 */
async function executeAction(shipmentId, actionType, actionData = {}) {
  // Check if can execute (dependencies)
  const canExecute = await executionTracking.canExecuteStep(shipmentId, actionType);
  if (!canExecute.can_execute) {
    return {
      success: false,
      blocked: true,
      reason: canExecute.reason,
      blocked_by: canExecute.blocked_by
    };
  }
  
  // Mark as started
  await executionTracking.startStep(shipmentId, actionType);
  
  // In real implementation, this would call external APIs
  // For now, simulate completion
  const result = await simulateActionExecution(actionType, actionData);
  
  if (result.success) {
    await executionTracking.completeStep(shipmentId, actionType, result.output);
  } else {
    await executionTracking.failStep(shipmentId, actionType, result.error);
  }
  
  return result;
}

/**
 * Simulate action execution (placeholder for real integration)
 */
async function simulateActionExecution(actionType, actionData) {
  // In production, these would call:
  // - Lab API for conduct_lab_test
  // - NAQS portal for book_naqs_inspection
  // - NEPC portal for apply_certificate_of_origin
  // - Nigeria Customs for complete_trms_registration
  
  const actionSimulations = {
    'conduct_lab_test': { success: true, output: { lab_report_id: 'LAB-001', results: {} } },
    'apply_certificate_of_origin': { success: true, output: { coo_number: 'COO-001' } },
    'book_naqs_inspection': { success: true, output: { inspection_id: 'INS-001', scheduled_date: new Date().toISOString() } },
    'complete_trms_registration': { success: true, output: { trms_reference: 'TRMS-001' } },
    'submit_eudr_claim': { success: true, output: { eudr_reference: 'EUDR-001' } },
    'submit_pre_notification': { success: true, output: { pre_notification_id: 'PN-001' } },
    'request_export_clearance': { success: true, output: { clearance_reference: 'CL-001' } }
  };
  
  return actionSimulations[actionType] || { success: false, error: 'Unknown action' };
}

/**
 * Get execution status for shipment
 */
async function getShipmentExecutionStatus(shipmentId) {
  const pipeline = await pipelineStateMachine.getPipelineState(shipmentId);
  const execution = await executionTracking.getExecutionStatus(shipmentId);
  
  return {
    pipeline,
    execution,
    ready_for_next_step: execution.all_completed && pipeline.current_state !== 'SUBMITTED'
  };
}

/**
 * Detect and record override
 */
async function recordOverride(shipmentId, systemOutput, userAction, reason) {
  return await executionTracking.detectOverride(shipmentId, systemOutput, userAction, reason);
}

module.exports = {
  executeShipment,
  validateInput,
  executeAction,
  getShipmentExecutionStatus,
  recordOverride,
  resolvePortCode
};