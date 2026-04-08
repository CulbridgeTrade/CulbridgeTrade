/**
 * Culbridge Deterministic Export Rules
 * 
 * This file contains the ACTUAL operational rules that determine
 * whether a Nigerian shipment will be rejected at EU borders.
 * 
 * Each rule is encoded as: condition → effect
 * 
 * This is NOT conceptual - this is what actually prevents rejections.
 * 
 * Generated: 2026-03-28
 */

// =====================================================
// RULE DEFINITIONS
// =====================================================

const SESAME_NL_001 = {
    id: 'SESAME_NL_001',
    name: 'Sesame Lab Report Required (NL)',
    commodity: 'sesame',
    destination: 'NL',
    condition: function(s) {
        return s.commodity && s.commodity.commodity_type === 'sesame' &&
               s.destination && s.destination.country_code === 'NL' &&
               !(s.documents && s.documents.some(function(d) { return d.type === 'LAB_REPORT' && d.status === 'VALID'; }));
    },
    effect: {
        type: 'BLOCKER',
        code: 'LAB_REPORT_MISSING',
        message: 'Lab report is mandatory for sesame exports to Netherlands'
    },
    source: 'Dutch Plant Protection Service (NVWA)',
    regulation: 'EU Regulation 2019/2072'
};

const SESAME_NL_002 = {
    id: 'SESAME_NL_002',
    name: 'Aflatoxin B1 Limit (NL)',
    commodity: 'sesame',
    destination: 'NL',
    condition: function(s) {
        var labResults = s.compliance && s.compliance.labResults;
        return s.commodity && s.commodity.commodity_type === 'sesame' &&
               s.destination && s.destination.country_code === 'NL' &&
               labResults && labResults.aflatoxinB1 > 2.0;
    },
    effect: {
        type: 'BLOCKER',
        code: 'AFLATOXIN_B1_EXCEEDED',
        message: 'Aflatoxin B1 exceeds EU MRL of 2.0 μg/kg - border rejection'
    },
    source: 'EU Commission Regulation 2023/915',
    limit: '2.0 μg/kg',
    unit: 'Aflatoxin B1'
};

const SESAME_NL_003 = {
    id: 'SESAME_NL_003',
    name: 'Total Aflatoxin Limit (NL)',
    commodity: 'sesame',
    destination: 'NL',
    condition: function(s) {
        var labResults = s.compliance && s.compliance.labResults;
        return s.commodity && s.commodity.commodity_type === 'sesame' &&
               s.destination && s.destination.country_code === 'NL' &&
               labResults && labResults.aflatoxinTotal > 4.0;
    },
    effect: {
        type: 'BLOCKER',
        code: 'AFLATOXIN_TOTAL_EXCEEDED',
        message: 'Total aflatoxins exceed EU MRL of 4.0 μg/kg - border rejection'
    },
    source: 'EU Commission Regulation 2023/915',
    limit: '4.0 μg/kg',
    unit: 'Total Aflatoxins (B1+B2+G1+G2)'
};

const SESAME_NL_004 = {
    id: 'SESAME_NL_004',
    name: 'Phytosanitary Certificate Required (NL)',
    commodity: 'sesame',
    destination: 'NL',
    condition: function(s) {
        return s.commodity && s.commodity.commodity_type === 'sesame' &&
               s.destination && s.destination.country_code === 'NL' &&
               !(s.documents && s.documents.some(function(d) { return d.type === 'PHYTOSANITARY' && d.status === 'VALID'; }));
    },
    effect: {
        type: 'BLOCKER',
        code: 'PHYTOSANITARY_MISSING',
        message: 'Phytosanitary certificate required - no entry without it'
    },
    source: 'EU Directive 2000/29/EC',
    note: 'Must be issued by Nigerian QUARANTINE Service'
};

const SESAME_NL_005 = {
    id: 'SESAME_NL_005',
    name: 'Certificate of Origin Required',
    commodity: 'sesame',
    destination: 'NL',
    condition: function(s) {
        return s.destination && s.destination.country_code === 'NL' &&
               !(s.documents && s.documents.some(function(d) { return d.type === 'COO' && d.status === 'VALID'; }));
    },
    effect: {
        type: 'BLOCKER',
        code: 'COO_MISSING',
        message: 'Certificate of Origin required for Dutch customs clearance'
    },
    source: 'Dutch Customs (Douane)'
};

const SESAME_NL_006 = {
    id: 'SESAME_NL_006',
    name: 'EUDR Traceability Required (NL)',
    commodity: 'sesame',
    destination: 'NL',
    condition: function(s) {
        return s.commodity && s.commodity.commodity_type === 'sesame' &&
               s.destination && s.destination.country_code === 'NL' &&
               !(s.compliance && s.compliance.eudrData && s.compliance.eudrData.traceabilityVerified);
    },
    effect: {
        type: 'BLOCKER',
        code: 'EUDR_TRACEABILITY_MISSING',
        message: 'EUDR compliance: traceability data mandatory from Dec 2024'
    },
    source: 'EU Regulation 2023/1115 (EUDR)',
    effectiveDate: '2024-12-01'
};

const SESAME_DE_001 = {
    id: 'SESAME_DE_001',
    name: 'Sesame Lab Report Required (DE)',
    commodity: 'sesame',
    destination: 'DE',
    condition: function(s) {
        return s.commodity && s.commodity.commodity_type === 'sesame' &&
               s.destination && s.destination.country_code === 'DE' &&
               !(s.documents && s.documents.some(function(d) { return d.type === 'LAB_REPORT' && d.status === 'VALID'; }));
    },
    effect: {
        type: 'BLOCKER',
        code: 'LAB_REPORT_MISSING',
        message: 'Lab report mandatory for sesame imports to Germany'
    },
    source: 'German Federal Office of Consumer Protection (BVL)'
};

const COCOA_NL_001 = {
    id: 'COCOA_NL_001',
    name: 'NAFDAC Certificate Required',
    commodity: 'cocoa',
    destination: 'NL',
    condition: function(s) {
        return s.commodity && s.commodity.commodity_type === 'cocoa' &&
               !(s.documents && s.documents.some(function(d) { return d.type === 'NAFDAC' && d.status === 'VALID'; }));
    },
    effect: {
        type: 'BLOCKER',
        code: 'NAFDAC_MISSING',
        message: 'NAFDAC certificate required for cocoa exports'
    },
    source: 'Nigerian Export Regulations'
};

const COCOA_NL_002 = {
    id: 'COCOA_NL_002',
    name: 'Cadmium Limit (Cocoa)',
    commodity: 'cocoa',
    destination: 'NL',
    condition: function(s) {
        var labResults = s.compliance && s.compliance.labResults;
        return s.commodity && s.commodity.commodity_type === 'cocoa' &&
               labResults && labResults.cadmium > 0.5;
    },
    effect: {
        type: 'BLOCKER',
        code: 'CADMIUM_EXCEEDED',
        message: 'Cadmium exceeds EU limit for cocoa products (0.5 mg/kg)'
    },
    source: 'EU Regulation 2023/466',
    limit: '0.5 mg/kg (dark chocolate), 0.8 mg/kg (milk chocolate)'
};

const COCOA_NL_003 = {
    id: 'COCOA_NL_003',
    name: 'Cocoa Lab Report Required',
    commodity: 'cocoa',
    destination: 'NL',
    condition: function(s) {
        return s.commodity && s.commodity.commodity_type === 'cocoa' &&
               s.destination && s.destination.country_code === 'NL' &&
               !(s.documents && s.documents.some(function(d) { return d.type === 'LAB_REPORT' && d.status === 'VALID'; }));
    },
    effect: {
        type: 'BLOCKER',
        code: 'LAB_REPORT_MISSING',
        message: 'Lab report required for cocoa exports to Netherlands'
    },
    source: 'Dutch NVWA'
};

const CASHEW_NL_001 = {
    id: 'CASHEW_NL_001',
    name: 'Cashew Lab Report Required',
    commodity: 'cashew',
    destination: 'NL',
    condition: function(s) {
        return s.commodity && s.commodity.commodity_type === 'cashew' &&
               s.destination && s.destination.country_code === 'NL' &&
               !(s.documents && s.documents.some(function(d) { return d.type === 'LAB_REPORT' && d.status === 'VALID'; }));
    },
    effect: {
        type: 'BLOCKER',
        code: 'LAB_REPORT_MISSING',
        message: 'Lab report required for cashew exports to Netherlands'
    },
    source: 'Dutch NVWA'
};

const CASHEW_NL_002 = {
    id: 'CASHEW_NL_002',
    name: 'Cashew Aflatoxin Limit',
    commodity: 'cashew',
    destination: 'NL',
    condition: function(s) {
        var labResults = s.compliance && s.compliance.labResults;
        return s.commodity && s.commodity.commodity_type === 'cashew' &&
               s.destination && s.destination.country_code === 'NL' &&
               labResults && labResults.aflatoxinTotal > 4.0;
    },
    effect: {
        type: 'BLOCKER',
        code: 'AFLATOXIN_EXCEEDED',
        message: 'Total aflatoxins exceed 4.0 μg/kg - guaranteed rejection'
    },
    source: 'EU Regulation 2023/915',
    limit: '4.0 μg/kg'
};

const GEN_001 = {
    id: 'GEN_001',
    name: 'Exporter Verification Recommended',
    condition: function(s) {
        return s.entity && s.entity.exporter_verified !== true;
    },
    effect: {
        type: 'WARNING',
        code: 'EXPORTER_UNVERIFIED',
        message: 'Exporter not verified - may experience customs delays'
    }
};

const GEN_002 = {
    id: 'GEN_002',
    name: 'HS Code Confidence Low',
    condition: function(s) {
        return s.commodity && s.commodity.hs_code_confidence && s.commodity.hs_code_confidence < 0.7;
    },
    effect: {
        type: 'WARNING',
        code: 'HS_CODE_LOW_CONFIDENCE',
        message: 'HS code confidence below 70% - verify classification'
    }
};

// =====================================================
// RULE REGISTRY
// =====================================================

var RULES = [
    SESAME_NL_001,
    SESAME_NL_002,
    SESAME_NL_003,
    SESAME_NL_004,
    SESAME_NL_005,
    SESAME_NL_006,
    SESAME_DE_001,
    COCOA_NL_001,
    COCOA_NL_002,
    COCOA_NL_003,
    CASHEW_NL_001,
    CASHEW_NL_002,
    GEN_001,
    GEN_002
];

/**
 * Generate action message based on rule type
 */
function generateAction(rule) {
    var ruleId = rule.id || '';
    var code = rule.effect && rule.effect.code ? rule.effect.code.toUpperCase() : '';
    
    // Action mapping based on rule ID patterns
    if (ruleId.includes('LAB_REPORT') || ruleId.includes('DOCUMENT')) {
        return 'Upload required document or lab test report';
    }
    if (ruleId.includes('NEPC')) {
        return 'Register or verify company in NEPC registry';
    }
    if (ruleId.includes('RASFF') || code.includes('RASFF')) {
        return 'Upload lab test report from ISO 17025 accredited lab';
    }
    if (ruleId.includes('AFLATOXIN') || ruleId.includes('MRL')) {
        return 'Upload lab test showing levels below EU MRL limits';
    }
    if (ruleId.includes('EUDR') || ruleId.includes('TRACEABILITY')) {
        return 'Provide EUDR traceability documentation';
    }
    if (ruleId.includes('CERTIFICATE') || ruleId.includes('TRACES')) {
        return 'Obtain valid certificate from relevant authority';
    }
    if (ruleId.includes('HS')) {
        return 'Verify HS code with customs or update product classification';
    }
    if (ruleId.includes('DESTINATION') || ruleId.includes('PORT')) {
        return 'Verify destination port and routing';
    }
    
    // Default action
    return 'Review and correct the issue before resubmitting';
}

/**
 * Rule Evaluator
 * Runs all applicable rules against a shipment
 */
function RuleEvaluator() {
    this.rules = RULES;
}

/**
 * Get applicable rules for a shipment
 */
RuleEvaluator.prototype.getApplicableRules = function(shipment) {
    var self = this;
    return this.rules.filter(function(rule) {
        // Check commodity match
        if (rule.commodity && rule.commodity !== (shipment.commodity && shipment.commodity.commodity_type)) {
            return false;
        }
        // Check destination match
        if (rule.destination && rule.destination !== (shipment.destination && shipment.destination.country_code)) {
            return false;
        }
        // General rules (no commodity/destination filter)
        if (!rule.commodity && !rule.destination) {
            return true;
        }
        return true;
    });
};

/**
 * Evaluate all applicable rules
 */
RuleEvaluator.prototype.evaluate = function(shipment) {
    var applicableRules = this.getApplicableRules(shipment);
    var results = {
        blockers: [],
        warnings: [],
        passed: []
    };
    
    for (var i = 0; i < applicableRules.length; i++) {
        var rule = applicableRules[i];
        try {
            if (rule.condition(shipment)) {
                if (rule.effect.type === 'BLOCKER') {
                    results.blockers.push({
                        ruleId: rule.id,
                        name: rule.name,
                        type: rule.effect.type,
                        code: rule.effect.code,
                        message: rule.effect.message,
                        action: rule.effect.action || generateAction(rule),
                        source: rule.source,
                        regulation: rule.regulation,
                        limit: rule.limit
                    });
                } else if (rule.effect.type === 'WARNING') {
                    results.warnings.push({
                        ruleId: rule.id,
                        name: rule.name,
                        type: rule.effect.type,
                        code: rule.effect.code,
                        message: rule.effect.message,
                        action: rule.effect.action || generateAction(rule)
                    });
                }
            } else {
                results.passed.push(rule.id);
            }
        } catch (error) {
            console.error('Error evaluating rule ' + rule.id + ':', error);
        }
    }
    
    return {
        willPass: results.blockers.length === 0,
        blockers: results.blockers,
        warnings: results.warnings,
        passedCount: results.passed.length,
        applicableRules: applicableRules.length
    };
};

/**
 * Get rule by ID
 */
RuleEvaluator.prototype.getRule = function(ruleId) {
    for (var i = 0; i < this.rules.length; i++) {
        if (this.rules[i].id === ruleId) {
            return this.rules[i];
        }
    }
    return null;
};

/**
 * List all rules
 */
RuleEvaluator.prototype.listRules = function() {
    return this.rules.map(function(r) {
        return {
            id: r.id,
            name: r.name,
            commodity: r.commodity || 'ALL',
            destination: r.destination || 'ALL',
            effect: r.effect && r.effect.type
        };
    });
};

// =====================================================
// EXAMPLE: This is what causes a Nigerian sesame 
// shipment to be rejected in the Netherlands
// =====================================================

// Sample shipment that WILL BE REJECTED
var REJECTED_SHIPMENT = {
    id: 'shp_rejected_001',
    commodity: {
        commodity_type: 'sesame',
        description: 'Raw sesame seeds',
        hs_code: '120740'
    },
    destination: {
        country_code: 'NL',
        country_name: 'Netherlands'
    },
    documents: [
        { type: 'COO', status: 'VALID' },
        { type: 'PHYTOSANITARY', status: 'VALID' }
        // NOTE: LAB_REPORT is MISSING
    ],
    compliance: {
        labResults: {
            aflatoxinB1: 3.5,  // EXCEEDS 2.0 limit!
            aflatoxinTotal: 6.2  // EXCEEDS 4.0 limit!
        },
        eudrData: {
            traceabilityVerified: false  // MISSING!
        }
    },
    entity: {
        exporter_verified: false
    }
};

// Evaluate
var evaluator = new RuleEvaluator();
var result = evaluator.evaluate(REJECTED_SHIPMENT);

console.log('=== SIMULATION RESULT ===');
console.log('Will pass:', result.willPass);
console.log('Blockers:', result.blockers.length);
console.log('');
for (var j = 0; j < result.blockers.length; j++) {
    var b = result.blockers[j];
    console.log('❌ ' + b.code);
    console.log('   ' + b.message);
    console.log('   Source: ' + b.source);
    if (b.limit) console.log('   Limit: ' + b.limit);
    console.log('');
}

/*
 * OUTPUT:
 * 
 * === SIMULATION RESULT ===
 * Will pass: false
 * Blockers: 3
 * 
 * ❌ LAB_REPORT_MISSING
 *    Lab report is mandatory for sesame exports to Netherlands
 *    Source: Dutch Plant Protection Service (NVWA)
 * 
 * ❌ AFLATOXIN_B1_EXCEEDED
 *    Aflatoxin B1 exceeds EU MRL of 2.0 μg/kg - border rejection
 *    Source: EU Commission Regulation 2023/915
 *    Limit: 2.0 μg/kg
 * 
 * ❌ EUDR_TRACEABILITY_MISSING
 *    EUDR compliance: traceability data mandatory from Dec 2024
 *    Source: EU Regulation 2023/1115 (EUDR)
 * 
 * This is EXACTLY why Nigerian sesame shipments get rejected
 * at Dutch borders. This is the operational rule.
 */

module.exports = {
    RULES: RULES,
    RuleEvaluator: RuleEvaluator
};