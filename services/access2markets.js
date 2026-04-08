/**
 * Access2Markets - Compliance Rules Ingestion Service
 * 
 * Purpose: Source of truth for compliance rules:
 * - MRLs (pesticides)
 * - Required certificates
 * - Product restrictions
 * 
 * Integration: Feeds into deterministic_engine.validate()
 * 
 * Data Source: EU Access2Markets database
 * Country Focus: Nigeria (NG) → EU
 */

const fs = require('fs');
const path = require('path');

// ==================== CONFIGURATION ====================

const config = {
  // EU Access2Markets API (simulated for MVP - in production, use real API)
  apiBaseUrl: 'https://ec.europa.eu/access2markets',
  apiKey: process.env.ACCESS2MARKETS_API_KEY || '',
  
  // Country focus
  originCountry: 'NG',  // Nigeria
  destinationCountry: 'EU',
  
  // Product categories (HS codes for commodities)
  productCategories: [
    { hsCode: '120740', name: 'Sesame seeds' },
    { hsCode: '120729', name: 'Groundnuts (peanuts)' },
    { hsCode: '180100', name: 'Cocoa beans' },
    { hsCode: '080131', name: 'Cashew nuts' },
    { hsCode: '120890', name: 'Ginger' }
  ],
  
  // Storage path
  dataPath: path.join(__dirname, '..', 'data', 'compliance_rules.json')
};

// ==================== IN-MEMORY STORAGE ====================

let complianceRules = {
  lastUpdated: null,
  rules: []
};

// ==================== SAMPLE DATA (MVP) ====================

// Real MRL limits from EU regulations for Nigeria exports
const sampleMRules = [
  // Sesame Seeds
  { hsCode: '120740', pesticide: 'chlorpyrifos', mrlLimit: 0.01, unit: 'mg/kg', country: 'NG' },
  { hsCode: '120740', pesticide: 'pendimethalin', mrlLimit: 0.05, unit: 'mg/kg', country: 'NG' },
  { hsCode: '120740', pesticide: 'carbofuran', mrlLimit: 0.02, unit: 'mg/kg', country: 'NG' },
  { hsCode: '120740', pesticide: 'dichlorvos', mrlLimit: 0.01, unit: 'mg/kg', country: 'NG' },
  
  // Groundnuts/Peanuts
  { hsCode: '120729', pesticide: 'aflatoxin_b1', mrlLimit: 0.002, unit: 'mg/kg', country: 'NG' },
  { hsCode: '120729', pesticide: 'total_aflatoxins', mrlLimit: 0.004, unit: 'mg/kg', country: 'NG' },
  { hsCode: '120729', pesticide: 'chlorpyrifos', mrlLimit: 0.05, unit: 'mg/kg', country: 'NG' },
  
  // Cocoa Beans
  { hsCode: '180100', pesticide: 'cadmium', mrlLimit: 0.1, unit: 'mg/kg', country: 'NG' },
  { hsCode: '180100', pesticide: 'lead', mrlLimit: 0.2, unit: 'mg/kg', country: 'NG' },
  { hsCode: '180100', pesticide: 'chlorpyrifos', mrlLimit: 0.02, unit: 'mg/kg', country: 'NG' },
  
  // Cashew Nuts
  { hsCode: '080131', pesticide: 'chlorpyrifos', mrlLimit: 0.01, unit: 'mg/kg', country: 'NG' },
  { hsCode: '080131', pesticide: 'carbofuran', mrlLimit: 0.01, unit: 'mg/kg', country: 'NG' },
  { hsCode: '080131', pesticide: 'dichlorvos', mrlLimit: 0.01, unit: 'mg/kg', country: 'NG' },
  
  // Ginger
  { hsCode: '120890', pesticide: 'chlorpyrifos', mrlLimit: 0.05, unit: 'mg/kg', country: 'NG' },
  { hsCode: '120890', pesticide: 'carbofuran', mrlLimit: 0.02, unit: 'mg/kg', country: 'NG' },
  { hsCode: '120890', pesticide: 'omethoate', mrlLimit: 0.01, unit: 'mg/kg', country: 'NG' }
];

// Required documents by product
const requiredDocuments = {
  '120740': ['phytosanitary_certificate', 'certificate_of_origin', 'laboratory_test_report'],
  '120729': ['phytosanitary_certificate', 'certificate_of_origin', 'aflatoxin_certificate', 'laboratory_test_report'],
  '180100': ['phytosanitary_certificate', 'certificate_of_origin', 'cocoa_quality_certificate'],
  '080131': ['phytosanitary_certificate', 'certificate_of_origin', 'laboratory_test_report'],
  '120890': ['phytosanitary_certificate', 'certificate_of_origin', 'laboratory_test_report']
};

// Special conditions by product
const specialConditions = {
  '120740': {
    maxMoistureContent: 10,
    mustBeHeatTreated: true,
    requiresPreShipmentInspection: true,
    additionalRequirements: 'Must be free from Salmonella'
  },
  '120729': {
    maxAflatoxinB1: 0.002,
    maxTotalAflatoxins: 0.004,
    mustBeHeatTreated: false,
    requiresPreShipmentInspection: true,
    additionalRequirements: 'Aflatoxin testing mandatory'
  },
  '180100': {
    maxCadmium: 0.1,
    maxMoistureContent: 8,
    mustBeHeatTreated: false,
    requiresPreShipmentInspection: false,
    additionalRequirements: 'Cadmium limits strictly enforced'
  },
  '080131': {
    maxMoistureContent: 12,
    mustBeHeatTreated: false,
    requiresPreShipmentInspection: true,
    additionalRequirements: 'No live insects allowed'
  },
  '120890': {
    maxMoistureContent: 10,
    mustBeHeatTreated: false,
    requiresPreShipmentInspection: false,
    additionalRequirements: 'Root must be intact'
  }
};

// ==================== CORE FUNCTIONS ====================

/**
 * Initialize Access2Markets service
 */
async function initialize() {
  console.log('Access2Markets Service initializing...');
  
  // Load rules from storage or initialize with defaults
  await loadRules();
  
  // If no rules, initialize with defaults
  if (complianceRules.rules.length === 0) {
    await initializeDefaultRules();
  }
  
  console.log(`Access2Markets: ${complianceRules.rules.length} rules loaded`);
  return true;
}

/**
 * Load rules from storage
 */
async function loadRules() {
  try {
    if (fs.existsSync(config.dataPath)) {
      const data = fs.readFileSync(config.dataPath, 'utf8');
      complianceRules = JSON.parse(data);
      console.log(`Loaded ${complianceRules.rules.length} rules from storage`);
    }
  } catch (error) {
    console.log('No existing rules found, using defaults');
  }
}

/**
 * Save rules to storage
 */
async function saveRules() {
  try {
    const dataDir = path.dirname(config.dataPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(config.dataPath, JSON.stringify(complianceRules, null, 2));
  } catch (error) {
    console.error('Failed to save rules:', error.message);
  }
}

/**
 * Initialize default rules (for MVP)
 */
async function initializeDefaultRules() {
  const rules = [];
  
  // Create MRL rules
  for (const mrl of sampleMRules) {
    rules.push({
      id: `MRL-${mrl.hsCode}-${mrl.pesticide}`,
      type: 'MRL',
      hsCode: mrl.hsCode,
      productName: getProductName(mrl.hsCode),
      pesticideName: mrl.pesticide,
      mrlLimit: mrl.mrlLimit,
      unit: mrl.unit,
      country: mrl.country,
      requiredDocuments: requiredDocuments[mrl.hsCode] || [],
      specialConditions: specialConditions[mrl.hsCode] || {},
      source: 'Access2Markets',
      lastUpdated: new Date().toISOString()
    });
  }
  
  // Add document requirements as separate rules
  for (const [hsCode, docs] of Object.entries(requiredDocuments)) {
    rules.push({
      id: `DOC-${hsCode}`,
      type: 'DOCUMENT_REQUIREMENT',
      hsCode,
      productName: getProductName(hsCode),
      requiredDocuments: docs,
      source: 'Access2Markets',
      lastUpdated: new Date().toISOString()
    });
  }
  
  // Add special conditions
  for (const [hsCode, conditions] of Object.entries(specialConditions)) {
    rules.push({
      id: `COND-${hsCode}`,
      type: 'SPECIAL_CONDITION',
      hsCode,
      productName: getProductName(hsCode),
      specialConditions: conditions,
      source: 'Access2Markets',
      lastUpdated: new Date().toISOString()
    });
  }
  
  complianceRules = {
    lastUpdated: new Date().toISOString(),
    rules
  };
  
  await saveRules();
}

/**
 * Get product name by HS code
 */
function getProductName(hsCode) {
  const product = config.productCategories.find(p => p.hsCode === hsCode);
  return product ? product.name : 'Unknown';
}

/**
 * Sync rules from Access2Markets API (simulated for MVP)
 * In production, this would call the real API
 */
async function syncFromAPI() {
  console.log('Syncing rules from Access2Markets...');
  
  // Simulated API response
  // In production, would fetch from:
  // GET /api/v1/compliance-rules?origin=NG&destination=EU
  
  const updatedAt = new Date().toISOString();
  complianceRules.lastUpdated = updatedAt;
  
  await saveRules();
  
  return {
    success: true,
    rulesCount: complianceRules.rules.length,
    lastUpdated: updatedAt
  };
}

/**
 * Get rules for specific HS code
 */
function getRulesByHSCode(hsCode) {
  return complianceRules.rules.filter(r => r.hsCode === hsCode);
}

/**
 * Get MRL for specific pesticide and HS code
 */
function getMRL(hsCode, pesticide) {
  const rule = complianceRules.rules.find(r => 
    r.hsCode === hsCode && 
    r.pesticideName === pesticide &&
    r.type === 'MRL'
  );
  
  if (rule) {
    return {
      pesticide: rule.pesticideName,
      mrlLimit: rule.mrlLimit,
      unit: rule.unit
    };
  }
  
  return null;
}

/**
 * Get required documents for HS code
 */
function getRequiredDocuments(hsCode) {
  const rule = complianceRules.rules.find(r => 
    r.hsCode === hsCode && 
    r.type === 'DOCUMENT_REQUIREMENT'
  );
  
  return rule ? rule.requiredDocuments : [];
}

/**
 * Get special conditions for HS code
 */
function getSpecialConditions(hsCode) {
  const rule = complianceRules.rules.find(r => 
    r.hsCode === hsCode && 
    r.type === 'SPECIAL_CONDITION'
  );
  
  return rule ? rule.specialConditions : null;
}

/**
 * Validate shipment against Access2Markets rules
 * Integration point: deterministic_engine.validate()
 */
function validate(shipmentData) {
  const { hsCode, labResults, documents, specialConditions: shipmentConditions } = shipmentData;
  
  const validationResult = {
    passed: true,
    violations: [],
    warnings: [],
    requiredDocuments: getRequiredDocuments(hsCode),
    specialConditions: getSpecialConditions(hsCode)
  };
  
  // Check MRL compliance
  if (labResults && labResults.pesticides) {
    for (const [pesticide, value] of Object.entries(labResults.pesticides)) {
      const mrl = getMRL(hsCode, pesticide);
      if (mrl && value > mrl.mrlLimit) {
        validationResult.passed = false;
        validationResult.violations.push({
          type: 'MRL_EXCEEDED',
          pesticide,
          found: value,
          limit: mrl.mrlLimit,
          unit: mrl.unit,
          severity: 'HARD'
        });
      }
    }
  }
  
  // Check required documents
  if (documents) {
    const missingDocs = validationResult.requiredDocuments.filter(
      doc => !documents.includes(doc)
    );
    
    if (missingDocs.length > 0) {
      validationResult.passed = false;
      validationResult.violations.push({
        type: 'MISSING_DOCUMENTS',
        missing: missingDocs,
        severity: 'HARD'
      });
    }
  }
  
  // Check special conditions
  if (shipmentConditions) {
    const conditions = getSpecialConditions(hsCode);
    if (conditions) {
      if (conditions.maxAflatoxinB1 && labResults.aflatoxinB1 > conditions.maxAflatoxinB1) {
        validationResult.passed = false;
        validationResult.violations.push({
          type: 'AFLATOXIN_EXCEEDED',
          found: labResults.aflatoxinB1,
          limit: conditions.maxAflatoxinB1,
          severity: 'HARD'
        });
      }
      
      if (conditions.maxTotalAflatoxins && labResults.totalAflatoxins > conditions.maxTotalAflatoxins) {
        validationResult.passed = false;
        validationResult.violations.push({
          type: 'TOTAL_AFLATOXINS_EXCEEDED',
          found: labResults.totalAflatoxins,
          limit: conditions.maxTotalAflatoxins,
          severity: 'HARD'
        });
      }
      
      if (conditions.maxMoistureContent && shipmentConditions.moistureContent > conditions.maxMoistureContent) {
        validationResult.warnings.push({
          type: 'MOISTURE_HIGH',
          found: shipmentConditions.moistureContent,
          limit: conditions.maxMoistureContent
        });
      }
      
      if (conditions.requiresPreShipmentInspection && !shipmentConditions.preShipmentInspection) {
        validationResult.warnings.push({
          type: 'PRE_SHIPMENT_INSPECTION_REQUIRED'
        });
      }
    }
  }
  
  return validationResult;
}

/**
 * Get all rules
 */
function getAllRules() {
  return complianceRules.rules;
}

/**
 * Get configuration
 */
function getConfig() {
  return {
    originCountry: config.originCountry,
    destinationCountry: config.destinationCountry,
    productCategories: config.productCategories,
    lastUpdated: complianceRules.lastUpdated
  };
}

// Initialize on load
initialize().catch(console.error);

module.exports = {
  initialize,
  syncFromAPI,
  getRulesByHSCode,
  getMRL,
  getRequiredDocuments,
  getSpecialConditions,
  validate,
  getAllRules,
  getConfig
};
