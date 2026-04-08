/**
 * Culbridge Compliance Engine
 * 
 * CRITICAL INFRASTRUCTURE - Deterministic gatekeeper
 * 
 * Evaluates truth of shipment against rules:
 * - Substance Rules (banned substances, MRLs)
 * - Document Rules (required certificates)
 * - Country Rules (destination-specific restrictions)
 * 
 * NO probabilistic output - NO "warning-only" pass
 * If rule violated → FAIL → BLOCK PIPELINE
 */

const { db } = require('../utils/db');

// Data source references (would connect to real APIs in production)
const DATA_SOURCES = {
  EFSA: 'European Food Safety Authority - MRLs',
  EURLEX: 'EUR-Lex - EU Regulations',
  RASFF: 'Rapid Alert System for Food & Feed',
  CODEX: 'Codex Alimentarius - International Standards'
};

// Maximum Residue Limits (MRLs) - mg/kg
// These are fetched from EFSA in production
const MRL_DATABASE = {
  'cocoa': {
    'Aflatoxin B1': 0.002,      // Very strict for cocoa
    'Aflatoxin Total': 0.004,
    'Ochratoxin A': 0.015,
    'Cadmium': 0.5,
    'Lead': 0.1
  },
  'sesame': {
    'Aflatoxin B1': 0.002,
    'Aflatoxin Total': 0.004,
    'Salmonella': 0,  // Zero tolerance
  },
  'cashew': {
    'Aflatoxin B1': 0.002,
    'Aflatoxin Total': 0.004,
  },
  'ginger': {
    'Aflatoxin B1': 0.005,
    'Chlorpyrifos': 0.01,
    'Carbendazim': 0.1
  },
  'groundnuts': {
    'Aflatoxin B1': 0.002,
    'Aflatoxin Total': 0.004,
    'Aflatoxin B1 + B2 + G1 + G2': 0.004
  }
};

// Banned substances (zero tolerance)
const BANNED_SUBSTANCES = [
  'Dichlorvos',
  'Dimethoate',
  'Monocrotophos',
  'Endosulfan',
  'Lindane',
  'Dieldrin',
  'Aldrin'
];

// Country-specific restrictions
const DESTINATION_RULES = {
  'EU': {
    requires_eudr: true,  // EU Deforestation Regulation
    requires_health_cert: true,
    max_cadmium_cocoa: 0.5,  // mg/kg
    prohibited_substances: BANNED_SUBSTANCES
  },
  'NL': {
    requires_eudr: true,
    requires_health_cert: true,
    special_requirements: ['Dutch NVWA notification']
  },
  'DE': {
    requires_eudr: true,
    requires_health_cert: true,
    special_requirements: ['German customs declaration']
  },
  'UK': {
    requires_health_cert: true,
    post_brexit_rules: true
  }
};

class ComplianceEngine {
  
  /**
   * Evaluate shipment compliance
   * 
   * @param {string} shipmentId - Shipment ID
   * @returns {Object} - Compliance result
   */
  async evaluate(shipmentId) {
    // Get shipment data
    const shipment = await db.get(
      `SELECT s.*, 
              l.aflatoxin_b1, l.aflatoxin_total, l.ochratoxin_a, 
              l.pesticides, l.cadmium, l.lead
       FROM Shipments s
       LEFT JOIN LabResults l ON s.id = l.shipment_id
       WHERE s.id = ?`,
      [shipmentId]
    );
    
    if (!shipment) {
      throw new Error(`Shipment ${shipmentId} not found`);
    }
    
    const violations = [];
    const warnings = [];
    const checkedRules = [];
    
    const product = (shipment.product || shipment.category || '').toLowerCase();
    const destination = (shipment.destination || '').toUpperCase();
    
    // 1. SUBSTANCE RULES - Check lab results against MRLs
    const substanceResult = this.checkSubstanceRules(product, shipment);
    violations.push(...substanceResult.violations);
    checkedRules.push(...substanceResult.checked);
    
    // 2. BANNED SUBSTANCES - Zero tolerance check
    const bannedResult = this.checkBannedSubstances(product, shipment);
    violations.push(...bannedResult.violations);
    checkedRules.push(...bannedResult.checked);
    
    // 3. COUNTRY RULES - Destination-specific
    const countryResult = this.checkCountryRules(destination, shipment);
    violations.push(...countryResult.violations);
    warnings.push(...countryResult.warnings);
    checkedRules.push(...countryResult.checked);
    
    // 4. DOCUMENT RULES - Required certificates
    const documentResult = await this.checkDocumentRules(shipmentId, product, destination);
    if (!documentResult.complete) {
      violations.push(...documentResult.violations);
    }
    checkedRules.push(...documentResult.checked);
    
    // 5. HS CODE RULES - Structural correctness
    const hsResult = await this.checkHSCodeRules(shipmentId, product);
    if (!hsResult.valid) {
      violations.push(...hsResult.violations);
    }
    checkedRules.push(...hsResult.checked);
    
    // Determine final status
    const isCompliant = violations.length === 0;
    
    const result = {
      shipment_id: shipmentId,
      status: isCompliant ? 'COMPLIANT' : 'NON_COMPLIANT',
      violations: violations,
      warnings: warnings,
      checked_rules: checkedRules,
      evaluated_at: new Date().toISOString(),
      rules_version: '2026.1'
    };
    
    // Store result in database
    await db.run(
      `INSERT OR REPLACE INTO ComplianceResults 
       (compliance_id, shipment_id, status, violations, required_documents, checked_at, rules_version)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        `COMP-${Date.now()}`,
        shipmentId,
        result.status,
        JSON.stringify(result.violations),
        JSON.stringify(documentResult.required_documents),
        result.evaluated_at,
        result.rules_version
      ]
    );
    
    return result;
  }
  
  /**
   * Check substance rules (MRLs)
   */
  checkSubstanceRules(product, shipment) {
    const violations = [];
    const checked = [];
    const mrlRules = MRL_DATABASE[product] || {};
    
    for (const [substance, mrl] of Object.entries(mrlRules)) {
      checked.push({
        rule: `MRL_${substance}`,
        substance,
        limit: mrl,
        source: DATA_SOURCES.EFSA
      });
      
      // Get actual value from lab results
      const actualValue = this.getLabValue(shipment, substance);
      
      if (actualValue !== null && actualValue > mrl) {
        violations.push({
          type: 'MRL_EXCEEDED',
          substance,
          limit: mrl,
          actual: actualValue,
          unit: 'mg/kg',
          source: DATA_SOURCES.EFSA,
          severity: actualValue > mrl * 10 ? 'CRITICAL' : 'HIGH'
        });
      }
    }
    
    return { violations, checked };
  }
  
  /**
   * Check for banned substances (zero tolerance)
   */
  checkBannedSubstances(product, shipment) {
    const violations = [];
    const checked = [];
    
    // Check lab results for banned substances
    const pesticides = shipment.pesticides ? JSON.parse(shipment.pesticides) : [];
    
    for (const banned of BANNED_SUBSTANCES) {
      checked.push({
        rule: `BANNED_${banned}`,
        substance: banned,
        limit: 0,
        source: 'EU Regulation'
      });
      
      // Check if any detected pesticide matches banned substance
      const detected = pesticides.find(p => 
        p.name.toLowerCase().includes(banned.toLowerCase())
      );
      
      if (detected && detected.value > 0) {
        violations.push({
          type: 'BANNED_SUBSTANCE',
          substance: banned,
          detected_value: detected.value,
          limit: 0,
          unit: 'mg/kg',
          source: 'EU Regulation',
          severity: 'CRITICAL'
        });
      }
    }
    
    return { violations, checked };
  }
  
  /**
   * Check country-specific rules
   */
  checkCountryRules(destination, shipment) {
    const violations = [];
    const warnings = [];
    const checked = [];
    
    const rules = DESTINATION_RULES[destination] || DESTINATION_RULES['EU'];  // Default to EU rules
    
    // EUDR check for EU destinations
    if (rules.requires_eudr) {
      checked.push({
        rule: 'EUDR_COMPLIANCE',
        destination,
        source: DATA_SOURCES.EURLEX
      });
      
      if (!shipment.eudr_compliant) {
        violations.push({
          type: 'EUDR_NON_COMPLIANT',
          requirement: 'EU Deforestation Regulation',
          destination,
          severity: 'HIGH'
        });
      }
    }
    
    // Special requirements
    if (rules.special_requirements) {
      for (const req of rules.special_requirements) {
        warnings.push({
          type: 'SPECIAL_REQUIREMENT',
          requirement: req,
          destination
        });
      }
    }
    
    return { violations, warnings, checked };
  }
  
  /**
   * Check document rules
   */
  async checkDocumentRules(shipmentId, product, destination) {
    const violations = [];
    const checked = [];
    const required_documents = [];
    
    // Base requirements
    const baseDocs = ['certificate_of_origin', 'invoice', 'packing_list'];
    
    // Product-specific
    const productDocs = {
      'cocoa': ['phytosanitary', 'lab_report', 'nafdac'],
      'sesame': ['phytosanitary', 'lab_report', 'nafdac'],
      'cashew': ['phytosanitary', 'lab_report', 'nafdac'],
      'ginger': ['phytosanitary', 'lab_report', 'nafdac'],
      'groundnuts': ['phytosanitary', 'lab_report', 'nafdac']
    };
    
    // Destination-specific
    const destDocs = {
      'EU': ['health_certificate'],
      'NL': ['health_certificate'],
      'DE': ['health_certificate']
    };
    
    // Combine
    const allRequired = [
      ...baseDocs,
      ...(productDocs[product] || []),
      ...(destDocs[destination] || [])
    ];
    
    // Check which are present
    const uploaded = await db.all(
      `SELECT doc_type, status FROM ShipmentDocuments WHERE shipment_id = ?`,
      [shipmentId]
    );
    
    const uploadedTypes = uploaded.map(d => d.doc_type);
    
    for (const docType of allRequired) {
      checked.push({
        rule: `DOC_${docType.toUpperCase()}`,
        document_type: docType,
        required: true
      });
      
      required_documents.push(docType);
      
      if (!uploadedTypes.includes(docType)) {
        violations.push({
          type: 'MISSING_DOCUMENT',
          document_type: docType,
          severity: 'HIGH'
        });
      }
    }
    
    return {
      complete: violations.length === 0,
      violations,
      checked,
      required_documents
    };
  }
  
  /**
   * Check HS code rules
   */
  async checkHSCodeRules(shipmentId, product) {
    const violations = [];
    const checked = [];
    
    const shipment = await db.get(
      'SELECT hs_code, product FROM Shipments WHERE id = ?',
      [shipmentId]
    );
    
    // Validate HS code format
    if (!shipment.hs_code) {
      violations.push({
        type: 'MISSING_HS_CODE',
        severity: 'CRITICAL'
      });
      checked.push({ rule: 'HS_CODE_PRESENT', valid: false });
      return { valid: false, violations, checked };
    }
    
    // Check HS code matches product category
    const hsToProduct = {
      '1801': 'cocoa',
      '1207': ['sesame', 'groundnuts'],
      '0801': 'cashew',
      '0910': 'ginger'
    };
    
    const prefix = shipment.hs_code.substring(0, 4);
    const expectedProduct = hsToProduct[prefix];
    
    if (expectedProduct) {
      const matches = Array.isArray(expectedProduct) 
        ? expectedProduct.includes(product)
        : expectedProduct === product;
      
      checked.push({
        rule: 'HS_CODE_PRODUCT_MATCH',
        hs_code: shipment.hs_code,
        product,
        valid: matches
      });
      
      if (!matches) {
        violations.push({
          type: 'HS_CODE_MISMATCH',
          hs_code: shipment.hs_code,
          product,
          expected: expectedProduct,
          severity: 'HIGH'
        });
      }
    }
    
    return {
      valid: violations.length === 0,
      violations,
      checked
    };
  }
  
  /**
   * Get lab value from shipment
   */
  getLabValue(shipment, substance) {
    const substanceMap = {
      'Aflatoxin B1': 'aflatoxin_b1',
      'Aflatoxin Total': 'aflatoxin_total',
      'Ochratoxin A': 'ochratoxin_a',
      'Cadmium': 'cadmium',
      'Lead': 'lead'
    };
    
    const field = substanceMap[substance];
    return field && shipment[field] !== null ? parseFloat(shipment[field]) : null;
  }
  
  /**
   * Quick compliance check - used for fast validation
   */
  async quickCheck(shipmentId) {
    const result = await this.evaluate(shipmentId);
    return {
      compliant: result.status === 'COMPLIANT',
      violation_count: result.violations.length,
      critical_count: result.violations.filter(v => v.severity === 'CRITICAL').length
    };
  }
}

/**
 * API Handlers
 */

// POST /v1/shipments/:shipment_id/compliance/evaluate
// Full compliance evaluation
async function evaluateCompliance(req, res) {
  try {
    const { shipment_id } = req.params;
    const engine = new ComplianceEngine();
    
    const result = await engine.evaluate(shipment_id);
    
    res.json(result);
  } catch (error) {
    console.error('Compliance evaluation error:', error);
    res.status(500).json({ error: error.message });
  }
}

// GET /v1/shipments/:shipment_id/compliance/status
// Quick compliance status check
async function getComplianceStatus(req, res) {
  try {
    const { shipment_id } = req.params;
    const engine = new ComplianceEngine();
    
    const status = await engine.quickCheck(shipment_id);
    
    res.json({
      shipment_id,
      ...status
    });
  } catch (error) {
    console.error('Compliance status error:', error);
    res.status(500).json({ error: error.message });
  }
}

// GET /v1/rules/substances
// Get MRL database for reference
async function getSubstanceRules(req, res) {
  res.json({
    data_sources: DATA_SOURCES,
    mrl_database: MRL_DATABASE,
    banned_substances: BANNED_SUBSTANCES,
    last_updated: '2026-03-01'
  });
}

module.exports = {
  ComplianceEngine,
  evaluateCompliance,
  getComplianceStatus,
  getSubstanceRules,
  MRL_DATABASE,
  BANNED_SUBSTANCES
};

if (require.main === module) {
  console.log('Compliance Engine loaded');
  console.log('Data sources:', Object.values(DATA_SOURCES).join(', '));
}