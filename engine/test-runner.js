/**
 * NG → EU Corridor Test Runner
 * 
 * Loads config/ng-eu-corridor.json and runs rule engine against sample shipments.
 * Dev team can use this to validate logic immediately.
 * 
 * Usage: node engine/test-runner.js
 */

const fs = require('fs');
const path = require('path');

// Load config
const configPath = path.join(__dirname, '../config/ng-eu-corridor.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

console.log('═══════════════════════════════════════════════════════');
console.log('CULBRIDGE NG → EU CORRIDOR TEST RUNNER');
console.log('═══════════════════════════════════════════════════════\n');

// =====================================================
// LAB REGISTRY (in-memory for testing)
// =====================================================
const labRegistry = new Map();
config.labRegistry.entities.forEach(lab => {
    labRegistry.set(lab.id, lab);
});

// =====================================================
// PRODUCT ONTOLOGY
// =====================================================
const productOntology = config.productOntology.products;

// =====================================================
// MRL THRESHOLDS
// =====================================================
const mrlThresholds = new Map();
config.mrlThresholds.thresholds.forEach(t => {
    const key = `${t.substance}_${t.appliesTo || 'any'}`;
    mrlThresholds.set(key, t);
});

// =====================================================
// RULE ENGINE
// =====================================================
function evaluateShipment(shipment) {
    const results = {
        passed: [],
        warnings: [],
        blockers: []
    };
    
    const product = shipment.product;
    const requiredTests = productOntology[product]?.requiredTests || [];
    
    // 1. LAB VERIFICATION RULES
    for (const [substance, labResult] of Object.entries(shipment.labResults)) {
        const lab = labRegistry.get(labResult.labId);
        
        // Check lab exists
        if (!lab) {
            results.blockers.push({
                rule: 'LAB_VERIFIED_ACTIVE',
                message: `Lab "${labResult.labId}" not found in registry`
            });
            continue;
        }
        
        // Check lab verified
        if (!lab.verified) {
            results.blockers.push({
                rule: 'LAB_VERIFIED_TRUE',
                message: `Lab "${lab.name}" is not verified`
            });
        }
        
        // Check lab active
        if (lab.status !== 'ACTIVE') {
            results.blockers.push({
                rule: 'LAB_VERIFIED_ACTIVE',
                message: `Lab "${lab.name}" status is ${lab.status}`
            });
        }
        
        // Check report hash exists
        if (!labResult.reportHash) {
            results.blockers.push({
                rule: 'LAB_REPORT_HASH',
                message: `Lab result for ${substance} missing report hash`
            });
        }
    }
    
    // 2. REQUIRED TESTS CHECK
    const presentTests = Object.keys(shipment.labResults);
    for (const required of requiredTests) {
        // Map test name to substance keys in labResults
        const substanceToLabKey = {
            'ethylene_oxide': ['ethylene_oxide'],
            'aflatoxin': ['aflatoxin_b1', 'aflatoxin_total'],
            'salmonella': ['salmonella'],
            'cadmium': ['cadmium'],
            'lead': ['lead'],
            'mercury': ['mercury'],
            'histamine': ['histamine'],
            'ochratoxin_a': ['ochratoxin_a']
        };
        
        const substances = substanceToLabKey[required] || [required];
        const hasTest = substances.some(s => presentTests.includes(s));
        
        if (!hasTest) {
            results.blockers.push({
                rule: 'REQUIRED_TEST_EXISTS',
                message: `Mandatory lab test missing: ${required}`
            });
        }
    }
    
    // 3. MRL THRESHOLD CHECKS
    for (const [substance, labResult] of Object.entries(shipment.labResults)) {
        // Check specific MRLs for product
        const mrlKey = `${substance}_${product}`;
        const mrl = mrlThresholds.get(mrlKey) || mrlThresholds.get(`${substance}_any`);
        
        if (mrl && labResult.value !== undefined) {
            if (labResult.value > mrl.limit) {
                results.blockers.push({
                    rule: `MRL_${substance.toUpperCase()}`,
                    message: `${substance} ${labResult.value} ${labResult.unit} exceeds EU MRL of ${mrl.limit} ${mrl.unit}`
                });
            }
        }
    }
    
    // 4. SPECIAL RULES (Sesame specific)
    if (product === 'sesame') {
        // Salmonella must be absent (0)
        if (shipment.labResults.salmonella && shipment.labResults.salmonella.value > 0) {
            results.blockers.push({
                rule: 'SALMONELLA_ABSENT',
                message: 'Salmonella must be absent (0) for sesame exports'
            });
        }
    }
    
    // 5. Fish rules
    if (product === 'fish') {
        if (shipment.labResults.mercury && shipment.labResults.mercury.value > 1.0) {
            results.blockers.push({
                rule: 'MRL_MERCURY_FISH',
                message: `Mercury ${shipment.labResults.mercury.value} mg/kg exceeds EU limit of 1.0 mg/kg`
            });
        }
        if (shipment.labResults.histamine && shipment.labResults.histamine.value > 100) {
            results.blockers.push({
                rule: 'MRL_HISTAMINE_FISH',
                message: `Histamine ${shipment.labResults.histamine.value} mg/kg exceeds EU limit of 100 mg/kg`
            });
        }
    }
    
    return results;
}

// =====================================================
// RUN TESTS
// =====================================================
console.log(`Running ${config.sampleShipments.shipments.length} test shipments...\n`);

let passCount = 0;
let failCount = 0;

for (const shipment of config.sampleShipments.shipments) {
    console.log('───────────────────────────────────────────────────────');
    console.log(`TEST: ${shipment.id}`);
    console.log(`Desc: ${shipment.description}`);
    console.log(`Product: ${shipment.product} | Corridor: ${shipment.corridor}`);
    console.log('───────────────────────────────────────────────────────');
    
    const results = evaluateShipment(shipment);
    
    const hasBlockers = results.blockers.length > 0;
    const expectedFail = shipment.expectedResult.startsWith('BLOCKER');
    
    if (hasBlockers) {
        console.log('❌ BLOCKERS:');
        results.blockers.forEach(b => {
            console.log(`   • ${b.rule}: ${b.message}`);
        });
    } else {
        console.log('✅ PASS - No blockers');
    }
    
    // Verify against expected result
    if (hasBlockers === expectedFail) {
        console.log(`✅ RESULT: MATCHES EXPECTED (${shipment.expectedResult})`);
        passCount++;
    } else {
        console.log(`❌ RESULT: MISMATCH - Expected ${shipment.expectedResult}`);
        failCount++;
    }
    
    console.log('');
}

// =====================================================
// SUMMARY
// =====================================================
console.log('═══════════════════════════════════════════════════════');
console.log('TEST SUMMARY');
console.log('═══════════════════════════════════════════════════════');
console.log(`Total: ${passCount + failCount}`);
console.log(`Passed: ${passCount} ✅`);
console.log(`Failed: ${failCount} ❌`);
console.log('');

if (failCount === 0) {
    console.log('🎉 ALL TESTS PASSED - Engine is working correctly!');
} else {
    console.log('⚠️  SOME TESTS FAILED - Review rule engine logic');
}

console.log('');
console.log('Next: Run against real shipments to validate pipeline.');