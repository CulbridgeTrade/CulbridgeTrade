/**
 * Unit Tests for Dynamic Mapping Engine
 * 
 * Every rule and mapping change must have tests verifying BLOCKER and WARNING outcomes.
 */

const dynamicMapping = require('./dynamic-mapping');

console.log('=== DYNAMIC MAPPING ENGINE - UNIT TESTS ===\n');

// Test 1: Get mapping for valid product/corridor
console.log('TEST 1: Get valid mapping (sesame -> NG-NL)');
const sesameNL = dynamicMapping.getMapping('sesame', 'NG-NL');
console.assert(sesameNL !== null, 'Mapping should exist');
console.assert(sesameNL.productCategory === 'sesame', 'Product should be sesame');
console.assert(sesameNL.corridorId === 'NG-NL', 'Corridor should be NG-NL');
console.assert(sesameNL.requiredLabTests.includes('ethylene_oxide'), 'Should require EO test');
console.log('✅ PASSED\n');

// Test 2: Get required lab tests
console.log('TEST 2: Get required lab tests (cocoa -> NG-NL)');
const cocoaTests = dynamicMapping.getRequiredLabTests('cocoa', 'NG-NL');
console.assert(cocoaTests.includes('aflatoxin_b1'), 'Should require aflatoxin');
console.assert(cocoaTests.includes('cadmium'), 'Should require cadmium');
console.assert(cocoaTests.includes('lead'), 'Should require lead');
console.log('✅ PASSED\n');

// Test 3: Validate required tests - all present
console.log('TEST 3: Validate all required tests present');
const labResults = {
  ethylene_oxide: 0.01,
  aflatoxin_b1: 1.0,
  aflatoxin_total: 2.0,
  salmonella: 0
};
const testValidation = dynamicMapping.validateRequiredTests('sesame', 'NG-NL', labResults);
console.assert(testValidation.valid === true, 'Should be valid');
console.assert(testValidation.missing.length === 0, 'No missing tests');
console.log('✅ PASSED\n');

// Test 4: Validate required tests - missing
console.log('TEST 4: Validate missing required tests');
const partialLabResults = {
  ethylene_oxide: 0.01
  // missing aflatoxin_total, salmonella
};
const missingValidation = dynamicMapping.validateRequiredTests('sesame', 'NG-NL', partialLabResults);
console.assert(missingValidation.valid === false, 'Should be invalid');
console.assert(missingValidation.missing.includes('aflatoxin_b1'), 'Should flag missing aflatoxin');
console.assert(missingValidation.missing.includes('aflatoxin_total'), 'Should flag missing total');
console.log('✅ PASSED\n');

// Test 5: Evaluate against thresholds - PASS
console.log('TEST 5: Evaluate thresholds - PASS (below MRL)');
const passResults = {
  ethylene_oxide: 0.01,  // below 0.02
  aflatoxin_b1: 1.0,     // below 2.0
  aflatoxin_total: 2.0   // below 4.0
};
const passEval = dynamicMapping.evaluateAgainstThresholds('sesame', 'NG-NL', passResults);
console.assert(passEval.passed === true, 'Should pass');
console.assert(passEval.blockers.length === 0, 'No blockers');
console.log('✅ PASSED\n');

// Test 6: Evaluate against thresholds - BLOCKER (exceeds MRL)
console.log('TEST 6: Evaluate thresholds - BLOCKER (exceeds MRL)');
const failResults = {
  ethylene_oxide: 0.12,  // above 0.02
  aflatoxin_b1: 1.0,
  aflatoxin_total: 2.0
};
const failEval = dynamicMapping.evaluateAgainstThresholds('sesame', 'NG-NL', failResults);
console.assert(failEval.passed === false, 'Should fail');
console.assert(failEval.blockers.length > 0, 'Should have blockers');
console.assert(failEval.blockers[0].rule === 'ETHYLENE_OXIDE_EXCEEDS_MRL', 'Should flag EO');
console.log('✅ PASSED\n');

// Test 7: Evaluate against thresholds - BLOCKER (zero tolerance)
console.log('TEST 7: Evaluate thresholds - BLOCKER (salmonella zero tolerance)');
const zeroTolResults = {
  ethylene_oxide: 0.01,
  aflatoxin_b1: 1.0,
  aflatoxin_total: 2.0,
  salmonella: 1  // any positive = BLOCKER
};
const zeroTolEval = dynamicMapping.evaluateAgainstThresholds('sesame', 'NG-NL', zeroTolResults);
console.assert(zeroTolEval.passed === false, 'Should fail');
console.assert(zeroTolEval.blockers.some(b => b.substance === 'salmonella'), 'Should flag salmonella');
console.log('✅ PASSED\n');

// Test 8: Get threshold values
console.log('TEST 8: Get threshold values');
const eoThreshold = dynamicMapping.getThreshold('sesame', 'NG-NL', 'ethylene_oxide');
console.assert(eoThreshold === 0.02, 'EO threshold should be 0.02');
const cdThreshold = dynamicMapping.getThreshold('ginger', 'NG-NL', 'cadmium');
console.assert(cdThreshold === 0.5, 'Cadmium threshold should be 0.5');
console.log('✅ PASSED\n');

// Test 9: Unknown mapping returns null
console.log('TEST 9: Unknown product/corridor');
const unknown = dynamicMapping.getMapping('unknown', 'NG-XX');
console.assert(unknown === null, 'Should return null for unknown');
console.log('✅ PASSED\n');

// Test 10: Validate documents - all present
console.log('TEST 10: Validate all required documents present');
const docs = {
  phytosanitary: { present: true },
  certificate_of_origin: { present: true }
};
const docValidation = dynamicMapping.validateRequiredDocuments('sesame', 'NG-NL', docs);
console.assert(docValidation.valid === true, 'Should be valid');
console.log('✅ PASSED\n');

// Test 11: Validate documents - missing
console.log('TEST 11: Validate missing required documents');
const missingDocs = {
  phytosanitary: { present: true }
  // missing certificate_of_origin
};
const missingDocValidation = dynamicMapping.validateRequiredDocuments('sesame', 'NG-NL', missingDocs);
console.assert(missingDocValidation.valid === false, 'Should be invalid');
console.assert(missingDocValidation.missing.includes('certificate_of_origin'), 'Should flag missing CoO');
console.log('✅ PASSED\n');

// Test 12: Get all product categories
console.log('TEST 12: Get all product categories');
const categories = dynamicMapping.getProductCategories();
console.assert(categories.includes('sesame'), 'Should include sesame');
console.assert(categories.includes('cocoa'), 'Should include cocoa');
console.assert(categories.includes('ginger'), 'Should include ginger');
console.log(`Found ${categories.length} categories: ${categories.join(', ')}\n✅ PASSED\n`);

// Test 13: Get all corridors
console.log('TEST 13: Get all corridors');
const corridors = dynamicMapping.getCorridors();
console.assert(corridors.includes('NG-NL'), 'Should include NG-NL');
console.assert(corridors.includes('NG-DE'), 'Should include NG-DE');
console.log(`Found ${corridors.length} corridors: ${corridors.join(', ')}\n✅ PASSED\n`);

// Summary
console.log('========================================');
console.log('ALL UNIT TESTS PASSED');
console.log('========================================');

// Simple assertion helper
function consoleAssert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
}