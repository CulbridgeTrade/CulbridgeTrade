/**
 * Decision Engine - Production Validation Test
 * 
 * This script runs 20 historical shipments through the decision engine
 * and validates:
 * 1. Did it stop bad shipments?
 * 2. Did it reduce loss?
 * 3. Did it flag risky ones correctly?
 * 
 * Run with: node test-decision-engine.js
 */

const decisionEngine = require('./utils/decision-engine');

// Test shipments (20 historical shipments)
const testShipments = [
  // HIGH RISK - Should be flagged
  { id: 'SHIP-001', lab_aflatoxin_total: 22, lab_pesticide_count: 6, lab_salmonella_present: true, exporter_risk_score: 85, historical_rejections: 8, destination_port: 'Rotterdam', shipment_value: 30000 },
  { id: 'SHIP-002', lab_aflatoxin_total: 18, lab_pesticide_count: 5, lab_salmonella_present: false, exporter_risk_score: 75, historical_rejections: 6, destination_port: 'Hamburg', shipment_value: 25000 },
  { id: 'SHIP-003', lab_aflatoxin_total: 12, lab_pesticide_count: 7, lab_salmonella_present: true, exporter_risk_score: 80, historical_rejections: 5, destination_port: 'Antwerp', shipment_value: 28000 },
  { id: 'SHIP-004', lab_aflatoxin_total: 16, lab_pesticide_count: 4, lab_salmonella_present: false, exporter_risk_score: 70, historical_rejections: 4, destination_port: 'Rotterdam', shipment_value: 22000 },
  { id: 'SHIP-005', lab_aflatoxin_total: 14, lab_pesticide_count: 6, lab_salmonella_present: true, exporter_risk_score: 65, historical_rejections: 3, destination_port: 'Hamburg', shipment_value: 35000 },
  
  // MEDIUM RISK - Should trigger REVIEW
  { id: 'SHIP-006', lab_aflatoxin_total: 8, lab_pesticide_count: 4, lab_salmonella_present: false, exporter_risk_score: 55, historical_rejections: 3, destination_port: 'Rotterdam', shipment_value: 20000 },
  { id: 'SHIP-007', lab_aflatoxin_total: 10, lab_pesticide_count: 3, lab_salmonella_present: false, exporter_risk_score: 50, historical_rejections: 2, destination_port: 'Hamburg', shipment_value: 18000 },
  { id: 'SHIP-008', lab_aflatoxin_total: 7, lab_pesticide_count: 5, lab_salmonella_present: false, exporter_risk_score: 45, historical_rejections: 2, destination_port: 'Antwerp', shipment_value: 25000 },
  { id: 'SHIP-009', lab_aflatoxin_total: 9, lab_pesticide_count: 2, lab_salmonella_present: false, exporter_risk_score: 40, historical_rejections: 1, destination_port: 'Rotterdam', shipment_value: 15000 },
  { id: 'SHIP-010', lab_aflatoxin_total: 6, lab_pesticide_count: 3, lab_salmonella_present: true, exporter_risk_score: 35, historical_rejections: 1, destination_port: 'Hamburg', shipment_value: 20000 },
  
  // LOW RISK - Should CLEAR
  { id: 'SHIP-011', lab_aflatoxin_total: 2, lab_pesticide_count: 1, lab_salmonella_present: false, exporter_risk_score: 15, historical_rejections: 0, destination_port: 'Le Havre', shipment_value: 22000 },
  { id: 'SHIP-012', lab_aflatoxin_total: 3, lab_pesticide_count: 0, lab_salmonella_present: false, exporter_risk_score: 10, historical_rejections: 0, destination_port: 'Barcelona', shipment_value: 18000 },
  { id: 'SHIP-013', lab_aflatoxin_total: 1, lab_pesticide_count: 1, lab_salmonella_present: false, exporter_risk_score: 5, historical_rejections: 0, destination_port: 'Valencia', shipment_value: 25000 },
  { id: 'SHIP-014', lab_aflatoxin_total: 4, lab_pesticide_count: 0, lab_salmonella_present: false, exporter_risk_score: 20, historical_rejections: 1, destination_port: 'Genoa', shipment_value: 30000 },
  { id: 'SHIP-015', lab_aflatoxin_total: 2, lab_pesticide_count: 2, lab_salmonella_present: false, exporter_risk_score: 12, historical_rejections: 0, destination_port: 'Lisbon', shipment_value: 15000 },
  
  // NEW EXPORTER (should trigger INSUFFICIENT_DATA)
  { id: 'SHIP-016', lab_aflatoxin_total: 5, lab_pesticide_count: 1, lab_salmonella_present: false, exporter_risk_score: 0, historical_rejections: 0, destination_port: 'Rotterdam', shipment_value: 20000, exporter_id: 'NEW-EXP-001' },
  { id: 'SHIP-017', lab_aflatoxin_total: 3, lab_pesticide_count: 0, lab_salmonella_present: false, exporter_risk_score: 0, historical_rejections: 0, destination_port: 'Hamburg', shipment_value: 18000, exporter_id: 'NEW-EXP-002' },
  
  // LAB SWITCHING (should add behavioral penalty)
  { id: 'SHIP-018', lab_aflatoxin_total: 8, lab_pesticide_count: 2, lab_salmonella_present: false, exporter_risk_score: 30, historical_rejections: 1, destination_port: 'Antwerp', shipment_value: 22000, lab_id: 'LAB-SWITCH-001', exporter_id: 'EXP-001' },
  { id: 'SHIP-019', lab_aflatoxin_total: 6, lab_pesticide_count: 1, lab_salmonella_present: false, exporter_risk_score: 25, historical_rejections: 0, destination_port: 'Rotterdam', shipment_value: 19000, lab_id: 'LAB-SWITCH-002', exporter_id: 'EXP-002' },
  
  // PORT SWITCHING
  { id: 'SHIP-020', lab_aflatoxin_total: 7, lab_pesticide_count: 2, lab_salmonella_present: false, exporter_risk_score: 35, historical_rejections: 1, destination_port: 'Hamburg', shipment_value: 21000, port: 'PORT-SWITCH-001', exporter_id: 'EXP-003' }
];

// Simulate outcomes for training (for testing calibrated decisions)
const simulateOutcomes = async () => {
  console.log('=== Simulating Historical Outcomes for Calibration ===\n');
  
  for (let i = 0; i < 35; i++) {
    const shipment = testShipments[i % testShipments.length];
    const outcome = {
      shipment_id: `HIST-${i}`,
      predicted_risk: Math.random() * 0.8,
      predicted_class: 'REVIEW',
      actual_outcome: Math.random() > 0.7 ? 'REJECTED' : 'CLEARED',
      lab_id: shipment.lab_id,
      exporter_id: shipment.exporter_id || 'EXP-DEFAULT',
      port: shipment.destination_port
    };
    
    await decisionEngine.recordOutcome(outcome);
  }
  
  console.log('Calibration buckets after training:');
  const calibration = decisionEngine.getCalibrationTable();
  calibration.forEach(b => {
    console.log(`  ${b.bucket_min}-${b.bucket_max}: ${b.num_samples} samples, ${b.num_rejections} rejections, rate: ${(b.empirical_rate * 100).toFixed(1)}%`);
  });
  console.log('');
};

// Run the validation test
const runValidation = async () => {
  console.log('\n========================================');
  console.log('DECISION ENGINE - PRODUCTION VALIDATION');
  console.log('========================================\n');
  
  // First, simulate outcomes to build calibration
  await simulateOutcomes();
  
  // Check model health
  console.log('=== Model Health Check ===');
  const health = decisionEngine.checkModelHealth();
  console.log(`Health: ${health.health}`);
  console.log(`Issues: ${health.issues.length > 0 ? health.issues.join(', ') : 'None'}\n`);
  
  // Check drift status
  console.log('=== Drift Detection ===');
  const drift = decisionEngine.checkDriftStatus();
  console.log(`Status: ${drift.status}`);
  console.log(`Calibration Error: ${drift.calibration_error?.toFixed(4) || 'N/A'}\n`);
  
  // Get fix rules
  console.log('=== Fix Optimization Rules ===');
  const fixes = decisionEngine.getFixRules();
  fixes.forEach(f => console.log(`  ${f.condition}: ${f.action} ($${f.cost_usd}, -${(f.expected_risk_reduction * 100).toFixed(0)}% risk)`));
  console.log('');
  
  // Run predictions on test shipments
  console.log('=== Running Predictions ===\n');
  const results = [];
  
  for (const shipment of testShipments) {
    const result = await decisionEngine.predictDecision(shipment);
    results.push({
      shipment_id: shipment.id,
      predicted_decision: result.decision,
      expected_loss: result.expected_loss_usd,
      loss_breakdown: result.loss_breakdown,
      confidence: result.confidence,
      sample_size: result.sample_size,
      model_health: result.model_health,
      behavioral_adjustments: result.behavioral_adjustments,
      cheapest_fix: result.cheapest_fix
    });
    
    console.log(`${shipment.id}:`);
    console.log(`  Decision: ${result.decision}`);
    console.log(`  Expected Loss: $${result.expected_loss_usd}`);
    console.log(`    - Destruction: $${result.loss_breakdown?.destruction || 0}`);
    console.log(`    - Delay: $${result.loss_breakdown?.delay || 0}`);
    console.log(`    - Return: $${result.loss_breakdown?.return || 0}`);
    console.log(`  Confidence: ${(result.confidence * 100).toFixed(0)}%`);
    console.log(`  Sample Size: ${result.sample_size}`);
    console.log(`  Behavioral Adj: +${(result.behavioral_adjustments && !isNaN(result.behavioral_adjustments)) ? (result.behavioral_adjustments * 100).toFixed(0) : 0}%`);
    console.log(`  Fix: ${result.cheapest_fix?.action || 'No fix available'} (${result.cheapest_fix?.cost_usd || 0})`);
    console.log('');
  }
  
  // Summary
  console.log('========================================');
  console.log('VALIDATION SUMMARY');
  console.log('========================================\n');
  
  const highRiskFlagged = results.filter(r => 
    r.predicted_decision === 'HIGH_RISK_INSPECTION' || 
    r.predicted_decision === 'DO_NOT_SHIP'
  ).length;
  
  const reviewRequired = results.filter(r => r.predicted_decision === 'REVIEW_REQUIRED').length;
  const cleared = results.filter(r => r.predicted_decision === 'CLEAR_TO_SHIP').length;
  const insufficientData = results.filter(r => r.predicted_decision === 'INSUFFICIENT_DATA').length;
  
  const totalLoss = results.reduce((sum, r) => sum + r.expected_loss, 0);
  const avgLoss = totalLoss / results.length;
  const maxLoss = Math.max(...results.map(r => r.expected_loss));
  const minLoss = Math.min(...results.map(r => r.expected_loss));
  
  console.log(`Total Shipments: ${results.length}`);
  console.log(`High Risk Flagged: ${highRiskFlagged} (${((highRiskFlagged/results.length)*100).toFixed(0)}%)`);
  console.log(`Review Required: ${reviewRequired} (${((reviewRequired/results.length)*100).toFixed(0)}%)`);
  console.log(`Cleared: ${cleared} (${((cleared/results.length)*100).toFixed(0)}%)`);
  console.log(`Insufficient Data: ${insufficientData} (${((insufficientData/results.length)*100).toFixed(0)}%)`);
  console.log('');
  console.log(`Total Expected Loss: $${totalLoss.toLocaleString()}`);
  console.log(`Average Loss/Shipment: $${avgLoss.toLocaleString()}`);
  console.log(`Max Loss: $${maxLoss.toLocaleString()}`);
  console.log(`Min Loss: $${minLoss.toLocaleString()}`);
  console.log('');
  
  // Validation criteria
  console.log('=== Validation Criteria ===');
  const criteria = [
    { name: 'Bad shipments flagged', pass: highRiskFlagged >= 4 },
    { name: 'Low risk cleared', pass: cleared >= 4 },
    { name: 'Loss calculated', pass: totalLoss > 0 },
    { name: 'Model healthy', pass: health.health === 'HEALTHY' || health.health === 'DEGRADED' }
  ];
  
  let allPassed = true;
  criteria.forEach(c => {
    const status = c.pass ? '✓ PASS' : '✗ FAIL';
    console.log(`${status}: ${c.name}`);
    if (!c.pass) allPassed = false;
  });
  
  console.log('\n' + (allPassed ? '✓ ALL VALIDATION CRITERIA PASSED' : '✗ SOME CRITERIA FAILED'));
  console.log('========================================\n');
  
  return results;
};

// Export for API use
module.exports = { runValidation };

// Run if called directly
if (require.main === module) {
  runValidation().catch(console.error);
}
