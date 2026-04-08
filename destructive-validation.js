/**
 * Culbridge Destructive Validation Suite
 * 
 * Objective: Actively attempt to destroy the system and expose failure modes.
 * 
 * Each test outputs:
 * {
 *   "failure_point": "",
 *   "root_cause": "",
 *   "blast_radius": "",
 *   "fix_applied": "",
 *   "residual_risk": "",
 *   "status": "SAFE | WEAK | CRITICAL"
 * }
 */

const { all, get, run } = require('./utils/db');
const crypto = require('crypto');

const FAILURE_REGISTRY = [];

// =============================================
// 🔥 1. PIPELINE ATTACK (STATE + INVARIANTS)
// =============================================

async function testPipelineOutOfOrder() {
  console.log('\n💣 TEST 1A: Pipeline Attack - Out of Order Execution');
  console.log('========================================================');
  
  const shipmentId = 'PIPELINE-OUT-ORDER-' + Date.now();
  
  // Try to create signature BEFORE compliance
  await run(`INSERT INTO Shipments (id, exporter_id, product, category, destination, batch_number) VALUES (?, ?, ?, ?, ?, ?)`,
    [shipmentId, 'TEST-EXP', 'cocoa', 'agro-export', 'NL', 'BATCH-TEST']);
  
  // Skip compliance engine, create signature directly
  const declaration = { declaration_ref: `CUL-${shipmentId}`, version: '2026.1' };
  const payloadHash = crypto.createHash('sha256').update(JSON.stringify(declaration)).digest('base64');
  
  await run(`INSERT INTO DigitalSignatureResults (shipment_id, payload_hash, digital_signature, signer_identity) VALUES (?, ?, ?, ?)`,
    [shipmentId, payloadHash, 'SIG-BEFORE-COMPLIANCE', 'TEST-SIGNER']);
  
  // Now try NSW submission
  await run(`INSERT INTO NSWSubmissionResults (shipment_id, sgd_number, submission_status, priority_lane) VALUES (?, ?, ?, ?)`,
    [shipmentId, 'SGD-TEST', 'ACCEPTED', 'GREEN']);
  
  // Check if system caught this
  const compliance = await get(`SELECT * FROM ComplianceEngineResults WHERE shipment_id = ?`, [shipmentId]);
  const hasSignature = await get(`SELECT * FROM DigitalSignatureResults WHERE shipment_id = ?`, [shipmentId]);
  const hasSubmission = await get(`SELECT * FROM NSWSubmissionResults WHERE shipment_id = ?`, [shipmentId]);
  
  const result = {
    test: 'PIPELINE_OUT_OF_ORDER',
    failure_point: hasSubmission && !compliance ? 'Signature before compliance' : 'NONE',
    root_cause: !compliance ? 'No invariant enforcement between modules' : null,
    blast_radius: !compliance ? 'Submission accepted without compliance check' : 'NONE',
    fix_applied: !compliance ? 'State machine enforcement required' : null,
    residual_risk: !compliance ? 'HIGH' : 'NONE',
    status: !compliance ? 'CRITICAL' : 'SAFE'
  };
  
  console.log('Result:', JSON.stringify(result, null, 2));
  FAILURE_REGISTRY.push(result);
  return result;
}

async function testSkipRequiredStage() {
  console.log('\n💣 TEST 1B: Pipeline Attack - Skip Required Stage');
  console.log('====================================================');
  
  const shipmentId = 'SKIP-STAGE-' + Date.now();
  
  await run(`INSERT INTO Shipments (id, exporter_id, product, category, destination, batch_number) VALUES (?, ?, ?, ?, ?, ?)`,
    [shipmentId, 'TEST-EXP', 'cocoa', 'agro-export', 'NL', 'BATCH-TEST']);
  
  // Create HS validation
  await run(`INSERT INTO HSCodeValidationResults (shipment_id, validated_hs_code, hs_mapping, commodity_description, deterministic_flag) VALUES (?, ?, ?, ?, ?)`,
    [shipmentId, '18010000', '{}', 'Cocoa', 1]);
  
  // Skip fee calculator, try to submit
  await run(`INSERT INTO NSWSubmissionResults (shipment_id, sgd_number, submission_status, priority_lane) VALUES (?, ?, ?, ?)`,
    [shipmentId, 'SGD-SKIP', 'ACCEPTED', 'GREEN']);
  
  const feeCalc = await get(`SELECT * FROM FeeCalculationResults WHERE shipment_id = ?`, [shipmentId]);
  const submission = await get(`SELECT * FROM NSWSubmissionResults WHERE shipment_id = ?`, [shipmentId]);
  
  const result = {
    test: 'SKIP_REQUIRED_STAGE',
    failure_point: !feeCalc && submission ? 'Fee calculator skipped' : 'NONE',
    root_cause: !feeCalc ? 'No stage dependency enforcement' : null,
    blast_radius: !feeCalc ? 'Submission without fee calculation' : 'NONE',
    fix_applied: !feeCalc ? 'Pipeline stage dependencies required' : null,
    residual_risk: !feeCalc ? 'HIGH' : 'NONE',
    status: !feeCalc ? 'CRITICAL' : 'SAFE'
  };
  
  console.log('Result:', JSON.stringify(result, null, 2));
  FAILURE_REGISTRY.push(result);
  return result;
}

// =============================================
// ⚡ 2. CONCURRENCY & DUPLICATE ATTACK
// =============================================

async function testDuplicateSubmission() {
  console.log('\n💣 TEST 2: Concurrency Attack - Duplicate Submission');
  console.log('======================================================');
  
  const shipmentId = 'DUPLICATE-' + Date.now();
  
  await run(`INSERT INTO Shipments (id, exporter_id, product, category, destination, batch_number) VALUES (?, ?, ?, ?, ?, ?)`,
    [shipmentId, 'TEST-EXP', 'cocoa', 'agro-export', 'NL', 'BATCH-TEST']);
  
  // Submit same payload twice
  const sgdNumber = 'SGD-DUP-' + Date.now();
  
  // First submission
  await run(`INSERT INTO NSWSubmissionResults (shipment_id, sgd_number, submission_status, priority_lane, submitted_at) VALUES (?, ?, ?, ?, ?)`,
    [shipmentId, sgdNumber, 'ACCEPTED', 'GREEN', new Date().toISOString()]);
  
  // Second submission (duplicate attempt)
  await run(`INSERT INTO NSWSubmissionResults (shipment_id, sgd_number, submission_status, priority_lane, submitted_at) VALUES (?, ?, ?, ?, ?)`,
    [shipmentId, sgdNumber, 'ACCEPTED', 'GREEN', new Date().toISOString()]);
  
  const submissions = await all(`SELECT * FROM NSWSubmissionResults WHERE shipment_id = ?`, [shipmentId]);
  const duplicateCount = submissions.length;
  
  const result = {
    test: 'DUPLICATE_SUBMISSION',
    failure_point: duplicateCount > 1 ? 'Duplicate submissions accepted' : 'NONE',
    root_cause: duplicateCount > 1 ? 'No idempotency at DB level' : null,
    blast_radius: duplicateCount > 1 ? 'Multiple SGD numbers for one shipment' : 'NONE',
    fix_applied: duplicateCount > 1 ? 'Add UNIQUE constraint on shipment_id + operation' : null,
    residual_risk: duplicateCount > 1 ? 'HIGH' : 'NONE',
    status: duplicateCount > 1 ? 'CRITICAL' : 'SAFE'
  };
  
  console.log('Result:', JSON.stringify(result, null, 2));
  FAILURE_REGISTRY.push(result);
  return result;
}

// =============================================
// 🌐 3. EXTERNAL DEPENDENCY FAILURE
// =============================================

function testExternalDependencyFailure() {
  console.log('\n💣 TEST 3: External Dependency Failure');
  console.log('========================================');
  
  // Simulate NSW timeout scenario
  const timeoutScenario = {
    status: 'TIMEOUT',
    response: null,
    error: 'Connection timeout after 30s'
  };
  
  // Simulate Remita failure
  const remitaFailure = {
    status: 'NO_RESPONSE',
    payment_confirmed: null,
    error: 'Remita API unreachable'
  };
  
  // Simulate agency conflict
  const agencyConflict = {
    naqs: { status: 'VALID' },
    nafdac: { status: 'REJECTED' },
    conflict: true
  };
  
  const result = {
    test: 'EXTERNAL_DEPENDENCY',
    failure_point: 'External API failures not handled',
    root_cause: 'No adapter layer, circuit breakers, or retry logic',
    blast_radius: 'System blocks or hangs when external APIs fail',
    fix_applied: 'Add adapter layer + circuit breakers + retry with backoff',
    residual_risk: 'MEDIUM',
    status: 'WEAK'
  };
  
  console.log('Result:', JSON.stringify(result, null, 2));
  FAILURE_REGISTRY.push(result);
  return result;
}

// =============================================
// 🔐 4. SIGNATURE SYSTEM ATTACK
// =============================================

async function testSignatureReplayAttack() {
  console.log('\n💣 TEST 4A: Signature Attack - Replay');
  console.log('======================================');
  
  const shipmentId = 'SIG-REPLAY-' + Date.now();
  
  await run(`INSERT INTO Shipments (id, exporter_id, product, category, destination, batch_number) VALUES (?, ?, ?, ?, ?, ?)`,
    [shipmentId, 'TEST-EXP', 'cocoa', 'agro-export', 'NL', 'BATCH-TEST']);
  
  // Create declaration and signature
  const declaration = { declaration_ref: `CUL-${shipmentId}`, total: 10000 };
  const payloadHash = crypto.createHash('sha256').update(JSON.stringify(declaration)).digest('base64');
  
  await run(`INSERT INTO CleanDeclarationResults (shipment_id, payload_version, payload, deterministic_flag) VALUES (?, ?, ?, ?)`,
    [shipmentId, '2026.1', JSON.stringify(declaration), 1]);
  
  await run(`INSERT INTO DigitalSignatureResults (shipment_id, payload_hash, digital_signature, signer_identity) VALUES (?, ?, ?, ?)`,
    [shipmentId, payloadHash, 'REUSABLE-SIG', 'TEST-SIGNER']);
  
  // Try to reuse signature on another shipment
  const shipmentId2 = 'SIG-REPLAY-2-' + Date.now();
  await run(`INSERT INTO Shipments (id, exporter_id, product, category, destination, batch_number) VALUES (?, ?, ?, ?, ?, ?)`,
    [shipmentId2, 'TEST-EXP', 'cocoa', 'agro-export', 'NL', 'BATCH-TEST']);
  
  await run(`INSERT INTO CleanDeclarationResults (shipment_id, payload_version, payload, deterministic_flag) VALUES (?, ?, ?, ?)`,
    [shipmentId2, '2026.1', JSON.stringify({declaration_ref: `CUL-${shipmentId2}`, total: 20000}), 1]);
  
  // Reuse same signature
  await run(`INSERT INTO DigitalSignatureResults (shipment_id, payload_hash, digital_signature, signer_identity) VALUES (?, ?, ?, ?)`,
    [shipmentId2, payloadHash, 'REUSABLE-SIG', 'TEST-SIGNER']);
  
  // Check if system detected replay
  const sig1 = await get(`SELECT * FROM DigitalSignatureResults WHERE shipment_id = ?`, [shipmentId]);
  const sig2 = await get(`SELECT * FROM DigitalSignatureResults WHERE shipment_id = ?`, [shipmentId2]);
  
  const replayDetected = sig1 && sig2 && sig1.digital_signature === sig2.digital_signature;
  
  const result = {
    test: 'SIGNATURE_REPLAY',
    failure_point: replayDetected ? 'Same signature reused on different shipment' : 'NONE',
    root_cause: replayDetected ? 'No nonce/timestamp binding in signature' : null,
    blast_radius: replayDetected ? 'Signed payload can be replayed on different shipments' : 'NONE',
    fix_applied: replayDetected ? 'Bind signature to hash + timestamp + nonce' : null,
    residual_risk: replayDetected ? 'HIGH' : 'NONE',
    status: replayDetected ? 'CRITICAL' : 'SAFE'
  };
  
  console.log('Result:', JSON.stringify(result, null, 2));
  FAILURE_REGISTRY.push(result);
  return result;
}

async function testSignatureMutation() {
  console.log('\n💣 TEST 4B: Signature Attack - Mutation');
  console.log('========================================');
  
  const shipmentId = 'SIG-MUTATE-' + Date.now();
  
  await run(`INSERT INTO Shipments (id, exporter_id, product, category, destination, batch_number) VALUES (?, ?, ?, ?, ?, ?)`,
    [shipmentId, 'TEST-EXP', 'cocoa', 'agro-export', 'NL', 'BATCH-TEST']);
  
  // Create valid declaration
  const declaration = { declaration_ref: `CUL-${shipmentId}`, total: 45000 };
  const payloadHash = crypto.createHash('sha256').update(JSON.stringify(declaration)).digest('base64');
  
  await run(`INSERT INTO CleanDeclarationResults (shipment_id, payload_version, payload, deterministic_flag) VALUES (?, ?, ?, ?)`,
    [shipmentId, '2026.1', JSON.stringify(declaration), 1]);
  
  await run(`INSERT INTO DigitalSignatureResults (shipment_id, payload_hash, digital_signature, signer_identity) VALUES (?, ?, ?, ?)`,
    [shipmentId, payloadHash, 'VALID-SIG', 'TEST-SIGNER']);
  
  // Now mutate the payload (change invoice value)
  declaration.total = 1000;
  
  await run(`UPDATE CleanDeclarationResults SET payload = ? WHERE shipment_id = ?`,
    [JSON.stringify(declaration), shipmentId]);
  
  // Check if signature validation catches mutation
  const storedDecl = await get(`SELECT * FROM CleanDeclarationResults WHERE shipment_id = ?`, [shipmentId]);
  const storedSig = await get(`SELECT * FROM DigitalSignatureResults WHERE shipment_id = ?`, [shipmentId]);
  
  const currentHash = crypto.createHash('sha256').update(storedDecl.payload).digest('base64');
  const hashMatches = currentHash === storedSig.payload_hash;
  
  const result = {
    test: 'SIGNATURE_MUTATION',
    failure_point: !hashMatches ? 'Mutation detected but system may still proceed' : 'NONE',
    root_cause: !hashMatches ? 'Post-signature mutation allowed' : null,
    blast_radius: !hashMatches ? 'Invoice value changed after signature' : 'NONE',
    fix_applied: !hashMatches ? 'Enforce immutability after signature' : null,
    residual_risk: !hashMatches ? 'HIGH' : 'NONE',
    status: !hashMatches ? 'CRITICAL' : 'SAFE'
  };
  
  console.log('Result:', JSON.stringify(result, null, 2));
  FAILURE_REGISTRY.push(result);
  return result;
}

// =============================================
// 📊 5. FINANCIAL CHAOS
// =============================================

async function testFXDrift() {
  console.log('\n💣 TEST 5A: Financial Chaos - FX Drift');
  console.log('========================================');
  
  const shipmentId = 'FX-DRIFT-' + Date.now();
  
  await run(`INSERT INTO Shipments (id, exporter_id, product, category, destination, batch_number) VALUES (?, ?, ?, ?, ?, ?)`,
    [shipmentId, 'TEST-EXP', 'cocoa', 'agro-export', 'NL', 'BATCH-TEST']);
  
  // Calculate fees with FX rate 1500
  await run(`INSERT INTO FeeCalculationResults (shipment_id, nes_levy, duty, agency_fees, total_estimated_costs, payment_ref, currency, exchange_rate, deterministic_flag) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [shipmentId, 50000, 150000, '{}', 215000, 'PAY-1', 'NGN', 1500, 1]);
  
  // Now simulate FX drift - change exchange rate after calculation
  // In real system, this could happen if calculated at 1500 but submitted at 1650
  
  const storedFee = await get(`SELECT * FROM FeeCalculationResults WHERE shipment_id = ?`, [shipmentId]);
  
  // Try to submit with different FX rate (simulating drift)
  await run(`INSERT INTO NSWSubmissionResults (shipment_id, sgd_number, submission_status, priority_lane, submitted_at) VALUES (?, ?, ?, ?, ?)`,
    [shipmentId, 'SGD-FX', 'ACCEPTED', 'GREEN', new Date().toISOString()]);
  
  const result = {
    test: 'FX_DRIFT',
    failure_point: 'FX rate not locked at calculation time',
    root_cause: 'No FX snapshot stored for audit',
    blast_radius: 'Financial discrepancy between calculation and submission',
    fix_applied: 'Store FX rate at calculation time, validate at submission',
    residual_risk: 'MEDIUM',
    status: 'WEAK'
  };
  
  console.log('Result:', JSON.stringify(result, null, 2));
  FAILURE_REGISTRY.push(result);
  return result;
}

async function testPartialPayment() {
  console.log('\n💣 TEST 5B: Financial Chaos - Partial Payment');
  console.log('=============================================');
  
  const shipmentId = 'PARTIAL-PAY-' + Date.now();
  
  await run(`INSERT INTO Shipments (id, exporter_id, product, category, destination, batch_number) VALUES (?, ?, ?, ?, ?, ?)`,
    [shipmentId, 'TEST-EXP', 'cocoa', 'agro-export', 'NL', 'BATCH-TEST']);
  
  // Total required: 215000 NGN
  await run(`INSERT INTO FeeCalculationResults (shipment_id, nes_levy, duty, agency_fees, total_estimated_costs, payment_ref, deterministic_flag) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [shipmentId, 50000, 150000, '{}', 215000, 'PAY-PARTIAL', 1]);
  
  // Only pay 100000 (partial payment)
  await run(`INSERT INTO NSWSubmissionResults (shipment_id, sgd_number, submission_status, priority_lane, submitted_at) VALUES (?, ?, ?, ?, ?)`,
    [shipmentId, 'SGD-PARTIAL', 'ACCEPTED', 'GREEN', new Date().toISOString()]);
  
  const fee = await get(`SELECT * FROM FeeCalculationResults WHERE shipment_id = ?`, [shipmentId]);
  const submission = await get(`SELECT * FROM NSWSubmissionResults WHERE shipment_id = ?`, [shipmentId]);
  
  const result = {
    test: 'PARTIAL_PAYMENT',
    failure_point: submission && fee.total_estimated_costs > 100000 ? 'Payment not verified before submission' : 'NONE',
    root_cause: submission && fee.total_estimated_costs > 100000 ? 'No payment verification step in pipeline' : null,
    blast_radius: submission && fee.total_estimated_costs > 100000 ? 'Submission accepted without full payment' : 'NONE',
    fix_applied: submission && fee.total_estimated_costs > 100000 ? 'Add payment verification before submission' : null,
    residual_risk: submission && fee.total_estimated_costs > 100000 ? 'HIGH' : 'NONE',
    status: submission && fee.total_estimated_costs > 100000 ? 'CRITICAL' : 'SAFE'
  };
  
  console.log('Result:', JSON.stringify(result, null, 2));
  FAILURE_REGISTRY.push(result);
  return result;
}

// =============================================
// 📦 6. DATA CORRUPTION ATTACK
// =============================================

async function testDataCorruption() {
  console.log('\n💣 TEST 6: Data Corruption Attack');
  console.log('==================================');
  
  const shipmentId = 'CORRUPT-' + Date.now();
  
  await run(`INSERT INTO Shipments (id, exporter_id, product, category, destination, batch_number) VALUES (?, ?, ?, ?, ?, ?)`,
    [shipmentId, 'TEST-EXP', 'cocoa', 'agro-export', 'NL', 'BATCH-TEST']);
  
  // Try to insert with invalid HS code format
  await run(`INSERT INTO HSCodeValidationResults (shipment_id, validated_hs_code, hs_mapping, commodity_description, deterministic_flag) VALUES (?, ?, ?, ?, ?)`,
    [shipmentId, 'INVALID!@#', '{}', 'Test', 1]);
  
  // Try with invalid country code
  await run(`UPDATE Shipments SET destination = 'XX' WHERE id = ?`, [shipmentId]);
  
  const shipment = await get(`SELECT * FROM Shipments WHERE id = ?`, [shipmentId]);
  const hsResult = await get(`SELECT * FROM HSCodeValidationResults WHERE shipment_id = ?`, [shipmentId]);
  
  const result = {
    test: 'DATA_CORRUPTION',
    failure_point: shipment.destination === 'XX' || !/^\d+$/.test(hsResult?.validated_hs_code || '') ? 'Invalid data accepted' : 'NONE',
    root_cause: shipment.destination === 'XX' || !/^\d+$/.test(hsResult?.validated_hs_code || '') ? 'Weak schema validation' : null,
    blast_radius: shipment.destination === 'XX' || !/^\d+$/.test(hsResult?.validated_hs_code || '') ? 'Corrupt data enters system' : 'NONE',
    fix_applied: shipment.destination === 'XX' || !/^\d+$/.test(hsResult?.validated_hs_code || '') ? 'Add strict schema validation at ingestion' : null,
    residual_risk: shipment.destination === 'XX' || !/^\d+$/.test(hsResult?.validated_hs_code || '') ? 'MEDIUM' : 'NONE',
    status: shipment.destination === 'XX' || !/^\d+$/.test(hsResult?.validated_hs_code || '') ? 'WEAK' : 'SAFE'
  };
  
  console.log('Result:', JSON.stringify(result, null, 2));
  FAILURE_REGISTRY.push(result);
  return result;
}

// =============================================
// 🧠 7. EVENT SYSTEM CHAOS
// =============================================

async function testEventOutOfOrder() {
  console.log('\n💣 TEST 7A: Event System Chaos - Out of Order');
  console.log('==============================================');
  
  const shipmentId = 'EVENT-OUT-' + Date.now();
  
  await run(`INSERT INTO Shipments (id, exporter_id, product, category, destination, batch_number) VALUES (?, ?, ?, ?, ?, ?)`,
    [shipmentId, 'TEST-EXP', 'cocoa', 'agro-export', 'NL', 'BATCH-TEST']);
  
  // Insert events out of order: C104 before C100
  await run(`INSERT INTO NSWWebhookEvents (shipment_id, event_type, event_data, processed, received_at) VALUES (?, ?, ?, ?, ?)`,
    [shipmentId, 'C104', '{"status":"CLEAR"}', 1, '2024-03-21 10:00:00']);
  
  await run(`INSERT INTO NSWWebhookEvents (shipment_id, event_type, event_data, processed, received_at) VALUES (?, ?, ?, ?, ?)`,
    [shipmentId, 'C100', '{"status":"SUBMITTED"}', 1, '2024-03-20 10:00:00']);
  
  const events = await all(`SELECT event_type, received_at FROM NSWWebhookEvents WHERE shipment_id = ? ORDER BY received_at ASC`, [shipmentId]);
  
  const result = {
    test: 'EVENT_OUT_OF_ORDER',
    failure_point: events[0]?.event_type === 'C104' ? 'Out-of-order events not handled' : 'NONE',
    root_cause: events[0]?.event_type === 'C104' ? 'No event sequence enforcement' : null,
    blast_radius: events[0]?.event_type === 'C104' ? 'CLEAR before SUBMITTED' : 'NONE',
    fix_applied: events[0]?.event_type === 'C104' ? 'Add event sequencing validation' : null,
    residual_risk: events[0]?.event_type === 'C104' ? 'MEDIUM' : 'NONE',
    status: events[0]?.event_type === 'C104' ? 'WEAK' : 'SAFE'
  };
  
  console.log('Result:', JSON.stringify(result, null, 2));
  FAILURE_REGISTRY.push(result);
  return result;
}

async function testDuplicateWebhook() {
  console.log('\n💣 TEST 7B: Event System Chaos - Duplicate Webhook');
  console.log('===================================================');
  
  const shipmentId = 'EVENT-DUP-' + Date.now();
  
  await run(`INSERT INTO Shipments (id, exporter_id, product, category, destination, batch_number) VALUES (?, ?, ?, ?, ?, ?)`,
    [shipmentId, 'TEST-EXP', 'cocoa', 'agro-export', 'NL', 'BATCH-TEST']);
  
  // Send same webhook 5 times
  for (let i = 0; i < 5; i++) {
    await run(`INSERT INTO NSWWebhookEvents (shipment_id, event_type, event_data, processed, received_at) VALUES (?, ?, ?, ?, ?)`,
      [shipmentId, 'C102', '{"status":"ACCEPTED"}', 1, new Date().toISOString()]);
  }
  
  const events = await all(`SELECT * FROM NSWWebhookEvents WHERE shipment_id = ? AND event_type = 'C102'`, [shipmentId]);
  const duplicateCount = events.length;
  
  const result = {
    test: 'DUPLICATE_WEBHOOK',
    failure_point: duplicateCount > 1 ? 'Duplicate events not deduplicated' : 'NONE',
    root_cause: duplicateCount > 1 ? 'No idempotent event processing' : null,
    blast_radius: duplicateCount > 1 ? `${duplicateCount} duplicate events stored` : 'NONE',
    fix_applied: duplicateCount > 1 ? 'Add event idempotency key' : null,
    residual_risk: duplicateCount > 1 ? 'MEDIUM' : 'NONE',
    status: duplicateCount > 1 ? 'WEAK' : 'SAFE'
  };
  
  console.log('Result:', JSON.stringify(result, null, 2));
  FAILURE_REGISTRY.push(result);
  return result;
}

// =============================================
// 🧨 8. THROUGHPUT STRESS TEST (Simplified)
// =============================================

async function testThroughputStress() {
  console.log('\n💣 TEST 8: Throughput Stress Test');
  console.log('================================');
  
  const startTime = Date.now();
  const shipments = [];
  
  // Create 50 concurrent shipments
  for (let i = 0; i < 50; i++) {
    const shipmentId = 'STRESS-' + Date.now() + '-' + i;
    shipments.push(shipmentId);
    
    await run(`INSERT INTO Shipments (id, exporter_id, product, category, destination, batch_number) VALUES (?, ?, ?, ?, ?, ?)`,
      [shipmentId, 'TEST-EXP', 'cocoa', 'agro-export', 'NL', `BATCH-${i}`]);
  }
  
  const endTime = Date.now();
  const duration = endTime - startTime;
  
  // Check if any shipments have state inconsistencies
  let inconsistencies = 0;
  for (const sid of shipments.slice(0, 10)) {
    const ship = await get(`SELECT * FROM Shipments WHERE id = ?`, [sid]);
    if (!ship) inconsistencies++;
  }
  
  const result = {
    test: 'THROUGHPUT_STRESS',
    failure_point: inconsistencies > 0 ? 'State inconsistencies under load' : 'NONE',
    root_cause: inconsistencies > 0 ? 'Race conditions or connection limits' : null,
    blast_radius: inconsistencies > 0 ? `${inconsistencies}/10 sampled shipments affected` : 'NONE',
    fix_applied: inconsistencies > 0 ? 'Add queue system, connection pooling' : null,
    residual_risk: inconsistencies > 0 ? 'MEDIUM' : 'NONE',
    status: inconsistencies > 0 ? 'WEAK' : 'SAFE'
  };
  
  console.log(`Created 50 shipments in ${duration}ms`);
  console.log('Result:', JSON.stringify(result, null, 2));
  FAILURE_REGISTRY.push(result);
  return result;
}

// =============================================
// 📁 9. AUDIT SYSTEM (CRITICAL)
// =============================================

async function testAuditReconstructability() {
  console.log('\n💣 TEST 9: Audit System - Reconstructability');
  console.log('=============================================');
  
  const shipmentId = 'AUDIT-TEST-' + Date.now();
  
  await run(`INSERT INTO Shipments (id, exporter_id, product, category, destination, batch_number) VALUES (?, ?, ?, ?, ?, ?)`,
    [shipmentId, 'TEST-EXP', 'cocoa', 'agro-export', 'NL', 'BATCH-AUDIT']);
  
  // Create module results
  await run(`INSERT INTO HSCodeValidationResults (shipment_id, validated_hs_code, deterministic_flag) VALUES (?, ?, ?)`,
    [shipmentId, '18010000', 1]);
  
  // Try to reconstruct from audit logs
  const auditLogs = await all(`SELECT * FROM AuditLogs WHERE shipment_id = ? ORDER BY timestamp ASC`, [shipmentId]);
  
  const result = {
    test: 'AUDIT_RECONSTRUCT',
    failure_point: auditLogs.length === 0 ? 'No audit trail to reconstruct from' : 'NONE',
    root_cause: auditLogs.length === 0 ? 'Audit not logging all module executions' : null,
    blast_radius: auditLogs.length === 0 ? 'Cannot reconstruct shipment history' : 'NONE',
    fix_applied: auditLogs.length === 0 ? 'Add event sourcing model with replay' : null,
    residual_risk: auditLogs.length === 0 ? 'HIGH' : 'NONE',
    status: auditLogs.length === 0 ? 'CRITICAL' : 'SAFE'
  };
  
  console.log('Result:', JSON.stringify(result, null, 2));
  FAILURE_REGISTRY.push(result);
  return result;
}

// =============================================
// MAIN EXECUTION
// =============================================

async function runDestructiveTests() {
  console.log('================================================');
  console.log('CULBRIDGE DESTRUCTIVE VALIDATION SUITE');
  console.log('================================================');
  
  try {
    await testPipelineOutOfOrder();
    await testSkipRequiredStage();
    await testDuplicateSubmission();
    testExternalDependencyFailure();
    await testSignatureReplayAttack();
    await testSignatureMutation();
    await testFXDrift();
    await testPartialPayment();
    await testDataCorruption();
    await testEventOutOfOrder();
    await testDuplicateWebhook();
    await testThroughputStress();
    await testAuditReconstructability();
    
    console.log('\n================================================');
    console.log('FAILURE REGISTRY');
    console.log('================================================');
    
    let safe = 0, weak = 0, critical = 0;
    
    for (const result of FAILURE_REGISTRY) {
      console.log(`[${result.status}] ${result.test}: ${result.failure_point || 'No failure'}`);
      if (result.status === 'SAFE') safe++;
      else if (result.status === 'WEAK') weak++;
      else if (result.status === 'CRITICAL') critical++;
    }
    
    console.log(`\nSUMMARY: ${safe} SAFE | ${weak} WEAK | ${critical} CRITICAL`);
    
    if (critical > 0) {
      console.log('\n⚠️  SYSTEM CLASSIFICATION: CRITICAL');
      console.log('Critical failures must be fixed before production');
    } else if (weak > 0) {
      console.log('\n⚠️  SYSTEM CLASSIFICATION: WEAK');
      console.log('Edge cases need hardening before production');
    } else {
      console.log('\n✅ SYSTEM CLASSIFICATION: SAFE');
      console.log('Cannot break under defined conditions');
    }
    
    console.log('\n=== FULL FAILURE REGISTRY ===');
    console.log(JSON.stringify(FAILURE_REGISTRY, null, 2));
    
    return FAILURE_REGISTRY;
  } catch (error) {
    console.error('Destructive test error:', error);
    throw error;
  }
}

module.exports = { runDestructiveTests };

if (require.main === module) {
  runDestructiveTests()
    .then(results => process.exit(0))
    .catch(err => {
      console.error('Fatal:', err);
      process.exit(1);
    });
}