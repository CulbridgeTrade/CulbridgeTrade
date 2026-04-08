/**
 * HS Resolution Engine
 * 
 * Replaces simple HS code lookup with full tariff tree resolution.
 * Supports:
 * - Full HS tariff dataset (chapter/heading/subheading)
 * - Country-specific mapping (EU vs Nigeria)
 * - Product-to-code candidate ranking
 * - Confidence threshold enforcement
 * - Manual override logging
 */

const fs = require('fs');
const path = require('path');

// Full HS Tariff Tree (abbreviated - in production would load from database)
const HS_TARIFF_TREE = {
  // Chapter 1: Live animals
  '01': { description: 'Live animals', headings: {} },
  
  // Chapter 2: Meat
  '02': { description: 'Meat and edible meat offal', headings: {} },
  
  // Chapter 9: Coffee, tea, mate and spices
  '09': {
    description: 'Coffee, tea, mate and spices',
    headings: {
      '10': { description: 'Coffee', subheadings: {} },
      '01': { description: 'Ginger', subheadings: { '0': { description: 'Neither crushed nor ground', code: '09101010' } } }
    }
  },
  
  // Chapter 12: Oil seeds
  '12': {
    description: 'Oil seeds and misc. grains',
    headings: {
      '07': {
        description: 'Sunflower seeds, safflower or cotton seeds',
        subheadings: {}
      },
      '08': {
        description: 'Linseed',
        subheadings: {}
      },
      '07': {
        description: 'Sesame seeds',
        subheadings: {
          '40': { description: 'Sesame seeds, whether or not broken', code: '12074000' },
          '10': { description: 'Sesame seeds for sowing', code: '12073010' },
          '90': { description: 'Other sesame seeds', code: '12073090' }
        }
      }
    }
  },
  
  // Chapter 18: Cocoa
  '18': {
    description: 'Cocoa and cocoa preparations',
    headings: {
      '01': { description: 'Cocoa beans', subheadings: { '00': { description: 'Cocoa beans, whole or broken, raw or roasted', code: '18010000' } } },
      '02': { description: 'Cocoa shells, husks, skins', subheadings: {} },
      '03': { description: 'Cocoa paste', subheadings: { '00': { description: 'Cocoa paste (including defatted)', code: '18030000' } } },
      '04': { description: 'Cocoa butter, fat and oil', subheadings: {} },
      '05': { description: 'Cocoa powder, without added sugar', subhandlings: {} }
    }
  },
  
  // Chapter 20: Preparations of vegetables/fruits
  '20': { description: 'Preparations of vegetables, fruits, nuts', headings: {} },
  
  // Chapter 90: Optical/medical instruments
  '90': { description: 'Optical, photographic, medical instruments', headings: {} },
  
  // Chapter 84: Machinery (invalid for agro-export)
  '84': {
    description: 'Nuclear reactors, boilers, machinery',
    headings: {
      '81': { description: 'Taps, cocks, valves', subheadings: {} }
    }
  }
};

// Country-specific HS rules
const COUNTRY_HS_RULES = {
  'NL': {
    // Netherlands uses EU Combined Nomenclature
    preferEU: true,
    additionalRequirements: ['EORI number', 'Intrastat']
  },
  'DE': {
    preferEU: true,
    additionalRequirements: ['EORI number', 'Intrastat']
  },
  'US': {
    preferHTS: true,
    additionalRequirements: ['FDA prior notice', ' CBP entry']
  },
  'NG': {
    // Nigeria uses WCO HS with local additions
    preferWCO: true,
    additionalRequirements: ['NAFDAC registration', 'SON certification']
  }
};

// Product to HS mapping (fuzzy matching)
const PRODUCT_HS_MAPPING = {
  'cocoa': {
    candidates: ['18010000', '18020000', '18030000', '18040000', '18050000'],
    description: 'Cocoa beans, paste, butter, powder',
    requires: ['phytosanitary', 'lab_report']
  },
  'cocoa beans': {
    candidates: ['18010000'],
    description: 'Raw cocoa beans',
    requires: ['phytosanitary', 'lab_report']
  },
  'cocoa paste': {
    candidates: ['18030000'],
    description: 'Cocoa paste (including defatted)',
    requires: ['phytosanitary']
  },
  'cocoa butter': {
    candidates: ['18040000'],
    description: 'Cocoa butter, fat and oil',
    requires: []
  },
  'sesame': {
    candidates: ['12074000', '12073010', '12073090'],
    description: 'Sesame seeds',
    requires: ['phytosanitary', 'lab_report']
  },
  'sesame seeds': {
    candidates: ['12074000'],
    description: 'Sesame seeds, whether or not broken',
    requires: ['phytosanitary', 'lab_report']
  },
  'coffee': {
    candidates: ['09011100', '09011200', '09012100', '09012200'],
    description: 'Coffee, roasted, decaffeinated',
    requires: ['phytosanitary']
  },
  'coffee beans': {
    candidates: ['09011100', '09011200'],
    description: 'Coffee beans, not roasted',
    requires: ['phytosanitary']
  },
  'ginger': {
    candidates: ['09101010', '09101090'],
    description: 'Ginger, crushed or ground',
    requires: ['phytosanitary']
  },
  'cashew': {
    candidates: ['08013100', '08013200'],
    description: 'Cashew nuts, in shell or shelled',
    requires: ['phytosanitary', 'lab_report']
  },
  'shea': {
    candidates: ['15099000', '15159000'],
    description: 'Shea butter',
    requires: []
  },
  // Invalid products for HS validation test
  'machinery': {
    candidates: [],
    description: 'NOT VALID for agro-export'
  },
  'electronics': {
    candidates: ['8517', '8528'],
    description: 'Telecommunications equipment'
  }
};

/**
 * Resolve HS code from product description
 * @param {string} product - Product name/description
 * @param {string} destination - Destination country code
 * @returns {Object} Resolution result with candidates, confidence, and validation
 */
function resolveHSCode(product, destination = 'NG') {
  const result = {
    product: product.toLowerCase(),
    destination,
    candidates: [],
    selected_code: null,
    confidence: 0,
    is_valid: false,
    errors: [],
    warnings: [],
    resolved_at: new Date().toISOString()
  };
  
  // 1. Fuzzy match product to HS candidates
  const productKey = product.toLowerCase().trim();
  const mapping = PRODUCT_HS_MAPPING[productKey];
  
  if (!mapping) {
    // Try partial match
    const partialMatch = Object.keys(PRODUCT_HS_MAPPING).find(
      key => productKey.includes(key) || key.includes(productKey)
    );
    
    if (partialMatch) {
      result.candidates = PRODUCT_HS_MAPPING[partialMatch].candidates;
      result.warnings.push(`Partial match found: ${partialMatch}`);
    } else {
      result.errors.push(`Unknown product: ${product}`);
      result.is_valid = false;
      return result;
    }
  } else {
    if (mapping.candidates.length === 0) {
      result.errors.push(`Product '${product}' is not valid for agricultural export`);
      result.is_valid = false;
      return result;
    }
    result.candidates = mapping.candidates;
  }
  
  // 2. Validate against destination country rules
  const countryRules = COUNTRY_HS_RULES[destination];
  if (!countryRules) {
    result.warnings.push(`No specific rules for destination: ${destination}, using WCO default`);
  }
  
  // 3. Verify code exists in tariff tree
  const verifiedCodes = [];
  for (const code of result.candidates) {
    const chapter = code.substring(0, 2);
    const heading = code.substring(2, 4);
    
    if (HS_TARIFF_TREE[chapter]) {
      if (HS_TARIFF_TREE[chapter].headings[heading]) {
        verifiedCodes.push({
          code,
          description: HS_TARIFF_TREE[chapter].headings[heading].description || 'Unknown',
          chapter,
          heading
        });
      }
    }
  }
  
  result.candidates = verifiedCodes;
  
  if (verifiedCodes.length === 0) {
    result.errors.push('No valid HS codes found in tariff tree');
    result.is_valid = false;
    return result;
  }
  
  // 4. Calculate confidence (simplified scoring)
  const exactMatch = verifiedCodes.find(c => c.code === result.candidates[0]?.code);
  if (exactMatch) {
    result.confidence = 0.95;
    result.selected_code = exactMatch.code;
  } else {
    result.confidence = 0.70;
    result.selected_code = verifiedCodes[0].code;
  }
  
  // 5. Check confidence threshold
  if (result.confidence < 0.80) {
    result.warnings.push(`Low confidence (${result.confidence}). Manual review recommended.`);
  }
  
  result.is_valid = true;
  return result;
}

/**
 * Validate HS code against product type
 * @param {string} product - Product name
 * @param {string} hsCode - HS code to validate
 * @returns {Object} Validation result
 */
function validateHSCode(product, hsCode) {
  const resolution = resolveHSCode(product);
  
  // Check if provided HS code is in candidates
  const isValid = resolution.candidates.some(c => c.code === hsCode || c.code === hsCode.substring(0, 6));
  
  return {
    valid: isValid,
    product,
    provided_hs_code: hsCode,
    expected_codes: resolution.candidates.map(c => c.code),
    resolved_code: resolution.selected_code,
    confidence: resolution.confidence,
    is_valid_for_export: isValid && resolution.is_valid,
    errors: resolution.errors,
    warnings: resolution.warnings,
    requires: PRODUCT_HS_MAPPING[product.toLowerCase()]?.requires || []
  };
}

/**
 * Get required documents for HS code
 * @param {string} hsCode - HS code
 * @returns {string[]} Required document types
 */
function getRequiredDocuments(hsCode) {
  const chapter = hsCode.substring(0, 2);
  
  const docRequirements = {
    '12': ['phytosanitary', 'lab_report'], // Oil seeds
    '18': ['phytosanitary', 'lab_report'], // Cocoa
    '09': ['phytosanitary'], // Coffee, ginger
    '08': ['phytosanitary', 'lab_report'], // Cashew
    '15': ['phytosanitary'] // Fats/oils
  };
  
  return docRequirements[chapter] || [];
}

/**
 * Log manual override for audit
 * @param {Object} override - Override details
 */
function logOverride(override) {
  const { product, original_hs_code, override_hs_code, reason, actor } = override;
  
  const auditEntry = {
    type: 'HS_CODE_OVERRIDE',
    product,
    original_hs_code,
    override_hs_code,
    reason,
    actor: actor || 'system',
    timestamp: new Date().toISOString()
  };
  
  // In production, store in audit table
  console.log('[HS Override Logged]', JSON.stringify(auditEntry));
  
  return auditEntry;
}

module.exports = {
  resolveHSCode,
  validateHSCode,
  getRequiredDocuments,
  logOverride,
  HS_TARIFF_TREE,
  PRODUCT_HS_MAPPING,
  COUNTRY_HS_RULES
};

// Test execution
if (require.main === module) {
  console.log('=== HS Resolution Engine Test ===\n');
  
  // Test 1: Valid cocoa
  console.log('Test 1: Valid cocoa');
  console.log(JSON.stringify(validateHSCode('cocoa', '18010000'), null, 2));
  
  // Test 2: Invalid machinery
  console.log('\nTest 2: Invalid machinery code');
  console.log(JSON.stringify(validateHSCode('cocoa', '84810000'), null, 2));
  
  // Test 3: Valid sesame
  console.log('\nTest 3: Valid sesame');
  console.log(JSON.stringify(validateHSCode('sesame', '12074000'), null, 2));
  
  // Test 4: Unknown product
  console.log('\nTest 4: Unknown product');
  console.log(JSON.stringify(validateHSCode('unknown_product', '123456'), null, 2));
}