/**
 * Culbridge Simulation Engine
 * 
 * This is the core "moat" - predicting failure BEFORE submission.
 * 
 * Instead of just validating, we answer:
 * "What happens if I submit this shipment?"
 * 
 * The simulation runs against:
 * - Compliance rules
 * - External constraints (mocked)
 * - Rejection scenarios
 * 
 * This gives exporters confidence and prevents rejected shipments.
 */

const { RuleEngine } = require('./rule-engine');
const db = require('../utils/db');

/**
 * Port/Market Profiles
 * Simulates different border control strictness and requirements
 */
const PORT_PROFILES = {
    // Netherlands - Rotterdam (strict EUDR + MRL)
    NL: {
        country: 'NL',
        name: 'Netherlands (Rotterdam)',
        strictness: 'HIGH',
        checks: ['EUDR', 'RASFF', 'MRL', 'DOCUMENT'],
        mrlLimits: {
            aflatoxinB1: 2.0,      // μg/kg
            aflatoxinTotal: 4.0,
            cadmium: 0.5,          // mg/kg (cocoa)
            chlorpyrifos: 0.01,    // mg/kg
            dichlorvos: 0.01
        },
        requiredDocuments: ['COO', 'PHYTOSANITARY', 'LAB_REPORT'],
        eudrRequired: true
    },
    
    // Germany - Hamburg (strict)
    DE: {
        country: 'DE',
        name: 'Germany',
        strictness: 'HIGH',
        checks: ['EUDR', 'RASFF', 'MRL', 'DOCUMENT'],
        mrlLimits: {
            aflatoxinB1: 2.0,
            aflatoxinTotal: 4.0,
            cadmium: 0.5
        },
        requiredDocuments: ['COO', 'LAB_REPORT'],
        eudrRequired: true
    },
    
    // Belgium - Antwerp
    BE: {
        country: 'BE',
        name: 'Belgium',
        strictness: 'MEDIUM',
        checks: ['RASFF', 'MRL', 'DOCUMENT'],
        mrlLimits: {
            aflatoxinB1: 2.0,
            aflatoxinTotal: 4.0
        },
        requiredDocuments: ['COO', 'PHYTOSANITARY'],
        eudrRequired: true
    },
    
    // France
    FR: {
        country: 'FR',
        name: 'France',
        strictness: 'HIGH',
        checks: ['EUDR', 'RASFF', 'MRL', 'DOCUMENT'],
        mrlLimits: {
            aflatoxinB1: 2.0,
            aflatoxinTotal: 4.0
        },
        requiredDocuments: ['COO', 'LAB_REPORT'],
        eudrRequired: true
    },
    
    // UK (post-Brexit)
    GB: {
        country: 'GB',
        name: 'United Kingdom',
        strictness: 'MEDIUM',
        checks: ['MRL', 'DOCUMENT'],
        mrlLimits: {
            aflatoxinB1: 2.0,
            aflatoxinTotal: 4.0
        },
        requiredDocuments: ['COO', 'PHYTOSANITARY'],
        eudrRequired: false
    },
    
    // USA - FDA
    US: {
        country: 'US',
        name: 'United States',
        strictness: 'MEDIUM',
        checks: ['FDA', 'MRL', 'DOCUMENT'],
        mrlLimits: {
            aflatoxinB1: 20.0,  // Higher limit in US
            aflatoxinTotal: 20.0
        },
        requiredDocuments: ['COO', 'FDA_DOCS'],
        eudrRequired: false
    },
    
    // UAE - Dubai
    AE: {
        country: 'AE',
        name: 'UAE (Dubai)',
        strictness: 'LOW',
        checks: ['DOCUMENT', 'MRL'],
        mrlLimits: {
            aflatoxinB1: 10.0,
            aflatoxinTotal: 10.0
        },
        requiredDocuments: ['COO'],
        eudrRequired: false
    }
};

/**
 * Simulation Result
 */
class SimulationResult {
    constructor() {
        this.willPass = true;
        this.failurePoints = [];
        this.recommendations = [];
        this.checks = [];
        this.score = 100;
    }

    addFailure(stage, reason, severity = 'BLOCKER') {
        this.willPass = false;
        this.failurePoints.push({
            stage,
            reason,
            severity
        });
        if (severity === 'BLOCKER') {
            this.score = 0;
        } else if (severity === 'WARNING' && this.score > 50) {
            this.score = 50;
        }
    }

    addWarning(stage, reason) {
        this.failurePoints.push({
            stage,
            reason,
            severity: 'WARNING'
        });
        this.recommendations.push(`Address: ${reason}`);
        if (this.score > 70) {
            this.score = 70;
        }
    }

    addRecommendation(recommendation) {
        this.recommendations.push(recommendation);
    }

    addCheck(checkName, passed, details = '') {
        this.checks.push({
            name: checkName,
            passed,
            details
        });
    }

    toJSON() {
        return {
            willPass: this.willPass,
            score: this.score,
            failurePoints: this.failurePoints,
            recommendations: this.recommendations,
            checks: this.checks,
            simulatedAt: new Date().toISOString()
        };
    }
}

/**
 * Simulation Engine
 */
class SimulationEngine {
    constructor() {
        this.ruleEngine = new RuleEngine();
        this.portProfiles = PORT_PROFILES;
    }

    /**
     * Simulate a shipment against a destination profile
     * 
     * @param {Object} shipment - Full shipment object
     * @param {string} destinationCountry - Country code (NL, DE, etc.)
     * @returns {SimulationResult}
     */
    async simulate(shipment, destinationCountry) {
        const result = new SimulationResult();
        
        // Get port profile (default to NL if unknown)
        const profile = this.portProfiles[destinationCountry] || this.portProfiles.NL;
        
        // =====================================================
        // PHASE 1: Rule Engine Evaluation
        // =====================================================
        
        const { flags } = this.ruleEngine.runRules(shipment);
        
        // Convert rules to failure points
        const blockers = flags.filter(f => f.severity === 'BLOCKER');
        const warnings = flags.filter(f => f.severity === 'WARNING');
        
        for (const blocker of blockers) {
            result.addFailure(
                'RULE_ENGINE',
                blocker.message,
                'BLOCKER'
            );
        }
        
        for (const warning of warnings) {
            result.addWarning('RULE_ENGINE', warning.message);
        }
        
        result.addCheck(
            'Rule Evaluation',
            blockers.length === 0,
            `Found ${blockers.length} blockers, ${warnings.length} warnings`
        );
        
        // =====================================================
        // PHASE 2: Document Completeness
        // =====================================================
        
        const uploadedDocs = (shipment.documents || [])
            .filter(d => d.status === 'VALID')
            .map(d => d.type);
        
        const missingDocs = profile.requiredDocuments.filter(
            doc => !uploadedDocs.includes(doc)
        );
        
        if (missingDocs.length > 0) {
            result.addFailure(
                'DOCUMENT_CHECK',
                `Missing required documents: ${missingDocs.join(', ')}`,
                'BLOCKER'
            );
        } else {
            result.addCheck('Document Completeness', true, 'All required documents present');
        }
        
        // =====================================================
        // PHASE 3: EUDR Compliance (if required)
        // =====================================================
        
        if (profile.eudrRequired) {
            const hasTraceability = shipment.compliance?.eudrData?.traceabilityVerified === true;
            const hasGeolocation = shipment.compliance?.eudrData?.geolocation?.length > 0;
            
            if (!hasTraceability) {
                result.addFailure(
                    'EUDR_CHECK',
                    'EUDR traceability data required for EU destination',
                    'BLOCKER'
                );
            } else {
                result.addCheck('EUDR Traceability', true);
            }
            
            if (!hasGeolocation) {
                result.addFailure(
                    'EUDR_GEOLOCATION',
                    'Geolocation data required for EUDR compliance',
                    'BLOCKER'
                );
            } else {
                result.addCheck('EUDR Geolocation', true);
            }
        } else {
            result.addCheck('EUDR Compliance', true, 'Not required for this destination');
        }
        
        // =====================================================
        // PHASE 4: MRL (Maximum Residue Limits) Checks
        // =====================================================
        
        if (profile.checks.includes('MRL')) {
            const labResults = shipment.compliance?.labResults || {};
            
            // Check aflatoxin B1
            const aflatoxinB1 = labResults.aflatoxinB1 || 0;
            if (aflatoxinB1 > profile.mrlLimits.aflatoxinB1) {
                result.addFailure(
                    'MRL_AFLATOXIN',
                    `Aflatoxin B1: ${aflatoxinB1} μg/kg (limit: ${profile.mrlLimits.aflatoxinB1})`,
                    'BLOCKER'
                );
            } else if (aflatoxinB1 > 0) {
                result.addCheck('MRL Aflatoxin B1', true, `${aflatoxinB1} / ${profile.mrlLimits.aflatoxinB1} μg/kg`);
            }
            
            // Check total aflatoxins
            const aflatoxinTotal = labResults.aflatoxinTotal || 0;
            if (aflatoxinTotal > profile.mrlLimits.aflatoxinTotal) {
                result.addFailure(
                    'MRL_AFLATOXIN_TOTAL',
                    `Total aflatoxins: ${aflatoxinTotal} μg/kg (limit: ${profile.mrlLimits.aflatoxinTotal})`,
                    'BLOCKER'
                );
            } else if (aflatoxinTotal > 0) {
                result.addCheck('MRL Aflatoxin Total', true, `${aflatoxinTotal} / ${profile.mrlLimits.aflatoxinTotal} μg/kg`);
            }
            
            // Check cadmium (for cocoa)
            if (shipment.commodity?.commodity_type === 'cocoa') {
                const cadmium = labResults.cadmium || 0;
                if (cadmium > profile.mrlLimits.cadmium) {
                    result.addFailure(
                        'MRL_CADMIUM',
                        `Cadmium: ${cadmium} mg/kg (limit: ${profile.mrlLimits.cadmium})`,
                        'BLOCKER'
                    );
                } else if (cadmium > 0) {
                    result.addCheck('MRL Cadmium', true, `${cadmium} / ${profile.mrlLimits.cadmium} mg/kg`);
                }
            }
            
            // If no lab results at all
            if (Object.keys(labResults).length === 0 && shipment.commodity?.commodity_type !== 'ginger') {
                result.addWarning(
                    'MRL_LAB_RESULTS',
                    'No lab test results available - will be checked at border'
                );
                result.addRecommendation('Upload lab test report to predict MRL compliance');
            }
        }
        
        // =====================================================
        // PHASE 5: RASFF History Check (simulated)
        // =====================================================
        
        if (profile.checks.includes('RASFF')) {
            // In production, would check actual RASFF database
            // For simulation, check if flagged in shipment
            const rasffFlag = shipment.compliance?.rasffHistory;
            
            if (rasffFlag) {
                result.addFailure(
                    'RASFF_CHECK',
                    'RASFF alert history for this commodity/exporter',
                    'BLOCKER'
                );
            } else {
                result.addCheck('RASFF History', true, 'No RASFF alerts found');
            }
        }
        
        // =====================================================
        // PHASE 6: Entity Verification
        // =====================================================
        
        if (!shipment.entity?.exporter_verified) {
            result.addWarning(
                'ENTITY_VERIFICATION',
                'Exporter not verified - may cause delays'
            );
            result.addRecommendation('Verify exporter entity for faster processing');
        } else {
            result.addCheck('Entity Verification', true, 'Exporter verified');
        }
        
        // =====================================================
        // PHASE 7: HS Code Validation
        // =====================================================
        
        const hsCode = shipment.commodity?.hs_code;
        const confidence = shipment.commodity?.hs_code_confidence;
        
        if (!hsCode) {
            result.addFailure(
                'HS_CODE',
                'No HS code specified',
                'BLOCKER'
            );
        } else if (confidence && confidence < 0.7) {
            result.addWarning(
                'HS_CODE_CONFIDENCE',
                `HS code confidence only ${Math.round(confidence * 100)}%`
            );
        } else {
            result.addCheck('HS Code', true, `${hsCode} (${Math.round((confidence || 0) * 100)}% confidence)`);
        }
        
        // =====================================================
        // Final Recommendations
        // =====================================================
        
        if (result.willPass) {
            result.addRecommendation('Shipment appears ready for submission');
        } else {
            const blockerCount = result.failurePoints.filter(f => f.severity === 'BLOCKER').length;
            result.addRecommendation(`Fix ${blockerCount} blocking issue(s) before submission`);
        }
        
        return result.toJSON();
    }

    /**
     * Simulate against all known profiles for a destination
     */
    async simulateAllDestinations(shipment) {
        const results = {};
        const destination = shipment.destination?.country_code || 'NL';
        
        // Simulate against the specified destination
        results[destination] = await this.simulate(shipment, destination);
        
        return results;
    }

    /**
     * Get available port profiles
     */
    getProfiles() {
        return Object.entries(this.portProfiles).map(([code, profile]) => ({
            code,
            name: profile.name,
            strictness: profile.strictness,
            checks: profile.checks,
            eudrRequired: profile.eudrRequired
        }));
    }

    /**
     * Get profile for a country
     */
    getProfile(countryCode) {
        return this.portProfiles[countryCode] || this.portProfiles.NL;
    }
}

// Export singleton
module.exports = {
    SimulationEngine,
    SimulationResult,
    PORT_PROFILES
};

// =====================================================
// API Endpoint Example
// =====================================================

/**
 * POST /shipments/:id/simulate
 * 
 * Request:
 * {
 *   "destination": "NL"
 * }
 * 
 * Response:
 * {
 *   "willPass": false,
 *   "score": 0,
 *   "failurePoints": [
 *     {
 *       "stage": "DOCUMENT_CHECK",
 *       "reason": "Missing required documents: LAB_REPORT",
 *       "severity": "BLOCKER"
 *     }
 *   ],
 *   "recommendations": [
 *     "Fix 1 blocking issue(s) before submission"
 *   ],
 *   "checks": [
 *     { "name": "Rule Evaluation", "passed": true },
 *     { "name": "Document Completeness", "passed": false }
 *   ]
 * }
 */