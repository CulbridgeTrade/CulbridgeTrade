/**
 * Dynamic Product-Corridor Mapping Engine
 * 
 * REPLACES hard-coded corridors/products with database-driven configuration.
 * Enables engine to scale to new commodities/corridors without code changes.
 */

const db = require('../utils/db');
const fs = require('fs');
const path = require('path');

/**
 * Load mappings from DB (fallback to JSON)
 */


/**
 * Product-Corridor Mapping Type
 */
const ProductCorridorMapping = {
  productCategory: 'string',      // e.g., 'sesame', 'cocoa', 'cashew', 'ginger'
  corridorId: 'string',          // e.g., 'NG-NL', 'NG-DE', 'NG-BE'
  requiredLabTests: 'string[]',  // canonical substance IDs
  requiredDocuments: 'string[]', // document types
  thresholds: 'Record<string, number>', // hazard -> max allowed
  mrlLimits: 'Record<string, number>',   // EU MRL limits by substance
  version: 'string',             // version for audit
  validFrom: 'string',          // ISO date
  validTo: 'string'             // ISO date, null = current
};

/**
 * Load mappings from file (or database in production)
 */
async function loadMappings() {
  try {
    const rows = await db.all(`
      SELECT * FROM corridor_mappings 
      WHERE (validTo IS NULL OR date('now') <= validTo)
      ORDER BY productCategory, originCountry, destinationCountry
    `);
    
    // Parse JSON fields
    const mappings = rows.map(row => ({
      productCategory: row.productCategory,
      corridorId: `${row.originCountry}-${row.destinationCountry}`,
      requiredLabTests: JSON.parse(row.mandatoryLabTests),
      requiredDocuments: JSON.parse(row.requiredDocuments),
      thresholds: JSON.parse(row.thresholds),
      mrlLimits: JSON.parse(row.mrlLimits),
      version: row.corridorVersion,
      validFrom: row.validFrom,
      validTo: row.validTo
    }));
    
    if (mappings.length > 0) {
      return { version: 'db-v1', mappings };
    }
  } catch (err) {
    console.error('Error loading DB mappings:', err.message);
  }
  
  // Fallback to JSON/default
  try {
    const jsonPath = path.join(__dirname, '../config/dynamic-mappings.json');
    if (fs.existsSync(jsonPath)) {
      return JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    }
  } catch (e) {}
  
  return getDefaultMappings();
}

/**
 * Default mappings (initial data)
 */
function getDefaultMappings() {
  return {
    version: '1.0.0',
    mappings: [
      {
        productCategory: 'sesame',
        corridorId: 'NG-NL',
        requiredLabTests: ['ethylene_oxide', 'aflatoxin_b1', 'aflatoxin_total', 'salmonella'],
        requiredDocuments: ['phytosanitary', 'certificate_of_origin'],
        thresholds: {
          ethylene_oxide: 0.02,
          aflatoxin_b1: 2.0,
          aflatoxin_total: 4.0
        },
        mrlLimits: {
          ethylene_oxide: 0.02,
          aflatoxin_b1: 2.0,
          aflatoxin_total: 4.0,
          salmonella: 0
        },
        version: 'v1',
        validFrom: '2024-01-01',
        validTo: null
      },
      {
        productCategory: 'sesame',
        corridorId: 'NG-DE',
        requiredLabTests: ['ethylene_oxide', 'aflatoxin_b1', 'aflatoxin_total', 'salmonella'],
        requiredDocuments: ['phytosanitary'],
        thresholds: {
          ethylene_oxide: 0.02,
          aflatoxin_b1: 2.0,
          aflatoxin_total: 8.0
        },
        mrlLimits: {
          ethylene_oxide: 0.02,
          aflatoxin_b1: 2.0,
          aflatoxin_total: 8.0,
          salmonella: 0
        },
        version: 'v1',
        validFrom: '2024-01-01',
        validTo: null
      },
      {
        productCategory: 'cocoa',
        corridorId: 'NG-NL',
        requiredLabTests: ['aflatoxin_b1', 'cadmium', 'lead'],
        requiredDocuments: ['phytosanitary', 'certificate_of_origin', 'nafdac_cert'],
        thresholds: {
          aflatoxin_b1: 5.0,
          cadmium: 0.6,
          lead: 0.5
        },
        mrlLimits: {
          aflatoxin_b1: 5.0,
          cadmium: 0.6,
          lead: 0.5
        },
        version: 'v1',
        validFrom: '2024-01-01',
        validTo: null
      },
      {
        productCategory: 'cashew',
        corridorId: 'NG-DE',
        requiredLabTests: ['aflatoxin_b1', 'aflatoxin_total', 'salmonella'],
        requiredDocuments: ['phytosanitary'],
        thresholds: {
          aflatoxin_b1: 2.0,
          aflatoxin_total: 10.0
        },
        mrlLimits: {
          aflatoxin_b1: 2.0,
          aflatoxin_total: 10.0,
          salmonella: 0
        },
        version: 'v1',
        validFrom: '2024-01-01',
        validTo: null
      },
      {
        productCategory: 'ginger',
        corridorId: 'NG-NL',
        requiredLabTests: ['cadmium', 'lead', 'mercury'],
        requiredDocuments: ['phytosanitary', 'certificate_of_origin'],
        thresholds: {
          cadmium: 0.5,
          lead: 0.3,
          mercury: 0.1
        },
        mrlLimits: {
          cadmium: 0.5,
          lead: 0.3,
          mercury: 0.1
        },
        version: 'v1',
        validFrom: '2024-05-01',
        validTo: null
      }
    ]
  };
}

/**
 * Get mapping for product/corridor
 */
async function getMapping(productCategory, corridorId, date = new Date()) {
  const mappingsData = await loadMappings();
  const mappings = mappingsData.mappings || [];
  
  const match = mappings.find(m => {
    if (m.productCategory !== productCategory) return false;
    if (m.corridorId !== corridorId) return false;
    
    // Check date validity
    const from = new Date(m.validFrom);
    const to = m.validTo ? new Date(m.validTo) : null;
    
    if (date < from) return false;
    if (to && date > to) return false;
    
    return true;
  });
  
  return match || null;
}


/**
 * Get required lab tests for product/corridor
 */
async function getRequiredLabTests(productCategory, corridorId) {
  const mapping = await getMapping(productCategory, corridorId);
  return mapping?.requiredLabTests || [];
}

/**
 * Get required documents for product/corridor
 */
async function getRequiredDocuments(productCategory, corridorId) {
  const mapping = await getMapping(productCategory, corridorId);
  return mapping?.requiredDocuments || [];
}

/**
 * Get threshold for substance
 */
async function getThreshold(productCategory, corridorId, substanceId) {
  const mapping = await getMapping(productCategory, corridorId);
  return mapping?.thresholds?.[substanceId] || null;
}

/**
 * Get MRL limit for substance
 */
async function getMRLLimit(productCategory, corridorId, substanceId) {
  const mapping = await getMapping(productCategory, corridorId);
  return mapping?.mrlLimits?.[substanceId] || null;
}

/**
 * Validate required lab tests - ALL must be present
 */
async function validateRequiredTests(productCategory, corridorId, labResults) {
  const required = await getRequiredLabTests(productCategory, corridorId);
  
  // Check each required test exists in labResults
  const missing = [];
  for (const test of required) {
    if (labResults[test] === undefined || labResults[test] === null) {
      missing.push(test);
    }
  }
  
  return {
    valid: missing.length === 0,
    missing,
    required
  };
}

/**
 * Check if shipment has all required documents
 */
async function validateRequiredDocuments(productCategory, corridorId, documents) {
  const required = await getRequiredDocuments(productCategory, corridorId);
  const missing = required.filter(doc => !documents[doc]?.present);
  
  return {
    valid: missing.length === 0,
    missing,
    required
  };
}

/**
 * Evaluate shipment against dynamic thresholds
 */
function evaluateAgainstThresholds(productCategory, corridorId, labResults) {
  const mapping = getMapping(productCategory, corridorId);
  if (!mapping) {
    return {
      passed: false,
      blockers: [{ rule: 'UNKNOWN_MAPPING', message: `No mapping for ${productCategory} → ${corridorId}` }]
    };
  }
  
  const blockers = [];
  const warnings = [];
  
  for (const [substance, limit] of Object.entries(mapping.thresholds)) {
    const result = labResults[substance];
    if (result === undefined) continue;
    
    const value = typeof result === 'object' ? result.value : result;
    
    if (limit === 0) {
      // Zero tolerance (e.g., salmonella)
      if (value > 0) {
        blockers.push({
          rule: `${substance.toUpperCase()}_ZERO_TOLERANCE`,
          substance,
          value,
          limit: 0,
          message: `${substance} detected (${value}) but zero tolerance`
        });
      }
    } else if (value > limit) {
      blockers.push({
        rule: `${substance.toUpperCase()}_EXCEEDS_MRL`,
        substance,
        value,
        limit,
        message: `${substance} (${value}) exceeds MRL limit (${limit})`
      });
    }
  }
  
  return {
    passed: blockers.length === 0,
    blockers,
    warnings,
    mappingVersion: mapping.version
  };
}

/**
 * Get all available product categories
 */
function getProductCategories() {
  const mappings = loadMappings();
  const categories = new Set();
  
  for (const m of mappings.mappings) {
    categories.add(m.productCategory);
  }
  
  return Array.from(categories);
}

/**
 * Get all available corridors
 */
function getCorridors() {
  const mappings = loadMappings();
  const corridors = new Set();
  
  for (const m of mappings.mappings) {
    corridors.add(m.corridorId);
  }
  
  return Array.from(corridors);
}

/**
 * Add new mapping (for admin use)
 */
function addMapping(mapping) {
  const mappings = loadMappings();
  mappings.mappings.push(mapping);
  mappings.version = incrementVersion(mappings.version);
  
  fs.writeFileSync(MAPPING_FILE, JSON.stringify(mappings, null, 2));
  return mapping;
}

/**
 * Increment version string
 */
function incrementVersion(version) {
  const parts = version.split('.');
  parts[2] = parseInt(parts[2]) + 1;
  return parts.join('.');
}

// Initialize default mappings if needed
if (!fs.existsSync(MAPPING_FILE)) {
  const defaultData = getDefaultMappings();
  fs.writeFileSync(MAPPING_FILE, JSON.stringify(defaultData, null, 2));
  console.log('Created dynamic-mappings.json with default mappings');
}

module.exports = {
  getMapping,
  getRequiredLabTests,
  getRequiredDocuments,
  getThreshold,
  getMRLLimit,
  validateRequiredTests,
  validateRequiredDocuments,
  evaluateAgainstThresholds,
  getProductCategories,
  getCorridors,
  addMapping,
  loadMappings
};