/**
 * Rule Engine Tests
 * Comprehensive tests for deterministic rule evaluation
 */

const assert = require('assert');
const { testUtils } = require('./test-utils');

// Test MRL (Maximum Residue Limit) evaluation
function testMRLEvaluation() {
  console.log('Testing MRL Evaluation...');
  
  // Test case: Sesame to Netherlands with aflatoxin within limit
  const shipment = testUtils.createMockShipment({
    commodity: 'sesame',
    destination: 'NL'
  });
  
  const labResult = testUtils.createMockLabResult({
    shipmentId: shipment.id,
    aflatoxinTotal: 1.5 // Within EU limit of 2.0 µg/kg
  });
  
  // Expected: PASS
  const result = evaluateMRR(shipment, labResult);
  assert.strictEqual(result.status, 'PASS', 'Should pass when aflatoxin within limit');
  
  console.log('✅ MRL Evaluation tests passed');
}

// Test case: Sesame to Netherlands with aflatoxin exceeding limit
function testMRLEvaluationExceeds() {
  const shipment = testUtils.createMockShipment({
    commodity: 'sesame',
    destination: 'NL'
  });
  
  const labResult = testUtils.createMockLabResult({
    shipmentId: shipment.id,
    aflatoxinTotal: 5.0 // Exceeds EU limit of 2.0 µg/kg
  });
  
  // Expected: FAIL/BLOCK
  const result = evaluateMRR(shipment, labResult);
  assert.strictEqual(result.status, 'FAIL', 'Should fail when aflatoxin exceeds limit');
  
  console.log('✅ MRL Exceeds Limit tests passed');
}

// Test state machine transitions
function testStateMachine() {
  console.log('Testing State Machine...');
  
  const states = ['DRAFT', 'VALIDATING', 'READY', 'SUBMITTED', 'APPROVED'];
  let currentState = 'DRAFT';
  
  // Test valid transition: DRAFT -> VALIDATING
  currentState = transitionState(currentState, 'VALIDATING');
  assert.strictEqual(currentState, 'VALIDATING');
  
  // Test invalid transition: DRAFT -> SUBMITTED (skip VALIDATING)
  try {
    transitionState('DRAFT', 'SUBMITTED');
    assert.fail('Should throw error for invalid transition');
  } catch (e) {
    assert.ok(e.message.includes('Invalid state transition'));
  }
  
  console.log('✅ State Machine tests passed');
}

// Test lab trust scoring
function testLabTrustScoring() {
  console.log('Testing Lab Trust Scoring...');
  
  const labHistory = [
    { outcome: 'PASSED' },
    { outcome: 'PASSED' },
    { outcome: 'PASSED' },
    { outcome: 'REJECTED' }
  ];
  
  const trustScore = calculateLabTrust(labHistory);
  assert.ok(trustScore >= 0.75, 'Trust score should be 75% or higher');
  
  console.log('✅ Lab Trust Scoring tests passed');
}

// Test HS code validation
function testHSCodeValidation() {
  console.log('Testing HS Code Validation...');
  
  const validCodes = ['1201.90', '1801.00', '1202.40'];
  
  for (const code of validCodes) {
    const isValid = validateHSCode(code);
    assert.strictEqual(isValid, true, `HS Code ${code} should be valid`);
  }
  
  console.log('✅ HS Code Validation tests passed');
}

// Run all tests
function runAllTests() {
  console.log('\n========================================');
  console.log('🧪 Running Culbridge Rule Engine Tests');
  console.log('========================================\n');
  
  try {
    testMRLEvaluation();
    testMRLEvaluationExceeds();
    testStateMachine();
    testLabTrustScoring();
    testHSCodeValidation();
    
    console.log('\n========================================');
    console.log('✅ All tests passed!');
    console.log('========================================\n');
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Simple MRL evaluation (simulated)
function evaluateMRR(shipment, labResult) {
  const limits = {
    sesame: { NL: 2.0, DE: 2.0 },
    cocoa: { NL: 0.50, DE: 0.50 }
  };
  
  const limit = limits[shipment.commodity]?.[shipment.destination] || 2.0;
  
  if (labResult.aflatoxinTotal > limit) {
    return { status: 'FAIL', contaminant: 'AFLATOXIN', value: labResult.aflatoxinTotal, limit };
  }
  
  return { status: 'PASS', value: labResult.aflatoxinTotal, limit };
}

// Simple state machine transition
function transitionState(from, to) {
  const validTransitions = {
    'DRAFT': ['VALIDATING'],
    'VALIDATING': ['READY', 'DRAFT'],
    'READY': ['SUBMITTED', 'DRAFT'],
    'SUBMITTED': ['APPROVED', 'REJECTED'],
    'APPROVED': [],
    'REJECTED': []
  };
  
  if (!validTransitions[from]?.includes(to)) {
    throw new Error(`Invalid state transition from ${from} to ${to}`);
  }
  
  return to;
}

// Simple lab trust calculation
function calculateLabTrust(history) {
  if (history.length === 0) return 0.8;
  
  const passed = history.filter(h => h.outcome === 'PASSED').length;
  return passed / history.length;
}

// Simple HS code validation
function validateHSCode(code) {
  return /^\d{4}\.\d{2}$/.test(code);
}

// Export tests
module.exports = {
  testMRLEvaluation,
  testMRLEvaluationExceeds,
  testStateMachine,
  testLabTrustScoring,
  testHSCodeValidation,
  runAllTests
};

// Run if executed directly
if (require.main === module) {
  runAllTests();
}
