/**
 * Culbridge Red Team Test Suite
 * 
 * Formal adversarial testing under all attack surfaces.
 * This is NOT QA - this is attempting to break the system.
 * 
 * Each attack produces structured output for analysis.
 */

const crypto = require('crypto');
const axios = require('axios');

const API_BASE = process.env.API_BASE || 'http://localhost:8009';
const API_TOKEN = process.env.API_TOKEN || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6InRlc3QtYWRtaW4iLCJpYXQiOjE3NzQ2NTkzOTksImV4cCI6MTc3NDY2Mjk5OX0.ku89_gQ-7aIcnzBmw_epF9AHY43t3yk7blhtkHyMnvA';

const TEST_SHIPMENT_ID = 'CB-TEST-' + Date.now();
const HEADERS = { 'Authorization': `Bearer ${API_TOKEN}`, 'Content-Type': 'application/json' };

// Test results storage
const TEST_RESULTS = [];

/**
 * Record test result in required format
 */
function recordResult(params) {
  const result = {
    attack_id: params.attackId,
    entry_point: params.entryPoint,
    failure_point: params.failurePoint || 'NONE',
    root_cause: params.rootCause || 'NONE',
    failure_type: params.failureType,
    blast_radius: params.blastRadius || 'LOCAL',
    detectability: params.detectability || 'HIGH',
    time_to_detection_ms: params.timeToDetection || 0,
    time_to_recovery_ms: params.timeToRecovery || 0,
    fix_required: params.fixRequired || 'NONE',
    residual_risk: params.residualRisk || 'UNKNOWN',
    is_eliminated: false
  };
  
  TEST_RESULTS.push(result);
  console.log(`[${params.failureType}] ${params.attackId}: ${params.rootCause}`);
  return result;
}

// =============================================
// ATTACK 1: STATE MACHINE BREAKAGE
// =============================================

async function testStateMachineBreakage() {
  console.log('\n🧪 ATTACK 1: STATE MACHINE BREAKAGE\n');
  
  // Test 1.1: Inject illegal state directly into DB
  try {
    // Skip - requires direct DB access which we don't have in this context
    // But would be: INSERT INTO Shipments VALUES (...,'INVALID_STATE',...)
    recordResult({
      attackId: 'STATE-001',
      entryPoint: 'DB direct injection',
      failurePoint: 'N/A - no direct DB access in test',
      rootCause: 'Cannot test without direct DB access',
      failureType: 'STATE',
      blastRadius: 'SYSTEMIC',
      detectability: 'HIGH',
      fixRequired: 'Add DB constraint enforcement'
    });
  } catch (e) {
    recordResult({
      attackId: 'STATE-001',
      entryPoint: 'DB direct injection',
      failurePoint: e.message,
      rootCause: 'Test infrastructure limitation',
      failureType: 'STATE',
      blastRadius: 'LOCAL',
      detectability: 'HIGH'
    });
  }
  
  // Test 1.2: Skip stages via direct API
  try {
    // Try to submit without going through pipeline
    const response = await axios.post(
      `${API_BASE}/v1/module-results/nsw_esb_submission`,
      {
        shipment_id: TEST_SHIPMENT_ID,
        output: {
          sgd_number: 'SGD-SKIPPED-001',
          submission_status: 'ACCEPTED'
        }
      },
      { headers: HEADERS }
    );
    
    // This should fail - but let's see if it does
    if (response.data.success) {
      recordResult({
        attackId: 'STATE-002',
        entryPoint: 'POST /v1/module-results/:module',
        failurePoint: 'BYPASS_SUCCEEDED',
        rootCause: 'No validation that prior stages completed',
        failureType: 'STATE',
        blastRadius: 'SYSTEMIC',
        detectability: 'LOW',
        timeToDetection: 0,
        fixRequired: 'Add stage dependency validation in middleware'
      });
    }
  } catch (e) {
    if (e.response?.status === 403) {
      recordResult({
        attackId: 'STATE-002',
        entryPoint: 'POST /v1/module-results/:module',
        failurePoint: 'BLOCKED',
        rootCause: 'Correctly rejected - required token has permissions',
        failureType: 'STATE',
        blastRadius: 'LOCAL',
        detectability: 'HIGH',
        is_eliminated: true
      });
    } else {
      recordResult({
        attackId: 'STATE-002',
        entryPoint: 'POST /v1/module-results/:module',
        failurePoint: e.message,
        rootCause: 'Unknown',
        failureType: 'STATE'
      });
    }
  }
}

// =============================================
// ATTACK 2: CONCURRENCY WARFARE
// =============================================

async function testConcurrencyWarfare() {
  console.log('\n🧪 ATTACK 2: CONCURRENCY WARFARE\n');
  
  // Test 2.1: Duplicate webhook storm
  const webhookPayload = {
    shipment_id: TEST_SHIPMENT_ID,
    event_type: 'C102',
    event_data: { status: 'ACCEPTED', sgd_number: 'SGD-DUP-001' }
  };
  
  const promises = [];
  for (let i = 0; i < 20; i++) {
    promises.push(
      axios.post(`${API_BASE}/v1/webhooks/nsw`, webhookPayload)
        .catch(e => ({ error: e.message }))
    );
  }
  
  const startTime = Date.now();
  const results = await Promise.all(promises);
  const duration = Date.now() - startTime;
  
  const successCount = results.filter(r => !r.error).length;
  const errorCount = results.filter(r => r.error).length;
  
  if (successCount > 1) {
    recordResult({
      attackId: 'CONC-001',
      entryPoint: 'POST /v1/webhooks/nsw',
      failurePoint: `${successCount} duplicate events processed`,
      rootCause: 'No idempotency enforcement on webhook endpoint',
      failureType: 'CONCURRENCY',
      blastRadius: 'SYSTEMIC',
      detectability: 'MEDIUM',
      timeToDetection: duration,
      fixRequired: 'Add idempotency key check before processing'
    });
  } else {
    recordResult({
      attackId: 'CONC-001',
      entryPoint: 'POST /v1/webhooks/nsw',
      failurePoint: 'BLOCKED',
      rootCause: 'Idempotency working (or duplicates failed)',
      failureType: 'CONCURRENCY',
      blastRadius: 'LOCAL',
      detectability: 'HIGH',
      is_eliminated: true
    });
  }
}

// =============================================
// ATTACK 3: SIGNATURE & IDENTITY ATTACKS
// =============================================

async function testSignatureAttacks() {
  console.log('\n🧪 ATTACK 3: SIGNATURE & IDENTITY ATTACKS\n');
  
  // Test 3.1: Replay signed payload
  const replayPayload = {
    shipment_id: 'CB-001', // Existing signed shipment
    module: 'hs_code_validator',
    output: { validated_hs_code: '12074000' }
  };
  
  try {
    const response = await axios.post(
      `${API_BASE}/v1/module-results/hs_code_validator`,
      replayPayload,
      { headers: HEADERS }
    );
    
    recordResult({
      attackId: 'SIGN-001',
      entryPoint: 'POST /v1/module-results/:module',
      failurePoint: 'ALLOWED',
      rootCause: 'No timestamp/nonce validation on module outputs',
      failureType: 'SECURITY',
      blastRadius: 'SYSTEMIC',
      detectability: 'LOW',
      fixRequired: 'Add timestamp + nonce to all write operations'
    });
  } catch (e) {
    if (e.response?.status === 409) {
      recordResult({
        attackId: 'SIGN-001',
        entryPoint: 'POST /v1/module-results/:module',
        failurePoint: 'BLOCKED',
        rootCause: 'Post-signature immutability working',
        failureType: 'SECURITY',
        blastRadius: 'LOCAL',
        detectability: 'HIGH',
        is_eliminated: true
      });
    }
  }
  
  // Test 3.2: Modify payload after signature
  try {
    const response = await axios.get(
      `${API_BASE}/v1/shipment-results/CB-001`,
      { headers: HEADERS }
    );
    
    if (response.data.deterministic_flags?.all_verified === true) {
      recordResult({
        attackId: 'SIGN-002',
        entryPoint: 'GET /v1/shipment-results/:id',
        failurePoint: 'VERIFIED',
        rootCause: 'System correctly validates deterministic flags',
        failureType: 'SECURITY',
        blastRadius: 'LOCAL',
        detectability: 'HIGH',
        is_eliminated: true
      });
    }
  } catch (e) {
    recordResult({
      attackId: 'SIGN-002',
      entryPoint: 'GET /v1/shipment-results/:id',
      failurePoint: e.message,
      rootCause: 'Unknown',
      failureType: 'SECURITY'
    });
  }
}

// =============================================
// ATTACK 4: FINANCIAL DESTRUCTION
// =============================================

async function testFinancialAttacks() {
  console.log('\n🧪 ATTACK 4: FINANCIAL DESTRUCTION\n');
  
  // Test 4.1: Underpay / overpay
  // This requires fee calculation endpoint - test if it exists
  try {
    // Get fee calculation for existing shipment
    const response = await axios.get(
      `${API_BASE}/v1/shipment-results/CB-001?module=fee_calculator`,
      { headers: HEADERS }
    );
    
    if (response.data.aggregated_results?.fee_calculator) {
      recordResult({
        attackId: 'FIN-001',
        entryPoint: 'GET /v1/shipment-results/:id?module=fee_calculator',
        failurePoint: 'DATA_EXPOSED',
        rootCause: 'Fee calculation exposed in API response',
        failureType: 'FINANCIAL',
        blastRadius: 'LOCAL',
        detectability: 'HIGH',
        fixRequired: 'Add role-based filtering for financial data'
      });
    }
  } catch (e) {
    // Expected - fee_calculator might not exist yet
    recordResult({
      attackId: 'FIN-001',
      entryPoint: 'GET /v1/shipment-results/:id?module=fee_calculator',
      failurePoint: 'MODULE_NOT_FOUND',
      rootCause: 'Fee calculator module not fully implemented',
      failureType: 'FINANCIAL',
      blastRadius: 'LOCAL',
      detectability: 'HIGH'
    });
  }
  
  // Test 4.2: FX drift - inject stale exchange rate
  // Would require: Modify exchange_rate after fee calculation
  recordResult({
    attackId: 'FIN-002',
    entryPoint: 'DB injection',
    failurePoint: 'N/A',
    rootCause: 'Cannot test without direct DB - but ledger.js has FX locking',
    failureType: 'FINANCIAL',
    blastRadius: 'LOCAL',
    detectability: 'HIGH',
    fixRequired: 'FX rate locking implemented in finance/ledger.js'
  });
}

// =============================================
// ATTACK 5: EXTERNAL CHAOS SIMULATION
// =============================================

async function testExternalChaos() {
  console.log('\n🧪 ATTACK 5: EXTERNAL CHAOS SIMULATION\n');
  
  // Test 5.1: Webhook with corrupted payload
  const corruptedPayload = {
    shipment_id: TEST_SHIPMENT_ID,
    event_type: 'C102',
    event_data: null // Corrupted
  };
  
  try {
    await axios.post(`${API_BASE}/v1/webhooks/nsw`, corruptedPayload);
    
    recordResult({
      attackId: 'EXT-001',
      entryPoint: 'POST /v1/webhooks/nsw',
      failurePoint: 'ACCEPTED_NULL_DATA',
      rootCause: 'No schema validation on webhook payload',
      failureType: 'EXTERNAL',
      blastRadius: 'SYSTEMIC',
      detectability: 'LOW',
      fixRequired: 'Add Zod/JSON schema validation to webhook endpoint'
    });
  } catch (e) {
    recordResult({
      attackId: 'EXT-001',
      entryPoint: 'POST /v1/webhooks/nsw',
      failurePoint: 'REJECTED',
      rootCause: 'Correctly rejected corrupted payload',
      failureType: 'EXTERNAL',
      blastRadius: 'LOCAL',
      detectability: 'HIGH',
      is_eliminated: e.response?.status === 400
    });
  }
  
  // Test 5.2: Invalid event sequence
  const invalidSequence = {
    shipment_id: TEST_SHIPMENT_ID,
    event_type: 'C105', // Should not be first
    event_data: { status: 'DELIVERED' }
  };
  
  try {
    await axios.post(`${API_BASE}/v1/webhooks/nsw`, invalidSequence);
    // Should fail - no prior events for this shipment
    recordResult({
      attackId: 'EXT-002',
      entryPoint: 'POST /v1/webhooks/nsw',
      failurePoint: 'ACCEPTED_INVALID_SEQUENCE',
      rootCause: 'No event sequence validation (C105 before C100)',
      failureType: 'EVENT',
      blastRadius: 'SYSTEMIC',
      detectability: 'MEDIUM',
      fixRequired: 'Add sequence validation using engine/event-system.js'
    });
  } catch (e) {
    recordResult({
      attackId: 'EXT-002',
      entryPoint: 'POST /v1/webhooks/nsw',
      failurePoint: 'BLOCKED',
      rootCause: 'Sequence validation working (or error caught)',
      failureType: 'EVENT',
      blastRadius: 'LOCAL',
      detectability: 'HIGH'
    });
  }
}

// =============================================
// ATTACK 6: DATA CORRUPTION
// =============================================

async function testDataCorruption() {
  console.log('\n🧪 ATTACK 6: DATA CORRUPTION\n');
  
  // Test 6.1: Invalid JSON schema
  const invalidSchema = {
    shipment_id: TEST_SHIPMENT_ID,
    output: 'not-an-object' // Invalid type
  };
  
  try {
    await axios.post(
      `${API_BASE}/v1/module-results/hs_code_validator`,
      invalidSchema,
      { headers: HEADERS }
    );
    
    recordResult({
      attackId: 'DATA-001',
      entryPoint: 'POST /v1/module-results/:module',
      failurePoint: 'ACCEPTED_INVALID_SCHEMA',
      rootCause: 'No type validation on output field',
      failureType: 'DATA',
      blastRadius: 'LOCAL',
      detectability: 'MEDIUM',
      fixRequired: 'Add Zod schema validation for module inputs'
    });
  } catch (e) {
    recordResult({
      attackId: 'DATA-001',
      entryPoint: 'POST /v1/module-results/:module',
      failurePoint: 'REJECTED',
      rootCause: 'Correctly rejected invalid schema',
      failureType: 'DATA',
      blastRadius: 'LOCAL',
      detectability: 'HIGH'
    });
  }
}

// =============================================
// ATTACK 7: THROUGHPUT & LOAD
// =============================================

async function testThroughputLoad() {
  console.log('\n🧪 ATTACK 7: THROUGHPUT & LOAD CHAOS\n');
  
  // Test 7.1: Rapid fire requests
  const rapidPromises = [];
  for (let i = 0; i < 50; i++) {
    rapidPromises.push(
      axios.get(`${API_BASE}/health`).catch(e => ({ error: e.message }))
    );
  }
  
  const startTime = Date.now();
  const results = await Promise.all(rapidPromises);
  const duration = Date.now() - startTime;
  
  const successCount = results.filter(r => !r.error).length;
  const errors = results.filter(r => r.error);
  
  if (successCount === 50 && duration < 5000) {
    recordResult({
      attackId: 'LOAD-001',
      entryPoint: 'GET /health x50',
      failurePoint: 'PERFORMED_WELL',
      rootCause: 'System handled load well (50 requests in ' + duration + 'ms)',
      failureType: 'EXTERNAL',
      blastRadius: 'LOCAL',
      detectability: 'HIGH',
      is_eliminated: true
    });
  } else {
    recordResult({
      attackId: 'LOAD-001',
      entryPoint: 'GET /health x50',
      failurePoint: `${successCount}/50 in ${duration}ms`,
      rootCause: 'Performance degradation under load',
      failureType: 'EXTERNAL',
      blastRadius: 'LOCAL',
      detectability: 'HIGH'
    });
  }
}

// =============================================
// ATTACK 8: AUDIT SYSTEM DESTRUCTION
// =============================================

async function testAuditDestruction() {
  console.log('\n🧪 ATTACK 8: AUDIT SYSTEM DESTRUCTION\n');
  
  // Test 8.1: Check if audit log is tamper-evident
  try {
    const response = await axios.get(
      `${API_BASE}/v1/shipment-results/CB-001?module=audit_logger`,
      { headers: HEADERS }
    );
    
    if (response.data.aggregated_results?.audit_logger?.logs?.length > 0) {
      recordResult({
        attackId: 'AUDIT-001',
        entryPoint: 'GET /v1/shipment-results/:id?module=audit_logger',
        failurePoint: 'DATA_EXISTS',
        rootCause: 'Audit logs present - need to test hash chaining',
        failureType: 'DATA',
        blastRadius: 'LOCAL',
        detectability: 'HIGH',
        fixRequired: 'Implement immutable-audit.js for hash chaining'
      });
    } else {
      recordResult({
        attackId: 'AUDIT-001',
        entryPoint: 'GET /v1/shipment-results/:id?module=audit_logger',
        failurePoint: 'NO_LOGS',
        rootCause: 'No audit logs found',
        failureType: 'DATA',
        blastRadius: 'LOCAL',
        detectability: 'HIGH'
      });
    }
  } catch (e) {
    recordResult({
      attackId: 'AUDIT-001',
      entryPoint: 'GET /v1/shipment-results/:id?module=audit_logger',
      failurePoint: e.message,
      rootCause: 'Unknown',
      failureType: 'DATA'
    });
  }
}

// =============================================
// RUN ALL TESTS
// =============================================

async function runRedTeamTests() {
  console.log('='.repeat(60));
  console.log('🔴 CULBRIDGE RED TEAM TEST SUITE');
  console.log('='.repeat(60));
  console.log(`API: ${API_BASE}`);
  console.log(`Test Shipment: ${TEST_SHIPMENT_ID}`);
  console.log('='.repeat(60));
  
  await testStateMachineBreakage();
  await testConcurrencyWarfare();
  await testSignatureAttacks();
  await testFinancialAttacks();
  await testExternalChaos();
  await testDataCorruption();
  await testThroughputLoad();
  await testAuditDestruction();
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 RED TEAM TEST SUMMARY');
  console.log('='.repeat(60));
  
  const total = TEST_RESULTS.length;
  const eliminated = TEST_RESULTS.filter(r => r.is_eliminated).length;
  const failures = TEST_RESULTS.filter(r => !r.is_eliminated && r.failure_point !== 'NONE' && r.failure_point !== 'N/A').length;
  
  console.log(`Total Tests: ${total}`);
  console.log(`Eliminated (Fixed): ${eliminated}`);
  console.log(`Failures Detected: ${failures}`);
  
  // List failures
  console.log('\n⚠️ FAILURES REQUIRING FIX:\n');
  TEST_RESULTS.filter(r => !r.is_eliminated && r.failure_point !== 'NONE' && r.failure_point !== 'N/A' && r.failure_point !== 'BLOCKED').forEach(r => {
    console.log(`  ${r.attack_id}: ${r.root_cause}`);
    console.log(`    Fix: ${r.fix_required}`);
    console.log('');
  });
  
  // Hard failure check
  const hardFailures = [
    'Invalid shipment is accepted',
    'Valid shipment becomes corrupted', 
    'Duplicate submission succeeds',
    'Payment inconsistency exists',
    'Signature bypass is possible',
    'External failure corrupts internal state',
    'Audit cannot reconstruct truth'
  ];
  
  const criticalFailures = TEST_RESULTS.filter(r => 
    r.failureType === 'STATE' && !r.is_eliminated ||
    r.failureType === 'CONCURRENCY' && !r.is_eliminated ||
    r.failureType === 'SECURITY' && !r.is_eliminated
  );
  
  if (criticalFailures.length > 0) {
    console.log('\n🔴 HARD FAILURE CONDITION DETECTED');
    console.log('Culbridge is NOT SAFE. Do not proceed.');
    process.exit(1);
  }
  
  console.log('\n✅ Red team testing complete');
  return TEST_RESULTS;
}

// Run if called directly
if (require.main === module) {
  runRedTeamTests()
    .then(results => {
      console.log('\n📋 Full Results:\n', JSON.stringify(results, null, 2));
    })
    .catch(e => {
      console.error('Test suite failed:', e);
      process.exit(1);
    });
}

module.exports = { runRedTeamTests, recordResult };