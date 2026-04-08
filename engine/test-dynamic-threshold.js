/**
 * Unit Tests - Dynamic Threshold Engine
 * 
 * Tests for:
 * 1. Risk-adjusted thresholds
 * 2. RASFF alert impact on rules
 * 3. BLOCKER/WARNING evaluation logic
 * 4. Threshold adjustment factors
 * 
 * Version: 1.0
 */

const assert = require('assert');
const dynamicThresholds = require('./dynamic-threshold-engine');

// =====================================================
// TEST HELPERS
// =====================================================

function createMockShipment(overrides = {}) {
  return {
    id: 'test_shipment_001',
    shipment_id: 'test_shipment_001',
    exporterId: 'exporter_test',
    originCountry: 'Nigeria',
    destinationCountry: 'Netherlands',
    productCategory: 'sesame',
    documents: ['LAB_REPORT', 'CERTIFICATE'],
    labResults: {
      aflatoxinB1: 1.5,
      aflatoxinTotal: 3.0,
      salmonella: 0
    },
    ...overrides
  };
}

// =====================================================
// TEST RUNNER
// =====================================================

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
    failed++;
  }
}

function section(name) {
  console.log(`\n${name}`);
}

// =====================================================
// TESTS: THRESHOLD RETRIEVAL
// =====================================================

section('Threshold Retrieval');

test('should get threshold for sesame → NL for aflatoxinB1', () => {
  const threshold = dynamicThresholds.getThreshold(
    'sesame', 'Nigeria', 'Netherlands', 'aflatoxinB1'
  );
  assert(threshold, 'Threshold should exist');
  assert.strictEqual(threshold.maxAllowed, 2.0);
});

test('should get threshold for sesame → NL for salmonella (zero tolerance)', () => {
  const threshold = dynamicThresholds.getThreshold(
    'sesame', 'Nigeria', 'Netherlands', 'salmonella'
  );
  assert(threshold, 'Threshold should exist');
  assert.strictEqual(threshold.maxAllowed, 0);
  assert.strictEqual(threshold.isZeroTolerance, true);
});

test('should get threshold for groundnuts → NL', () => {
  const threshold = dynamicThresholds.getThreshold(
    'groundnuts', 'Nigeria', 'Netherlands', 'aflatoxinB1'
  );
  assert(threshold, 'Threshold should exist');
  assert.strictEqual(threshold.maxAllowed, 8.0);
});

test('should return null for unknown product/hazard', () => {
  const threshold = dynamicThresholds.getThreshold(
    'unknown_product', 'Nigeria', 'Netherlands', 'unknown_hazard'
  );
  assert.strictEqual(threshold, null);
});

// =====================================================
// TESTS: RISK PROFILE BUILDING
// =====================================================

section('Risk Profile Building');

test('should build risk profile with default values for new exporter', () => {
  const shipment = createMockShipment({ exporterId: 'new_exporter' });
  const riskProfile = dynamicThresholds.buildRiskProfile(shipment);
  assert(riskProfile, 'Risk profile should exist');
  assert.strictEqual(riskProfile.exporterId, 'new_exporter');
});

test('should calculate RASFF alerts from data', () => {
  const shipment = createMockShipment({
    originCountry: 'Nigeria',
    productCategory: 'sesame'
  });
  const riskProfile = dynamicThresholds.buildRiskProfile(shipment);
  assert(riskProfile.rasffAlerts.length > 0, 'Should have RASFF alerts');
});

test('should compute risk score based on RASFF rejection rate', () => {
  const shipment = createMockShipment({
    originCountry: 'Nigeria',
    productCategory: 'sesame'
  });
  const riskProfile = dynamicThresholds.buildRiskProfile(shipment);
  assert(riskProfile.computedRiskScore > 0, 'Risk score should be elevated');
});

// =====================================================
// TESTS: THRESHOLD ADJUSTMENT
// =====================================================

section('Threshold Adjustment');

test('should apply base threshold for low-risk profile', () => {
  const shipment = createMockShipment({
    exporterId: 'good_exporter',
    originCountry: 'Ghana',
    productCategory: 'sesame'
  });
  
  const result = dynamicThresholds.adjustThresholdsForShipment(shipment);
  assert(result, 'Adjustment result should exist');
  assert(result.adjustedThresholds, 'Should have adjusted thresholds');
});

test('should adjust threshold for high-risk exporter', () => {
  const shipment = createMockShipment({
    originCountry: 'Nigeria',
    productCategory: 'sesame'
  });
  
  const result = dynamicThresholds.adjustThresholdsForShipment(shipment);
  const aflatoxinAdjustment = result.adjustedThresholds.aflatoxinB1;
  assert(aflatoxinAdjustment, 'Should have aflatoxin adjustment');
});

test('should apply stricter threshold based on country risk', () => {
  const shipment = createMockShipment({
    originCountry: 'Nigeria',
    productCategory: 'sesame'
  });
  
  const result = dynamicThresholds.adjustThresholdsForShipment(shipment);
  const countryRisk = result.riskProfile.countryRiskFlags.salmonella;
  assert(countryRisk === 'HIGH', 'Nigeria should be HIGH for salmonella');
});

test('should apply zero tolerance for high RASFF rejection corridors', () => {
  const shipment = createMockShipment({
    originCountry: 'Nigeria',
    productCategory: 'sesame'
  });
  
  const result = dynamicThresholds.adjustThresholdsForShipment(shipment);
  const salmonellaAdjustment = result.adjustedThresholds.salmonella;
  assert.strictEqual(salmonellaAdjustment.adjustedThreshold, 0,
    'Should apply zero tolerance');
});

// =====================================================
// TESTS: LAB RESULT EVALUATION
// =====================================================

section('Lab Result Evaluation');

test('should PASS when value is below adjusted threshold', () => {
  const threshold = {
    baseThreshold: { value: 2.0, unit: 'μg/kg', isZeroTolerance: false },
    adjustedThreshold: 2.0,
    adjustmentFactor: 1.0
  };
  
  const result = dynamicThresholds.evaluateLabResult(
    { value: 1.5 }, threshold, 'aflatoxinB1'
  );
  assert.strictEqual(result.passed, true);
  assert.strictEqual(result.result, 'PASS');
});

test('should BLOCK when value exceeds adjusted threshold', () => {
  const threshold = {
    baseThreshold: { value: 2.0, unit: 'μg/kg', isZeroTolerance: false },
    adjustedThreshold: 2.0,
    adjustmentFactor: 1.0
  };
  
  const result = dynamicThresholds.evaluateLabResult(
    { value: 2.5 }, threshold, 'aflatoxinB1'
  );
  assert.strictEqual(result.passed, false);
  assert.strictEqual(result.result, 'BLOCKER');
});

test('should BLOCK when any value detected with zero tolerance', () => {
  const threshold = {
    baseThreshold: { value: 0, unit: 'cfu/25g', isZeroTolerance: true },
    adjustedThreshold: 0,
    adjustmentFactor: 1.0
  };
  
  const result = dynamicThresholds.evaluateLabResult(
    { value: 1 }, threshold, 'salmonella'
  );
  assert.strictEqual(result.passed, false);
  assert.strictEqual(result.result, 'BLOCKER');
  assert(result.message.includes('zero tolerance'));
});

test('should PASS when zero tolerance hazard not detected', () => {
  const threshold = {
    baseThreshold: { value: 0, unit: 'cfu/25g', isZeroTolerance: true },
    adjustedThreshold: 0,
    adjustmentFactor: 1.0
  };
  
  const result = dynamicThresholds.evaluateLabResult(
    { value: 0 }, threshold, 'salmonella'
  );
  assert.strictEqual(result.passed, true);
  assert.strictEqual(result.result, 'PASS');
});

test('should apply stricter limit for high-risk profile', () => {
  const threshold = {
    baseThreshold: { value: 2.0, unit: 'μg/kg', isZeroTolerance: false },
    adjustedThreshold: 1.6,
    adjustmentFactor: 0.8
  };
  
  const result = dynamicThresholds.evaluateLabResult(
    { value: 1.8 }, threshold, 'aflatoxinB1'
  );
  assert.strictEqual(result.passed, false);
  assert.strictEqual(result.result, 'BLOCKER');
});

// =====================================================
// TESTS: AUDIT LOGGING
// =====================================================

section('Audit Logging');

test('should create audit entry for threshold evaluation', () => {
  const evaluation = {
    passed: false,
    result: 'BLOCKER',
    details: { value: 2.5, limit: '2.00', adjustmentFactor: 1.0, baseLimit: 2.0 }
  };
  
  const auditId = dynamicThresholds.logThresholdAudit(
    'test_shipment_001', 'THRESHOLD_AFLATOXIN', evaluation
  );
  
  // auditId could be a string or an object with auditId property
  const id = typeof auditId === 'string' ? auditId : (auditId.auditId || auditId);
  assert(id && typeof id === 'string', 'Should return audit ID string');
  assert(id.includes('THRESHOLD_AUDIT'), 'Should have correct prefix');
});

test('should retrieve audit entries for shipment', () => {
  const audits = dynamicThresholds.getThresholdAudit('test_shipment_001');
  assert(Array.isArray(audits), 'Should return array');
});

// =====================================================
// TESTS: THRESHOLD VERSIONING
// =====================================================

section('Versioning');

test('should return current version info', () => {
  const versionInfo = dynamicThresholds.getThresholdVersion();
  assert(versionInfo, 'Version info should exist');
  assert(versionInfo.version, 'Should have version string');
  assert(versionInfo.thresholdCount > 0, 'Should have threshold count');
});

test('should update threshold and increment version', () => {
  const beforeVersion = dynamicThresholds.getThresholdVersion();
  
  const newThreshold = dynamicThresholds.updateThreshold(
    'sesame', 'NG-NL', 'aflatoxinB1', 1.5, 'TEST_REGULATION'
  );
  
  const afterVersion = dynamicThresholds.getThresholdVersion();
  
  assert(newThreshold, 'Should return new threshold');
  assert.strictEqual(newThreshold.maxAllowed, 1.5);
  assert(afterVersion.version !== beforeVersion.version, 'Version should increment');
});

// =====================================================
// TESTS: INTEGRATION SCENARIOS
// =====================================================

section('Integration Scenarios');

test('should handle sesame from Nigeria → NL with all hazards', () => {
  const shipment = createMockShipment({
    originCountry: 'Nigeria',
    destinationCountry: 'Netherlands',
    productCategory: 'sesame',
    labResults: { aflatoxinB1: 1.8, aflatoxinTotal: 3.5, salmonella: 0 }
  });
  
  const result = dynamicThresholds.adjustThresholdsForShipment(shipment);
  
  assert(result.adjustedThresholds.aflatoxinB1, 'Should have aflatoxinB1');
  assert(result.adjustedThresholds.aflatoxinTotal, 'Should have aflatoxinTotal');
  assert(result.adjustedThresholds.salmonella, 'Should have salmonella');
  assert(result.riskProfile.computedRiskScore > 0, 'Risk score should be computed');
});

test('should block shipment exceeding dynamic threshold', () => {
  const shipment = createMockShipment({
    originCountry: 'Nigeria',
    destinationCountry: 'Netherlands',
    productCategory: 'sesame',
    labResults: { aflatoxinB1: 5.0, aflatoxinTotal: 8.0, salmonella: 0 }
  });
  
  const thresholdResult = dynamicThresholds.adjustThresholdsForShipment(shipment);
  
  const evaluation = dynamicThresholds.evaluateLabResult(
    { value: 5.0 },
    thresholdResult.adjustedThresholds.aflatoxinB1,
    'aflatoxinB1'
  );
  
  assert.strictEqual(evaluation.result, 'BLOCKER', 'Should block excessive value');
});

// =====================================================
// SUMMARY
// =====================================================

console.log(`\n=== TEST SUMMARY ===`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total: ${passed + failed}`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log('\n✓ All tests passed!');
  process.exit(0);
}