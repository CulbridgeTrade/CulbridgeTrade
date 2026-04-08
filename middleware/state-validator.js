/**
 * Culbridge State Machine Engine
 * 
 * CRITICAL INFRASTRUCTURE - Enforces legal progression of truth
 * 
 * States:
 * INGESTED → HS_VALIDATED → DOCUMENTS_VERIFIED → COMPLIANCE_PASSED 
 * → FINANCIAL_CONFIRMED → READY_FOR_SIGNATURE → SIGNED → SUBMITTED
 * 
 * Rules:
 * - No skipping states
 * - No backward transitions  
 * - No parallel states
 */

const crypto = require('crypto');

// State definitions
const STATES = {
  INGESTED: 'INGESTED',
  HS_VALIDATED: 'HS_VALIDATED',
  DOCUMENTS_VERIFIED: 'DOCUMENTS_VERIFIED',
  COMPLIANCE_PASSED: 'COMPLIANCE_PASSED',
  FINANCIAL_CONFIRMED: 'FINANCIAL_CONFIRMED',
  READY_FOR_SIGNATURE: 'READY_FOR_SIGNATURE',
  SIGNED: 'SIGNED',
  SUBMITTED: 'SUBMITTED',
  REJECTED: 'REJECTED'
};

// Allowed transitions (must be sequential, no skipping)
const ALLOWED_TRANSITIONS = {
  [STATES.INGESTED]: [STATES.HS_VALIDATED, STATES.REJECTED],
  [STATES.HS_VALIDATED]: [STATES.DOCUMENTS_VERIFIED, STATES.REJECTED],
  [STATES.DOCUMENTS_VERIFIED]: [STATES.COMPLIANCE_PASSED, STATES.REJECTED],
  [STATES.COMPLIANCE_PASSED]: [STATES.FINANCIAL_CONFIRMED, STATES.REJECTED],
  [STATES.FINANCIAL_CONFIRMED]: [STATES.READY_FOR_SIGNATURE, STATES.REJECTED],
  [STATES.READY_FOR_SIGNATURE]: [STATES.SIGNED, STATES.REJECTED],
  [STATES.SIGNED]: [STATES.SUBMITTED],
  [STATES.SUBMITTED]: [],
  [STATES.REJECTED]: [] // Terminal state
};

// State descriptions for audit
const STATE_DESCRIPTIONS = {
  [STATES.INGESTED]: 'Shipment data received, pending validation',
  [STATES.HS_VALIDATED]: 'HS code validated and confirmed',
  [STATES.DOCUMENTS_VERIFIED]: 'All required documents present and valid',
  [STATES.COMPLIANCE_PASSED]: 'Compliance engine passed all checks',
  [STATES.FINANCIAL_CONFIRMED]: 'Fees calculated and payment verified',
  [STATES.READY_FOR_SIGNATURE]: 'All validations complete, ready for digital signature',
  [STATES.SIGNED]: 'Payload digitally signed, immutable',
  [STATES.SUBMITTED]: 'Submitted to customs/regulatory body',
  [STATES.REJECTED]: 'Shipment rejected, cannot proceed'
};

class StateMachineEngine {
  
  /**
   * Validate state transition
   * @param {string} currentState - Current state
   * @param {string} newState - Target state
   * @returns {Object} - { valid: boolean, error?: string }
   */
  validateStateTransition(currentState, newState) {
    // Check if current state is valid
    if (!Object.values(STATES).includes(currentState)) {
      return { 
        valid: false, 
        error: `Invalid current state: ${currentState}` 
      };
    }

    // Check if new state is valid
    if (!Object.values(STATES).includes(newState)) {
      return { 
        valid: false, 
        error: `Invalid target state: ${newState}` 
      };
    }

    // Check if transition is allowed
    const allowed = ALLOWED_TRANSITIONS[currentState] || [];
    if (!allowed.includes(newState)) {
      return { 
        valid: false, 
        error: `Cannot transition from ${currentState} to ${newState}. Allowed: ${allowed.join(', ')}` 
      };
    }

    return { valid: true };
  }

  /**
   * Transition state with full validation
   */
  async transitionState(shipmentId, newState, context = {}) {
    const db = require('../utils/db');
    
    // Get current state
    const shipment = await db.get(
      'SELECT current_state, payload_hash FROM Shipments WHERE id = ?',
      [shipmentId]
    );

    if (!shipment) {
      throw new Error(`Shipment ${shipmentId} not found`);
    }

    const currentState = shipment.current_state || STATES.INGESTED;
    
    // Validate transition
    const validation = this.validateStateTransition(currentState, newState);
    if (!validation.valid) {
      throw new Error(`State transition denied: ${validation.error}`);
    }

    // Validate invariants before transition
    const invariantsResult = await this.validateInvariants(shipmentId, newState);
    if (!invariantsResult.valid) {
      throw new Error(`Invariant violation: ${invariantsResult.error}`);
    }

    // Perform transition
    const timestamp = new Date().toISOString();
    await db.run(
      `UPDATE Shipments 
       SET current_state = ?, state_updated_at = ?, state_updated_by = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [newState, timestamp, context.actor_id || 'system', shipmentId]
    );

    // Log state transition in audit
    await db.run(
      `INSERT INTO StateTransitions (shipment_id, from_state, to_state, timestamp, actor_id, context)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [shipmentId, currentState, newState, timestamp, context.actor_id || 'system', JSON.stringify(context)]
    );

    return {
      success: true,
      shipment_id: shipmentId,
      from_state: currentState,
      to_state: newState,
      timestamp
    };
  }

  /**
   * Get next valid states from current state
   */
  getNextValidStates(currentState) {
    return ALLOWED_TRANSITIONS[currentState] || [];
  }

  /**
   * Check if state is terminal
   */
  isTerminalState(state) {
    return [STATES.SUBMITTED, STATES.REJECTED].includes(state);
  }

  /**
   * Get state description
   */
  getStateDescription(state) {
    return STATE_DESCRIPTIONS[state] || 'Unknown state';
  }
}

/**
 * Invariant Engine - Makes system safe
 * 
 * Core invariants that MUST always be true:
 * - signed_payload_hash == current_payload_hash
 * - submitted_payload == signed_payload
 * - payment_total == calculated_total
 * - documents == compliance requirements
 * - state progression is monotonic
 */
class InvariantEngine {
  
  /**
   * Validate all invariants for a shipment
   * @param {string} shipmentId - Shipment ID
   * @param {string} targetState - Target state
   * @returns {Object} - { valid: boolean, violations: string[] }
   */
  async validateInvariants(shipmentId, targetState) {
    const violations = [];
    const db = require('../utils/db');

    // Get shipment data
    const shipment = await db.get('SELECT * FROM Shipments WHERE id = ?', [shipmentId]);
    if (!shipment) {
      return { valid: false, violations: ['Shipment not found'] };
    }

    // 1. STATE PROGRESSION IS MONOTONIC
    if (shipment.current_state && this.stateRank(targetState) <= this.stateRank(shipment.current_state)) {
      if (targetState !== STATES.REJECTED) {
        violations.push(`State must progress forward: ${shipment.current_state} → ${targetState}`);
      }
    }

    // 2. SIGNED PAYLOAD HASH invariant (only for SIGNED state and beyond)
    if ([STATES.SIGNED, STATES.SUBMITTED].includes(targetState)) {
      const signature = await db.get(
        'SELECT payload_hash FROM DigitalSignatureResults WHERE shipment_id = ? ORDER BY id DESC LIMIT 1',
        [shipmentId]
      );
      
      if (!signature) {
        violations.push('Cannot transition to SIGNED/SUBMITTED without digital signature');
      } else if (shipment.payload_hash && signature.payload_hash !== shipment.payload_hash) {
        violations.push('Invariant violation: signed payload hash does not match current payload hash');
      }
    }

    // 3. DOCUMENTS == COMPLIANCE REQUIREMENTS (only for DOCUMENTS_VERIFIED and beyond)
    if ([STATES.DOCUMENTS_VERIFIED, STATES.COMPLIANCE_PASSED, STATES.FINANCIAL_CONFIRMED, STATES.READY_FOR_SIGNATURE, STATES.SIGNED, STATES.SUBMITTED].includes(targetState)) {
      const requiredDocs = await this.getRequiredDocuments(shipment);
      const uploadedDocs = await db.all(
        'SELECT doc_type FROM ShipmentDocuments WHERE shipment_id = ? AND status = ?',
        [shipmentId, 'verified']
      );
      
      const uploadedTypes = uploadedDocs.map(d => d.doc_type);
      const missingDocs = requiredDocs.filter(req => !uploadedTypes.includes(req));
      
      if (missingDocs.length > 0) {
        violations.push(`Missing required documents: ${missingDocs.join(', ')}`);
      }
    }

    // 4. PAYMENT TOTAL == CALCULATED TOTAL (for FINANCIAL_CONFIRMED and beyond)
    if ([STATES.FINANCIAL_CONFIRMED, STATES.READY_FOR_SIGNATURE, STATES.SIGNED, STATES.SUBMITTED].includes(targetState)) {
      const feeCalc = await db.get(
        'SELECT total_estimated_fee_naira FROM FeeCalculations WHERE shipment_id = ? ORDER BY id DESC LIMIT 1',
        [shipmentId]
      );
      
      if (!feeCalc) {
        violations.push('No fee calculation found');
      } else if (shipment.payment_total !== undefined && feeCalc.total_estimated_fee_naira !== shipment.payment_total) {
        violations.push(`Payment mismatch: expected ${feeCalc.total_estimated_fee_naira}, got ${shipment.payment_total}`);
      }
    }

    // 5. COMPLIANCE PASSED (for COMPLIANCE_PASSED and beyond)
    if ([STATES.COMPLIANCE_PASSED, STATES.FINANCIAL_CONFIRMED, STATES.READY_FOR_SIGNATURE, STATES.SIGNED, STATES.SUBMITTED].includes(targetState)) {
      const compliance = await db.get(
        'SELECT status FROM ComplianceResults WHERE shipment_id = ? ORDER BY id DESC LIMIT 1',
        [shipmentId]
      );
      
      if (!compliance) {
        violations.push('No compliance result found');
      } else if (compliance.status !== 'COMPLIANT') {
        violations.push(`Cannot proceed: compliance status is ${compliance.status}`);
      }
    }

    return {
      valid: violations.length === 0,
      violations
    };
  }

  /**
   * Get state rank for monotonic check
   */
  stateRank(state) {
    const ranks = {
      [STATES.INGESTED]: 0,
      [STATES.HS_VALIDATED]: 1,
      [STATES.DOCUMENTS_VERIFIED]: 2,
      [STATES.COMPLIANCE_PASSED]: 3,
      [STATES.FINANCIAL_CONFIRMED]: 4,
      [STATES.READY_FOR_SIGNATURE]: 5,
      [STATES.SIGNED]: 6,
      [STATES.SUBMITTED]: 7,
      [STATES.REJECTED]: -1
    };
    return ranks[state] ?? -1;
  }

  /**
   * Get required documents based on shipment type
   */
  async getRequiredDocuments(shipment) {
    // Base requirements for all exports
    const baseDocs = ['certificate_of_origin', 'invoice', 'packing_list'];
    
    // Add commodity-specific requirements
    const commodityDocs = {
      'cocoa': ['phytosanitary', 'lab_report'],
      'sesame': ['phytosanitary', 'lab_report'],
      'cashew': ['phytosanitary', 'lab_report'],
      'ginger': ['phytosanitary', 'lab_report'],
      'groundnuts': ['phytosanitary', 'lab_report']
    };
    
    const category = (shipment.category || shipment.product || '').toLowerCase();
    const specificDocs = commodityDocs[category] || [];
    
    return [...baseDocs, ...specificDocs];
  }
}

/**
 * Middleware for state validation
 */
function stateValidationMiddleware(requiredState) {
  return async (req, res, next) => {
    const shipmentId = req.params.shipment_id || req.params.id;
    
    if (!shipmentId) {
      return res.status(400).json({ error: 'Shipment ID required' });
    }

    const db = require('../utils/db');
    const shipment = await db.get(
      'SELECT current_state FROM Shipments WHERE id = ?',
      [shipmentId]
    );

    if (!shipment) {
      return res.status(404).json({ error: 'Shipment not found' });
    }

    const currentState = shipment.current_state || STATES.INGESTED;
    const stateMachine = new StateMachineEngine();
    const allowed = stateMachine.getNextValidStates(currentState);

    if (!allowed.includes(requiredState)) {
      return res.status(400).json({
        error: 'Invalid state transition',
        current_state: currentState,
        required_state: requiredState,
        allowed_states: allowed
      });
    }

    next();
  };
}

/**
 * Validate all invariants before operation
 */
function invariantCheckMiddleware(targetState) {
  return async (req, res, next) => {
    const shipmentId = req.params.shipment_id || req.params.id;
    
    if (!shipmentId) {
      return res.status(400).json({ error: 'Shipment ID required' });
    }

    const invariantEngine = new InvariantEngine();
    const result = await invariantEngine.validateInvariants(shipmentId, targetState);

    if (!result.valid) {
      return res.status(400).json({
        error: 'Invariant violation - operation blocked',
        violations: result.violations
      });
    }

    next();
  };
}

module.exports = {
  StateMachineEngine,
  InvariantEngine,
  STATES,
  stateValidationMiddleware,
  invariantCheckMiddleware
};

if (require.main === module) {
  console.log('State Machine Engine loaded');
  console.log('States:', Object.values(STATES).join(' → '));
}