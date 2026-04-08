/**
 * Culbridge Rule Engine
 * 
 * Deterministic constraint evaluation system.
 * 
 * NOT building "if statements" - building a data-driven rule system where:
 * - Rules are data (stored in database, not hardcoded)
 * - Each rule has: condition (function) → effect (flag/document requirement)
 * - Evaluation is deterministic and explainable
 */

const db = require('../utils/db');
const { logAuditEvent } = require('./audit-engine');

/**
 * Rule structure (data-driven)
 */
class Rule {
    constructor(config) {
        this.id = config.id;
        this.module = config.module; // 'COMPLIANCE' | 'DOCUMENT' | 'COMMODITY'
        this.commodityTypes = config.commodityTypes || [];
        this.destinationCountries = config.destinationCountries || [];
        this.condition = config.condition; // Function that evaluates shipment
        this.effect = config.effect; // { type: 'FLAG' | 'REQUIRE_DOCUMENT', payload }
    }

    /**
     * Evaluate this rule against a shipment
     * @param {Object} shipment - Full shipment object
     * @returns {Object|null} - Effect if condition met, null otherwise
     */
    evaluate(shipment) {
        try {
            if (this.condition(shipment)) {
                return this.effect;
            }
            return null;
        } catch (error) {
            console.error(`Rule ${this.id} evaluation error:`, error);
            return null;
        }
    }
}

/**
 * Rule Effects
 */
const EffectType = {
    FLAG: 'FLAG',
    REQUIRE_DOCUMENT: 'REQUIRE_DOCUMENT'
};

const Severity = {
    INFO: 'INFO',
    WARNING: 'WARNING',
    BLOCKER: 'BLOCKER'
};

/**
 * Built-in rule conditions
 */
const Conditions = {
    /**
     * Check if shipment has a specific document type
     */
    hasDocument: (shipment, docType) => {
        const docs = shipment.documents || [];
        return docs.some(d => d.type === docType && d.status === 'VALID');
    },

    /**
     * Check if shipment has any document of a type
     */
    hasAnyDocument: (shipment, docTypes) => {
        const docs = shipment.documents || [];
        return docTypes.some(dt => docs.some(d => d.type === dt));
    },

    /**
     * Check if HS code starts with prefix
     */
    hsCodeStartsWith: (shipment, prefix) => {
        const hsCode = shipment.commodity?.hs_code || '';
        return hsCode.startsWith(prefix);
    },

    /**
     * Check destination country
     */
    destinationIs: (shipment, countryCode) => {
        return shipment.destination?.country_code === countryCode;
    },

    /**
     * Check commodity type
     */
    commodityIs: (shipment, commodityType) => {
        return shipment.commodity?.commodity_type === commodityType;
    },

    /**
     * Check if entity is verified
     */
    entityVerified: (shipment) => {
        return shipment.entity?.exporter_verified === true;
    },

    /**
     * Check if value exceeds threshold
     */
    valueExceeds: (shipment, field, threshold) => {
        const value = shipment.commodity?.[field] || 0;
        return value > threshold;
    },

    /**
     * AND condition
     */
    and: (...conditions) => {
        return (shipment) => conditions.every(fn => fn(shipment));
    },

    /**
     * OR condition
     */
    or: (...conditions) => {
        return (shipment) => conditions.some(fn => fn(shipment));
    },

    /**
     * NOT condition
     */
    not: (condition) => {
        return (shipment) => !condition(shipment);
    }
};

/**
 * Predefined Rules Database
 * These are loaded from the database in production
 */
const RULE_REGISTRY = {
    // =====================================================
    // SESAME RULES (Nigeria → Netherlands)
    // =====================================================
    
    'SESAME_LAB_REQUIRED': {
        id: 'SESAME_LAB_REQUIRED',
        module: 'DOCUMENT',
        commodityTypes: ['sesame'],
        destinationCountries: ['NL', 'DE', 'BE', 'FR'],
        condition: (s) => 
            Conditions.commodityIs(s, 'sesame') && 
            Conditions.destinationIs(s, 'NL') &&
            !Conditions.hasDocument(s, 'LAB_REPORT'),
        effect: {
            type: EffectType.FLAG,
            payload: {
                code: 'LAB_REQUIRED',
                severity: Severity.BLOCKER,
                message: 'Lab report required for sesame exports to Netherlands'
            }
        }
    },

    'SESAME_AFLATOXIN_LIMIT': {
        id: 'SESAME_AFLATOXIN_LIMIT',
        module: 'COMPLIANCE',
        commodityTypes: ['sesame'],
        condition: (s) => {
            // Would check lab results in production
            const labReport = s.compliance?.labResults;
            return Conditions.commodityIs(s, 'sesame') && labReport?.aflatoxinB1 > 2.0;
        },
        effect: {
            type: EffectType.FLAG,
            payload: {
                code: 'AFLATOXIN_EXCEEDED',
                severity: Severity.BLOCKER,
                message: 'Aflatoxin B1 exceeds EU MRL of 2.0 μg/kg'
            }
        }
    },

    'SESAME_PESTICIDE_MRL': {
        id: 'SESAME_PESTICIDE_MRL',
        module: 'COMPLIANCE',
        commodityTypes: ['sesame'],
        condition: (s) => {
            const labResults = s.compliance?.labResults;
            // Check for pesticide MRL violations (e.g., Chlorpyrifos)
            return Conditions.commodityIs(s, 'sesame') && labResults?.pesticides?.some(p => p.value > p.limit);
        },
        effect: {
            type: EffectType.FLAG,
            payload: {
                code: 'PESTICIDE_MRL_EXCEEDED',
                severity: Severity.BLOCKER,
                message: 'Pesticide residue exceeds EU maximum residue limit'
            }
        }
    },

    // =====================================================
    // COCOA RULES
    // =====================================================

    'COCOA_LAB_REQUIRED': {
        id: 'COCOA_LAB_REQUIRED',
        module: 'DOCUMENT',
        commodityTypes: ['cocoa'],
        destinationCountries: ['NL', 'DE', 'BE', 'FR', 'IT'],
        condition: (s) => 
            Conditions.commodityIs(s, 'cocoa') && 
            !Conditions.hasDocument(s, 'LAB_REPORT'),
        effect: {
            type: EffectType.FLAG,
            payload: {
                code: 'LAB_REQUIRED',
                severity: Severity.BLOCKER,
                message: 'Lab report required for cocoa exports'
            }
        }
    },

    'COCOA_CADMIUM_LIMIT': {
        id: 'COCOA_CADMIUM_LIMIT',
        module: 'COMPLIANCE',
        commodityTypes: ['cocoa'],
        condition: (s) => {
            const labResults = s.compliance?.labResults;
            // Cadmium limit for cocoa: 0.5 mg/kg (dark chocolate), 0.8 mg/kg (milk chocolate)
            return Conditions.commodityIs(s, 'cocoa') && labResults?.cadmium > 0.5;
        },
        effect: {
            type: EffectType.FLAG,
            payload: {
                code: 'CADMIUM_EXCEEDED',
                severity: Severity.BLOCKER,
                message: 'Cadmium level exceeds EU limit for cocoa products'
            }
        }
    },

    'COCOA_NAFDAC_REQUIRED': {
        id: 'COCOA_NAFDAC_REQUIRED',
        module: 'DOCUMENT',
        commodityTypes: ['cocoa'],
        condition: (s) => 
            Conditions.commodityIs(s, 'cocoa') && 
            !Conditions.hasDocument(s, 'NAFDAC'),
        effect: {
            type: EffectType.FLAG,
            payload: {
                code: 'NAFDAC_REQUIRED',
                severity: Severity.BLOCKER,
                message: 'NAFDAC certificate required for cocoa exports'
            }
        }
    },

    // =====================================================
    // CASHEW RULES
    // =====================================================

    'CASHEW_LAB_REQUIRED': {
        id: 'CASHEW_LAB_REQUIRED',
        module: 'DOCUMENT',
        commodityTypes: ['cashew'],
        condition: (s) => 
            Conditions.commodityIs(s, 'cashew') && 
            !Conditions.hasDocument(s, 'LAB_REPORT'),
        effect: {
            type: EffectType.FLAG,
            payload: {
                code: 'LAB_REQUIRED',
                severity: Severity.BLOCKER,
                message: 'Lab report required for cashew exports'
            }
        }
    },

    'CASHEW_AFLATOXIN_LIMIT': {
        id: 'CASHEW_AFLATOXIN_LIMIT',
        module: 'COMPLIANCE',
        commodityTypes: ['cashew'],
        condition: (s) => {
            const labResults = s.compliance?.labResults;
            return Conditions.commodityIs(s, 'cashew') && labResults?.aflatoxinTotal > 4.0;
        },
        effect: {
            type: EffectType.FLAG,
            payload: {
                code: 'AFLATOXIN_EXCEEDED',
                severity: Severity.BLOCKER,
                message: 'Total aflatoxins exceed EU MRL of 4.0 μg/kg'
            }
        }
    },

    // =====================================================
    // EUDR (EU Deforestation Regulation) RULES
    // =====================================================

    'EUDR_TRACEABILITY_REQUIRED': {
        id: 'EUDR_TRACEABILITY_REQUIRED',
        module: 'COMPLIANCE',
        commodityTypes: ['cocoa', 'sesame', 'cashew', 'coffee', 'palm_oil'],
        destinationCountries: ['NL', 'DE', 'BE', 'FR', 'IT', 'ES', 'PL'],
        condition: (s) => {
            const isEU = Conditions.destinationIs(s, 'NL') || 
                         Conditions.destinationIs(s, 'DE') ||
                         Conditions.destinationIs(s, 'BE') ||
                         Conditions.destinationIs(s, 'FR');
            const hasTraceability = s.compliance?.eudrData?.traceabilityVerified === true;
            return isEU && !hasTraceability;
        },
        effect: {
            type: EffectType.FLAG,
            payload: {
                code: 'EUDR_TRACEABILITY_MISSING',
                severity: Severity.BLOCKER,
                message: 'EUDR traceability data required for EU destination'
            }
        }
    },

    'EUDR_GEOLOCATION_REQUIRED': {
        id: 'EUDR_GEOLOCATION_REQUIRED',
        module: 'COMPLIANCE',
        commodityTypes: ['cocoa', 'sesame', 'cashew', 'coffee', 'palm_oil'],
        condition: (s) => {
            const hasGeo = s.compliance?.eudrData?.geolocation?.length > 0;
            return !hasGeo;
        },
        effect: {
            type: EffectType.FLAG,
            payload: {
                code: 'EUDR_GEOLOCATION_MISSING',
                severity: Severity.BLOCKER,
                message: 'Geolocation data required for EUDR compliance'
            }
        }
    },

    // =====================================================
    // DOCUMENT REQUIREMENT RULES
    // =====================================================

    'COO_REQUIRED_FOR_ALL': {
        id: 'COO_REQUIRED_FOR_ALL',
        module: 'DOCUMENT',
        condition: (s) => !Conditions.hasDocument(s, 'COO'),
        effect: {
            type: EffectType.FLAG,
            payload: {
                code: 'COO_REQUIRED',
                severity: Severity.BLOCKER,
                message: 'Certificate of Origin is required for all exports'
            }
        }
    },

    'PHYTOSANITARY_REQUIRED_VEGETABLE': {
        id: 'PHYTOSANITARY_REQUIRED_VEGETABLE',
        module: 'DOCUMENT',
        commodityTypes: ['sesame', 'cashew', 'ginger', 'groundnuts', 'seeds'],
        condition: (s) => !Conditions.hasDocument(s, 'PHYTOSANITARY'),
        effect: {
            type: EffectType.FLAG,
            payload: {
                code: 'PHYTOSANITARY_REQUIRED',
                severity: Severity.BLOCKER,
                message: 'Phytosanitary certificate required for this commodity'
            }
        }
    },

    // =====================================================
    // ENTITY VERIFICATION RULES
    // =====================================================

    'EXPORTER_VERIFIED': {
        id: 'EXPORTER_VERIFIED',
        module: 'COMPLIANCE',
        condition: (s) => !Conditions.entityVerified(s),
        effect: {
            type: EffectType.FLAG,
            payload: {
                code: 'EXPORTER_NOT_VERIFIED',
                severity: Severity.WARNING,
                message: 'Exporter entity verification recommended'
            }
        }
    },

    // =====================================================
    // DESTINATION-SPECIFIC RULES
    // =====================================================

    'NL_CERTIFICATE_REQUIREMENTS': {
        id: 'NL_CERTIFICATE_REQUIREMENTS',
        module: 'DOCUMENT',
        destinationCountries: ['NL'],
        condition: (s) => {
            if (!Conditions.destinationIs(s, 'NL')) return false;
            // Netherlands requires specific certificates
            const required = ['COO', 'PHYTOSANITARY'];
            const hasAll = required.every(rt => Conditions.hasDocument(s, rt));
            return !hasAll;
        },
        effect: {
            type: EffectType.FLAG,
            payload: {
                code: 'NL_DOCUMENTS_INCOMPLETE',
                severity: Severity.BLOCKER,
                message: 'Missing required documents for Netherlands import'
            }
        }
    },

    // =====================================================
    // FEES CALCULATION RULES
    // =====================================================

    'FEE_MISSING_DOCUMENT_PENALTY': {
        id: 'FEE_MISSING_DOCUMENT_PENALTY',
        module: 'COMPLIANCE',
        condition: (s) => {
            const docs = s.documents || [];
            const missing = docs.filter(d => d.status === 'MISSING').length;
            return missing > 0;
        },
        effect: {
            type: EffectType.REQUIRE_DOCUMENT,
            payload: {
                code: 'DOCUMENT_PENALTY',
                severity: Severity.WARNING,
                message: 'Missing documents may incur additional processing fees'
            }
        }
    }
};

/**
 * Rule Engine - Core evaluation system
 */
class RuleEngine {
    constructor() {
        this.rules = new Map();
        this.loadRules();
    }

    /**
     * Load rules from registry
     */
    loadRules() {
        for (const [id, config] of Object.entries(RULE_REGISTRY)) {
            this.rules.set(id, new Rule(config));
        }
    }

    /**
     * Add a custom rule
     */
    addRule(ruleConfig) {
        const rule = new Rule(ruleConfig);
        this.rules.set(rule.id, rule);
    }

    /**
     * Get all rules for a shipment
     */
    getApplicableRules(shipment) {
        const applicable = [];
        for (const rule of this.rules.values()) {
            // Check if rule applies based on commodity/destination filters
            const commodityMatch = !rule.commodityTypes?.length || 
                rule.commodityTypes.includes(shipment.commodity?.commodity_type);
            const destinationMatch = !rule.destinationCountries?.length ||
                rule.destinationCountries.includes(shipment.destination?.country_code);
            
            if (commodityMatch && destinationMatch) {
                applicable.push(rule);
            }
        }
        return applicable;
    }

    /**
     * Run all applicable rules against a shipment
     * @param {Object} shipment - Full shipment object
     * @returns {Object} - { flags: [], requiredDocs: Set }
     */
    runRules(shipment) {
        const flags = [];
        const requiredDocs = new Set();

        const applicableRules = this.getApplicableRules(shipment);
        
        for (const rule of applicableRules) {
            const effect = rule.evaluate(shipment);
            if (effect) {
                if (effect.type === EffectType.FLAG) {
                    flags.push({
                        ruleId: rule.id,
                        module: rule.module,
                        ...effect.payload
                    });
                } else if (effect.type === EffectType.REQUIRE_DOCUMENT) {
                    if (effect.payload.documentType) {
                        requiredDocs.add(effect.payload.documentType);
                    }
                }
            }
        }

        return { flags, requiredDocs };
    }

    /**
     * Clear previous flags for a shipment
     */
    async clearPreviousFlags(shipmentId) {
        await db.run('DELETE FROM compliance_flags WHERE shipment_id = ?', [shipmentId]);
    }

    /**
     * Save flags to database
     */
    async saveFlags(shipmentId, flags) {
        for (const flag of flags) {
            await db.run(
                `INSERT INTO compliance_flags (id, shipment_id, code, severity, message, module)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [generateId(), shipmentId, flag.code, flag.severity, flag.message, flag.module]
            );
        }
    }

    /**
     * Derive overall compliance status
     */
    deriveComplianceStatus(flags) {
        const hasBlocker = flags.some(f => f.severity === 'BLOCKER');
        const hasWarning = flags.some(f => f.severity === 'WARNING');
        
        if (hasBlocker) return 'BLOCKER';
        if (hasWarning) return 'WARNING';
        if (flags.length > 0) return 'INFO';
        return 'PASS';
    }

    /**
     * Full evaluation pipeline
     */
    async evaluateShipment(shipmentId) {
        // Get full shipment state
        const shipment = await getShipmentFull(shipmentId);
        
        if (!shipment) {
            throw new Error(`Shipment ${shipmentId} not found`);
        }

        // Clear previous flags
        await this.clearPreviousFlags(shipmentId);

        // Run rules
        const { flags, requiredDocs } = this.runRules(shipment);

        // Save new flags
        await this.saveFlags(shipmentId, flags);

        // Get uploaded document types
        const uploadedDocs = (shipment.documents || [])
            .filter(d => d.status === 'VALID')
            .map(d => d.type);

        // Find missing documents
        const missingDocs = [...requiredDocs].filter(
            doc => !uploadedDocs.includes(doc)
        );

        // Derive compliance status
        const complianceStatus = this.deriveComplianceStatus(flags);

        // Determine submission readiness
        const submissionReady = 
            complianceStatus !== 'BLOCKER' && 
            missingDocs.length === 0;

        // Update shipment state
        await db.run(
            `UPDATE shipments 
             SET status = ?, updated_at = datetime('now') 
             WHERE id = ?`,
            [submissionReady ? 'READY' : 'DRAFT', shipmentId]
        );

        // Log evaluation event
        await logAuditEvent(shipmentId, 'RULES_EVALUATED', 'system', 'SYSTEM', {
            flags: flags.length,
            blockers: flags.filter(f => f.severity === 'BLOCKER').length,
            warnings: flags.filter(f => f.severity === 'WARNING').length,
            complianceStatus,
            submissionReady,
            missingDocs
        });

        return {
            shipmentId,
            complianceStatus,
            flags,
            missingDocs,
            submissionReady,
            evaluatedAt: new Date().toISOString()
        };
    }

    /**
     * Get rule by ID
     */
    getRule(ruleId) {
        return this.rules.get(ruleId);
    }

    /**
     * List all rules
     */
    listRules() {
        return Array.from(this.rules.values()).map(r => ({
            id: r.id,
            module: r.module,
            commodityTypes: r.commodityTypes,
            destinationCountries: r.destinationCountries
        }));
    }
}

// Helper to generate UUID
function generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Helper to get full shipment
async function getShipmentFull(shipmentId) {
    const result = await db.get(
        `SELECT json(*) as data FROM shipments WHERE id = ?`,
        [shipmentId]
    );
    // In production, use proper JSON extraction
    // This is a placeholder
    return null;
}

module.exports = {
    RuleEngine,
    Rule,
    EffectType,
    Severity,
    Conditions,
    RULE_REGISTRY
};