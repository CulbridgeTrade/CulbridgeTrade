/**
 * Full System Flow Test
 * 
 * Tests the complete pipeline:
 * 1. Access2Markets validation
 * 2. TRACES validation
 * 3. NVWA simulation
 * 4. Decision engine
 * 
 * Run with: node test-full-flow.js
 */

const deterministicEngine = require('./engine/deterministic-engine');
const decisionEngine = require('./utils/decision-engine');
const access2Markets = require('./services/access2markets');
const tracesParser = require('./services/traces-parser');
const rasffService = require('./services/rasff-ingestion');
const nvwaSimulator = require('./engine/nvwa-simulator');

console.log('========================================');
console.log('FULL SYSTEM FLOW TEST');
console.log('========================================\n');

// Test Shipment 1: Clean shipment (should pass)
const cleanShipment = {
  id: 'TEST-001',
  shipment_id: 'TEST-001',
  hsCode: '120740',
  product: 'sesame seeds',
  origin_country: 'Nigeria',
  destination_port: 'Barcelona', // Low-risk port
  batch_id: 'BATCH-NG-001',
  certificate_id: 'TRACES-NG-001',
  documents: [
    'phytosanitary_certificate',
    'certificate_of_origin',
    'laboratory_test_report'
  ],
  labResults: {
    pesticides: {
      chlorpyrifos: 0.005,
      pendimethalin: 0.01
    },
    aflatoxin_b1: 0.001,
    totalAflatoxins: 0.002
  },
  lab_salmonella_present: false,
  lab_aflatoxin_total: 2,
  lab_pesticide_count: 1,
  exporter_risk_score: 20,
  historical_rejections: 0,
  shipment_value: 25000
};

// Test Shipment 2: Bad shipment (should block)
const badShipment = {
  id: 'TEST-002',
  shipment_id: 'TEST-002',
  hsCode: '120740',
  product: 'sesame seeds',
  origin_country: 'Nigeria',
  destination_port: 'Rotterdam', // High-risk port
  batch_id: 'BATCH-NG-002',
  certificate_id: 'TRACES-NG-002',
  documents: [
    'phytosanitary_certificate'
    // Missing certificate_of_origin and lab report
  ],
  labResults: {
    pesticides: {
      chlorpyrifos: 0.05 // Exceeds MRL
    },
    aflatoxin_b1: 0.003, // Exceeds MRL
    totalAflatoxins: 0.005 // Exceeds MRL
  },
  lab_salmonella_present: true, // BLOCK!
  lab_aflatoxin_total: 5,
  lab_pesticide_count: 3,
  exporter_risk_score: 75,
  historical_rejections: 6,
  shipment_value: 30000
};

// Test Shipment 3: Certificate invalid
const invalidCertShipment = {
  id: 'TEST-003',
  shipment_id: 'TEST-003',
  hsCode: '120740',
  product: 'sesame seeds',
  origin_country: 'Nigeria',
  destination_port: 'Hamburg',
  batch_id: 'BATCH-INVALID',
  certificate_id: 'TRACES-NG-007', // Expired
  documents: [
    'phytosanitary_certificate',
    'certificate_of_origin',
    'laboratory_test_report'
  ],
  lab_salmonella_present: false,
  lab_aflatoxin_total: 1,
  lab_pesticide_count: 0,
  exporter_risk_score: 10,
  historical_rejections: 0,
  shipment_value: 20000
};

async function runTests() {
  // Ensure TRACES certificates are loaded
  console.log('Loading sample certificates...');
  await tracesParser.importCertificate([
    { certificate_id: 'TRACES-NG-001', exporter: 'Premium Foods Ltd', origin_country: 'Nigeria', product: 'Sesame seeds', hs_code: '120740', batch_id: 'BATCH-NG-001', status: 'VALID' },
    { certificate_id: 'TRACES-NG-002', exporter: 'Nigerian Exports Co', origin_country: 'Nigeria', product: 'Sesame seeds', hs_code: '120740', batch_id: 'BATCH-NG-002', status: 'VALID' },
    { certificate_id: 'TRACES-NG-007', exporter: 'Premium Foods Ltd', origin_country: 'Nigeria', product: 'Sesame seeds', hs_code: '120740', batch_id: 'BATCH-NG-007', status: 'EXPIRED' }
  ]);
  console.log('Certificates loaded\n');
  
  console.log('=== TEST 1: Clean Shipment ===\n');
  const result1 = await deterministicEngine.validate(cleanShipment);
  console.log('Result:', JSON.stringify(result1, null, 2));
  console.log('\n');
  
  console.log('=== TEST 2: Bad Shipment (Salmonella + High MRL) ===\n');
  const result2 = await deterministicEngine.validate(badShipment);
  console.log('Result:', JSON.stringify(result2, null, 2));
  console.log('\n');
  
  console.log('=== TEST 3: Invalid Certificate ===\n');
  const result3 = await deterministicEngine.validate(invalidCertShipment);
  console.log('Result:', JSON.stringify(result3, null, 2));
  console.log('\n');
  
  // Now test ML decision on clean shipment
  console.log('=== TEST 4: ML Decision on Clean Shipment ===\n');
  if (result1.finalDecision === 'CLEAR' || result1.finalDecision === 'CONDITIONAL_CLEAR') {
    const mlResult = await decisionEngine.predictDecision(cleanShipment);
    console.log('ML Decision:', JSON.stringify(mlResult, null, 2));
  } else {
    console.log('Shipment blocked at deterministic stage, skipping ML');
  }
  console.log('\n');
  
  // Summary
  console.log('========================================');
  console.log('TEST SUMMARY');
  console.log('========================================\n');
  
  console.log('Test 1 (Clean):');
  console.log(`  Decision: ${result1.finalDecision}`);
  console.log(`  Blocked: ${result1.blocked}`);
  console.log(`  Warnings: ${result1.warnings.length}`);
  console.log('\n');
  
  console.log('Test 2 (Bad):');
  console.log(`  Decision: ${result2.finalDecision}`);
  console.log(`  Blocked: ${result2.blocked}`);
  console.log(`  Block Reasons: ${result2.blockReasons.length}`);
  console.log(`  Reasons:`, result2.blockReasons.map(b => b.ruleId || b.type));
  console.log('\n');
  
  console.log('Test 3 (Invalid Cert):');
  console.log(`  Decision: ${result3.finalDecision}`);
  console.log(`  Blocked: ${result3.blocked}`);
  console.log(`  Block Reasons: ${result3.blockReasons.length}`);
  console.log(`  Reasons:`, result3.blockReasons.map(b => b.ruleId || b.type));
  console.log('\n');
  
  // RASFF features
  console.log('=== RASFF ENFORCEMENT DATA ===\n');
  const rasffStats = rasffService.getStatistics();
  console.log(`Total Alerts: ${rasffStats.totalAlerts}`);
  console.log(`Rejection Rate: ${(rasffStats.overallRejectionRate * 100).toFixed(1)}%`);
  
  const sesameRate = rasffService.getRejectionRateByProduct('sesame seeds');
  console.log(`\nSesame Seeds Rejection Rate: ${(sesameRate?.rejectionRate || 0) * 100}%`);
  
  const rotterdamRate = rasffService.getRejectionRateByPort('Rotterdam');
  console.log(`Rotterdam Port Rejection Rate: ${(rotterdamRate?.rejectionRate || 0) * 100}%`);
  
  console.log('\n========================================');
  console.log('ALL TESTS COMPLETED');
  console.log('========================================\n');
  
  process.exit(0);
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
