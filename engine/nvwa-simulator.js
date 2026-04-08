/**
 * NVWA Simulator - Dutch Food Safety Authority Enforcement Logic
 * 
 * Purpose: Simulate what inspectors actually do
 * 
 * This runs BEFORE ML:
 * - deterministic_engine → nvwa_simulator → XGBoost → Decision Engine
 * 
 * Rule Set:
 * - Hard blocks (SALMONELLA_CHECK, MRL_EXCEEDED, etc.)
 * - Soft warnings
 * - Inspection triggers
 * 
 * Integration: Runs at step 4 of full system flow
 */

const fs = require('fs');
const path = require('path');

// ==================== CONFIGURATION ====================

const config = {
  // NVWA inspection rules version
  version: '2026.1',
  
  // Severity levels
  severity: {
    HARD: 'HARD',       // Block shipment
    SOFT: 'SOFT',       // Warning
    INFO: 'INFO'        // Informational
  },
  
  // Inspection thresholds
  thresholds: {
    salmonella: { max: 0, present: true },
    aflatoxinB1: { max: 0.002, unit: 'mg/kg' },
    totalAflatoxins: { max: 0.004, unit: 'mg/kg' },
    ecoli: { max: 100, unit: 'cfu/g' },
    listeria: { max: 0, present: true }
  }
};

// ==================== RULE SET ====================

const ruleSet = [
  // Microbiological Hazards - HARD blocks
  {
    ruleId: 'SALMONELLA_CHECK',
    name: 'Salmonella Detection',
    condition: 'lab_salmonella_present === true',
    action: 'BLOCK',
    severity: config.severity.HARD,
    message: 'Salmonella detected - shipment blocked for destruction',
    inspectionPriority: 'MANDATORY'
  },
  {
    ruleId: 'LISTERIA_CHECK',
    name: 'Listeria Detection',
    condition: 'lab_listeria_present === true',
    action: 'BLOCK',
    severity: config.severity.HARD,
    message: 'Listeria detected - immediate rejection',
    inspectionPriority: 'MANDATORY'
  },
  {
    ruleId: 'E_COLI_CHECK',
    name: 'E. Coli Count',
    condition: 'lab_ecoli_count > 100',
    action: 'BLOCK',
    severity: config.severity.HARD,
    message: 'E. coli count exceeds limit (100 cfu/g)',
    inspectionPriority: 'MANDATORY'
  },
  
  // Aflatoxin - HARD blocks
  {
    ruleId: 'AFLATOXIN_B1_CHECK',
    name: 'Aflatoxin B1 Limit',
    condition: 'lab_aflatoxin_b1 > 0.002',
    action: 'BLOCK',
    severity: config.severity.HARD,
    message: 'Aflatoxin B1 exceeds EU MRL (0.002 mg/kg)',
    inspectionPriority: 'MANDATORY'
  },
  {
    ruleId: 'TOTAL_AFLATOXINS_CHECK',
    name: 'Total Aflatoxins Limit',
    condition: 'lab_total_aflatoxins > 0.004',
    action: 'BLOCK',
    severity: config.severity.HARD,
    message: 'Total aflatoxins exceed EU MRL (0.004 mg/kg)',
    inspectionPriority: 'MANDATORY'
  },
  
  // Pesticide MRL - HARD blocks
  {
    ruleId: 'CHLORPYRIFOS_CHECK',
    name: 'Chlorpyrifos MRL',
    condition: 'pesticide_chlorpyrifos > 0.01',
    action: 'BLOCK',
    severity: config.severity.HARD,
    message: 'Chlorpyrifos exceeds EU MRL (0.01 mg/kg)',
    inspectionPriority: 'HIGH'
  },
  {
    ruleId: 'CARBOFURAN_CHECK',
    name: 'Carbofuran MRL',
    condition: 'pesticide_carbofuran > 0.01',
    action: 'BLOCK',
    severity: config.severity.HARD,
    message: 'Carbofuran exceeds EU MRL (0.01 mg/kg)',
    inspectionPriority: 'HIGH'
  },
  {
    ruleId: 'DICHLORVOS_CHECK',
    name: 'Dichlorvos MRL',
    condition: 'pesticide_dichlorvos > 0.01',
    action: 'BLOCK',
    severity: config.severity.HARD,
    message: 'Dichlorvos exceeds EU MRL (0.01 mg/kg)',
    inspectionPriority: 'HIGH'
  },
  {
    ruleId: 'PENDIMETHALIN_CHECK',
    name: 'Pendimethalin MRL',
    condition: 'pesticide_pendimethalin > 0.05',
    action: 'BLOCK',
    severity: config.severity.HARD,
    message: 'Pendimethalin exceeds EU MRL (0.05 mg/kg)',
    inspectionPriority: 'HIGH'
  },
  
  // Heavy Metals (Cocoa)
  {
    ruleId: 'CADMIUM_CHECK',
    name: 'Cadmium Limit (Cocoa)',
    condition: 'heavy_metal_cadmium > 0.1',
    action: 'BLOCK',
    severity: config.severity.HARD,
    message: 'Cadmium exceeds EU limit (0.1 mg/kg for cocoa)',
    inspectionPriority: 'MANDATORY'
  },
  {
    ruleId: 'LEAD_CHECK',
    name: 'Lead Limit',
    condition: 'heavy_metal_lead > 0.2',
    action: 'BLOCK',
    severity: config.severity.HARD,
    message: 'Lead exceeds EU limit (0.2 mg/kg)',
    inspectionPriority: 'MANDATORY'
  },
  
  // Documentation - HARD blocks
  {
    ruleId: 'MISSING_PHYTO_CERT',
    name: 'Missing Phytosanitary Certificate',
    condition: '!documents.includes("phytosanitary_certificate")',
    action: 'BLOCK',
    severity: config.severity.HARD,
    message: 'Phytosanitary certificate required',
    inspectionPriority: 'MANDATORY'
  },
  {
    ruleId: 'MISSING_ORIGIN_CERT',
    name: 'Missing Certificate of Origin',
    condition: '!documents.includes("certificate_of_origin")',
    action: 'BLOCK',
    severity: config.severity.HARD,
    message: 'Certificate of origin required',
    inspectionPriority: 'MANDATORY'
  },
  {
    ruleId: 'MISSING_LAB_REPORT',
    name: 'Missing Laboratory Test Report',
    condition: '!documents.includes("laboratory_test_report")',
    action: 'REQUIRE_INSPECTION',
    severity: config.severity.SOFT,
    message: 'Laboratory test report required for clearance',
    inspectionPriority: 'HIGH'
  },
  
  // Traceability - HARD blocks
  {
    ruleId: 'INVALID_BATCH',
    name: 'Invalid Batch Number',
    condition: 'batch_id && !traces_valid',
    action: 'BLOCK',
    severity: config.severity.HARD,
    message: 'Batch not found in TRACES - suspect shipment',
    inspectionPriority: 'MANDATORY'
  },
  {
    ruleId: 'CERTIFICATE_EXPIRED',
    name: 'Expired Certificate',
    condition: 'certificate_status === "EXPIRED"',
    action: 'BLOCK',
    severity: config.severity.HARD,
    message: 'Phytosanitary certificate expired',
    inspectionPriority: 'MANDATORY'
  },
  
  // Soft rules - Warnings
  {
    ruleId: 'HIGH_MOISTURE',
    name: 'High Moisture Content',
    condition: 'moisture_content > 12',
    action: 'REQUIRE_DRYING',
    severity: config.severity.SOFT,
    message: 'Moisture content too high - requires drying before entry',
    inspectionPriority: 'MEDIUM'
  },
  {
    ruleId: 'FOREIGN_MATTER',
    name: 'Foreign Matter Detected',
    condition: 'foreign_matter_present === true',
    action: 'REQUIRE_INSPECTION',
    severity: config.severity.SOFT,
    message: 'Foreign matter detected - physical inspection required',
    inspectionPriority: 'MEDIUM'
  },
  {
    ruleId: 'DAMAGED_PACKAGING',
    name: 'Damaged Packaging',
    condition: 'packaging_damaged === true',
    action: 'REQUIRE_INSPECTION',
    severity: config.severity.SOFT,
    message: 'Packaging damage - inspection required',
    inspectionPriority: 'LOW'
  },
  
  // Risk-based inspection triggers
  {
    ruleId: 'FIRST_SHIPMENT',
    name: 'First Shipment from Exporter',
    condition: 'exporter_shipment_count <= 1',
    action: 'REQUIRE_INSPECTION',
    severity: config.severity.SOFT,
    message: 'First shipment from exporter - enhanced inspection',
    inspectionPriority: 'MEDIUM'
  },
  {
    ruleId: 'HIGH_RISK_PRODUCT',
    name: 'High Risk Product',
    condition: 'product_type in ["sesame", "groundnuts", "peanuts"]',
    action: 'REQUIRE_INSPECTION',
    severity: config.severity.SOFT,
    message: 'High-risk product category - enhanced inspection',
    inspectionPriority: 'MEDIUM'
  },
  {
    ruleId: 'HIGH_RISK_ORIGIN',
    name: 'High Risk Origin',
    condition: 'origin_country === "Nigeria"',
    action: 'REQUIRE_INSPECTION',
    severity: config.severity.SOFT,
    message: 'High-risk origin - enhanced inspection',
    inspectionPriority: 'MEDIUM'
  },
  {
    ruleId: 'HIGH_RISK_PORT',
    name: 'High Risk Destination Port',
    condition: 'destination_port in ["Rotterdam", "Hamburg", "Antwerp"]',
    action: 'ENHANCED_MONITORING',
    severity: config.severity.INFO,
    message: 'High-traffic port - standard monitoring',
    inspectionPriority: 'LOW'
  }
];

// ==================== CORE FUNCTIONS ====================

/**
 * Initialize NVWA Simulator
 */
function initialize() {
  console.log(`NVWA Simulator v${config.version} initializing...`);
  console.log(`Loaded ${ruleSet.length} enforcement rules`);
  return true;
}

/**
 * Evaluate all rules against shipment
 * Integration point: Runs BEFORE ML
 */
function evaluate(shipmentData) {
  const results = {
    blocked: false,
    blocks: [],
    warnings: [],
    inspectionRequired: false,
    inspectionTriggers: [],
    passed: [],
    rulesTriggered: [],
    enforcementActions: [],
    finalDecision: 'CLEAR'
  };
  
  // Evaluate each rule
  for (const rule of ruleSet) {
    const triggerResult = evaluateRule(rule, shipmentData);
    
    if (triggerResult.triggered) {
      results.rulesTriggered.push({
        ruleId: rule.ruleId,
        name: rule.name,
        severity: rule.severity,
        message: triggerResult.message
      });
      
      switch (rule.action) {
        case 'BLOCK':
          results.blocked = true;
          results.blocks.push({
            ruleId: rule.ruleId,
            message: triggerResult.message,
            severity: rule.severity
          });
          results.enforcementActions.push({
            action: 'BLOCK_SHIPMENT',
            reason: rule.ruleId,
            message: triggerResult.message
          });
          break;
          
        case 'REQUIRE_INSPECTION':
          results.inspectionRequired = true;
          results.inspectionTriggers.push({
            ruleId: rule.ruleId,
            message: triggerResult.message,
            priority: rule.inspectionPriority
          });
          results.enforcementActions.push({
            action: 'REQUIRE_INSPECTION',
            reason: rule.ruleId,
            message: triggerResult.message
          });
          break;
          
        case 'REQUIRE_DRYING':
          results.warnings.push({
            ruleId: rule.ruleId,
            message: triggerResult.message
          });
          results.enforcementActions.push({
            action: 'REQUIRE_DRYING',
            reason: rule.ruleId,
            message: triggerResult.message
          });
          break;
          
        case 'ENHANCED_MONITORING':
          results.warnings.push({
            ruleId: rule.ruleId,
            message: triggerResult.message
          });
          results.enforcementActions.push({
            action: 'ENHANCED_MONITORING',
            reason: rule.ruleId
          });
          break;
      }
    } else {
      results.passed.push(rule.ruleId);
    }
  }
  
  // Determine final decision
  if (results.blocked) {
    results.finalDecision = 'BLOCK';
  } else if (results.inspectionRequired) {
    results.finalDecision = 'INSPECT_THEN_CLEAR';
  } else if (results.warnings.length > 0) {
    results.finalDecision = 'CONDITIONAL_CLEAR';
  } else {
    results.finalDecision = 'CLEAR';
  }
  
  return results;
}

/**
 * Evaluate single rule against shipment
 */
function evaluateRule(rule, shipmentData) {
  const condition = rule.condition;
  let triggered = false;
  let message = rule.message;
  
  try {
    // Parse and evaluate condition
    // Create evaluation context
    const context = createEvaluationContext(shipmentData);
    
    // Simple condition evaluation (for MVP)
    // In production, would use a proper expression parser
    triggered = evaluateCondition(condition, context);
    
  } catch (error) {
    console.error(`Error evaluating rule ${rule.ruleId}:`, error.message);
    triggered = false;
  }
  
  return { triggered, message };
}

/**
 * Create evaluation context from shipment data
 */
function createEvaluationContext(shipmentData) {
  const ctx = {
    // Lab results
    lab_salmonella_present: shipmentData.lab_salmonella_present || false,
    lab_listeria_present: shipmentData.lab_listeria_present || false,
    lab_ecoli_count: shipmentData.lab_ecoli_count || 0,
    lab_aflatoxin_b1: shipmentData.lab_aflatoxin_b1 || shipmentData.lab_aflatoxin_total || 0,
    lab_total_aflatoxins: shipmentData.lab_total_aflatoxins || shipmentData.lab_aflatoxin_total || 0,
    
    // Pesticides
    pesticide_chlorpyrifos: shipmentData.lab_pesticide_chlorpyrifos || 0,
    pesticide_carbofuran: shipmentData.lab_pesticide_carbofuran || 0,
    pesticide_dichlorvos: shipmentData.lab_pesticide_dichlorvos || 0,
    pesticide_pendimethalin: shipmentData.lab_pesticide_pendimethalin || 0,
    
    // Other pesticides from lab results
    ...shipmentData.labResults?.pesticides?.reduce((acc, p) => {
      acc[`pesticide_${p.name.toLowerCase()}`] = p.value;
      return acc;
    }, {}),
    
    // Heavy metals
    heavy_metal_cadmium: shipmentData.lab_cadmium || 0,
    heavy_metal_lead: shipmentData.lab_lead || 0,
    
    // Documents
    documents: shipmentData.documents || [],
    
    // Product info
    product_type: shipmentData.product?.toLowerCase() || '',
    origin_country: shipmentData.origin_country || shipmentData.origin || '',
    destination_port: shipmentData.destination_port || shipmentData.port || '',
    
    // Traceability
    batch_id: shipmentData.batch_id || shipmentData.batchNumber || '',
    traces_valid: shipmentData.traces_valid !== false,
    certificate_status: shipmentData.certificate_status || 'VALID',
    
    // Other
    moisture_content: shipmentData.moisture_content || shipmentData.moistureContent || 0,
    foreign_matter_present: shipmentData.foreign_matter_present || false,
    packaging_damaged: shipmentData.packaging_damaged || false,
    
    // Exporter history
    exporter_shipment_count: shipmentData.exporter_shipment_count || 0
  };
  
  return ctx;
}

/**
 * Evaluate condition string against context
 * Simplified for MVP - in production use proper expression parser
 */
function evaluateCondition(condition, context) {
  // Handle simple comparisons
  if (condition.includes('===')) {
    const [field, value] = condition.split('===').map(s => s.trim());
    const fieldValue = context[field];
    const compareValue = value === 'true' ? true : value === 'false' ? false : 
                         value === 'null' ? null : value.replace(/['"]/g, '');
    return fieldValue === compareValue;
  }
  
  if (condition.includes('==')) {
    const [field, value] = condition.split('==').map(s => s.trim());
    const fieldValue = context[field];
    const compareValue = value === 'true' ? true : value === 'false' ? false : 
                         value === 'null' ? null : value.replace(/['"]/g, '');
    return fieldValue == compareValue;
  }
  
  if (condition.includes('>')) {
    const parts = condition.split('>').map(s => s.trim());
    const field = parts[0];
    const value = parseFloat(parts[1]);
    const fieldValue = context[field];
    return fieldValue > value;
  }
  
  if (condition.includes('<')) {
    const parts = condition.split('<').map(s => s.trim());
    const field = parts[0];
    const value = parseFloat(parts[1]);
    const fieldValue = context[field];
    return fieldValue < value;
  }
  
  if (condition.includes('!')) {
    const negCondition = condition.replace('!', '').trim();
    return !evaluateCondition(negCondition, context);
  }
  
  if (condition.includes(' in ')) {
    const [field, listStr] = condition.split(' in ').map(s => s.trim());
    const list = listStr.replace('[', '').replace(']', '').split(',').map(s => s.trim().replace(/['"]/g, ''));
    const fieldValue = context[field];
    return list.includes(fieldValue);
  }
  
  return false;
}

/**
 * Get rules by severity
 */
function getRulesBySeverity(severity) {
  return ruleSet.filter(r => r.severity === severity);
}

/**
 * Get all rules
 */
function getAllRules() {
  return ruleSet;
}

/**
 * Get rule by ID
 */
function getRuleById(ruleId) {
  return ruleSet.find(r => r.ruleId === ruleId);
}

/**
 * Get configuration
 */
function getConfig() {
  return {
    version: config.version,
    ruleCount: ruleSet.length,
    hardRules: ruleSet.filter(r => r.severity === config.severity.HARD).length,
    softRules: ruleSet.filter(r => r.severity === config.severity.SOFT).length,
    thresholds: config.thresholds
  };
}

// Initialize on load
initialize();

module.exports = {
  initialize,
  evaluate,
  evaluateRule,
  getRulesBySeverity,
  getAllRules,
  getRuleById,
  getConfig
};
