/**
 * CULBRIDGE COMPLIANCE ENGINE v3 - EXECUTION-GRADE SPEC
 * Deterministic, zero-LLM, JSON-only evaluation.
 * 
 * Phase 1: RuleResult integration for auditability
 */

const fs = require('fs');
const path = require('path');
const db = require('../utils/db');

const PRODUCTS_PATH = path.join(__dirname, '../data/products.json');
const RULES_PATHS = [
  path.join(__dirname, 'sample-rules.json'),
  path.join(__dirname, 'rules-v1-core.json')
  // Add more dynamically
];

/**
 * Levenshtein distance for fuzzy matching
 */
function levenshtein(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

/**
 * Load product registry
 */
function loadProducts() {
  const data = fs.readFileSync(PRODUCTS_PATH, 'utf8');
  return JSON.parse(data);
}

/**
 * Normalize product ID/name (Layer A→B)
 * Strict order: exact alias > canonical > case-insens > fuzzy ≤2
 */
function normalizeProduct(input, products) {
  input = input.toString().trim().toLowerCase();
  let bestMatch = null;
  let minDist = Infinity;
  const suggestions = [];

  for (const product of products) {
    // 1. Exact product_id match
    if (product.product_id.toLowerCase() === input) {
      return {
        status: 'MATCHED',
        product_id: product.product_id,
        confidence: 1.0,
        source: 'exact_id'
      };
    }

    // 2. Exact canonical/alias match
    if (product.canonical_name.toLowerCase() === input ||
        product.aliases.some(alias => alias.toLowerCase() === input)) {
      return {
        status: 'MATCHED',
        product_id: product.product_id,
        confidence: 1.0,
        source: 'exact_match'
      };
    }

    // 3. Case-insensitive canonical/alias
    if (product.canonical_name.toLowerCase() === input ||
        product.aliases.some(alias => alias.toLowerCase() === input)) {
      return {
        status: 'MATCHED',
        product_id: product.product_id,
        confidence: 0.99,
        source: 'case_insensitive'
      };
    }

    // 4. Fuzzy Levenshtein ≤2 on canonical + aliases
    const candidates = [product.canonical_name.toLowerCase()];
    product.aliases.forEach(alias => candidates.push(alias.toLowerCase()));
    for (const candidate of candidates) {
      const dist = levenshtein(input, candidate);
      if (dist <= 2 && dist < minDist) {
        minDist = dist;
        bestMatch = product;
      }
    }
  }

  if (bestMatch) {
    return {
      status: 'MATCHED',
      product_id: bestMatch.product_id,
      confidence: 0.97 - (minDist / 10),
      source: 'fuzzy_match'
    };
  }

  // UNRECOGNIZED - suggestions (closest 3)
  products.forEach(p => {
    const dist = Math.min(
      levenshtein(input, p.canonical_name.toLowerCase()),
      ...p.aliases.map(a => levenshtein(input, a.toLowerCase()))
    );
    suggestions.push({product_id: p.product_id, dist});
  });
  suggestions.sort((a,b) => a.dist - b.dist);
  const topSuggestions = suggestions.slice(0,3).map(s => s.product_id);

  return {
    status: 'UNRECOGNIZED_PRODUCT',
    action: 'REVIEW',
    suggestions: topSuggestions
  };
}

/**
 * Load rules from multiple JSONs
 */
function loadRules() {
  let allRules = [];
  for (const rulePath of RULES_PATHS) {
    if (fs.existsSync(rulePath)) {
      const data = fs.readFileSync(rulePath, 'utf8');
      const parsed = JSON.parse(data);
      allRules = allRules.concat(parsed.rules || parsed);
    }
  }
  return allRules.map(rule => ({
    id: rule.id,
    type: rule.type || 'threshold',
    priority: rule.priority || 50,
    scope: rule.scope || {},
    condition: rule.condition,
    action: rule.action,
    reason: rule.reason || 'Violation detected'
  }));
}

/**
 * Exact scope matching with * wildcard
 */
function matchScope(scope, shipment) {
  const productMatch = !scope.product_ids || (scope.product_ids.includes(shipment.product_id) || scope.product_ids.includes('*'));
  const originMatch = !scope.origin || (scope.origin.includes(shipment.origin) || scope.origin.includes('*'));
  const destMatch = !scope.destination || (scope.destination.includes(shipment.destination) || scope.destination.includes('*'));
  const channelMatch = !scope.channel || (scope.channel.includes(shipment.channel) || scope.channel.includes('*'));
  return productMatch && originMatch && destMatch && channelMatch;
}

/**
 * Strict condition evaluation
 */
function evaluateCondition(cond, attributes) {
  const value = attributes[cond.field];
  switch (cond.operator) {
    case '>': return Number(value) > Number(cond.value);
    case '<': return Number(value) < Number(cond.value);
    case '>=': return Number(value) >= Number(cond.value);
    case '<=': return Number(value) <= Number(cond.value);
    case '==': return Number(value) === Number(cond.value);
    case '!=': return Number(value) !== Number(cond.value);
    default: return false;
  }
}

/**
 * Document engine
 */
const DOCUMENT_RULES = {
  "Phytosanitary Certificate": {
    "required_for": ["fresh_produce", "spices", "seeds", "grains", "nuts"],
    "action_if_missing": "REJECT"
  },
  "CCI": {
    "required_for": ["all_exports"],
    "action_if_missing": "REJECT"
  },
  "Fumigation Certificate": {
    "required_for": ["grains", "seeds", "nuts"],
    "action_if_missing": "REVIEW"
  }
};

function evaluateDocuments(shipment, documentRules = DOCUMENT_RULES) {
  const missing = [];
  const category = shipment.category || '';
  for (const [docName, docRule] of Object.entries(documentRules)) {
    if (docRule.required_for.includes(category) || docRule.required_for.includes('all_exports')) {
      if (!shipment.documents.includes(docName)) {
        missing.push({
          name: docName,
          action: docRule.action_if_missing
        });
      }
    }
  }
  return missing;
}

/**
 * Phase 1: runRules → RuleResult[] wrapper for evaluation pipeline
 * Wraps normalization + rule evaluation → standardized audit trail
 */
async function runRules(shipmentId, shipment) {
  const ruleResults = [];

  try {
    // 1. Product normalization (Layer 2)
    const products = loadProducts();
    const productNorm = normalizeProduct(shipment.product_name || shipment.product || 'unknown', products);
    
    const normResult = {
      ruleId: 'PRODUCT_NORMALIZATION',
      status: productNorm.status === 'UNRECOGNIZED_PRODUCT' ? 'WARNING' : 'PASS',
      inputSnapshot: {
        input: shipment.product_name || shipment.product || 'unknown',
        result: productNorm,
        confidence: productNorm.confidence || 0
      },
      evaluatedAt: new Date().toISOString(),
      message: `Product ${productNorm.status.toLowerCase()} (${productNorm.source || 'unknown'})`
    };
    
    ruleResults.push(normResult);

    // 2. Document validation
    const missingDocs = evaluateDocuments(shipment);
    if (missingDocs.length > 0) {
      const docResult = {
        ruleId: 'DOCUMENT_REQUIRED',
        status: 'BLOCKER',
        inputSnapshot: {
          missing: missingDocs,
          category: shipment.category,
          presentDocs: shipment.documents || []
        },
        evaluatedAt: new Date().toISOString(),
        message: `${missingDocs.length} required documents missing`
      };
      ruleResults.push(docResult);
    }

    // 3. Load & evaluate rules
    const rules = loadRules();
    const applicable = rules.filter(rule => matchScope(rule.scope, shipment));
    
    for (const rule of applicable) {
      const triggered = evaluateCondition(rule.condition, shipment);
      if (triggered) {
        const ruleResult = {
          ruleId: rule.id,
          status: rule.severity === 'BLOCKER' ? 'BLOCKER' : 'WARNING',
          inputSnapshot: {
            condition: rule.condition,
            threshold: rule.condition.value,
            actual: shipment[rule.condition.field],
            rulePriority: rule.priority
          },
          evaluatedAt: new Date().toISOString(),
          message: rule.reason
        };
        ruleResults.push(ruleResult);
      }
    }

    // Log ALL results to audit table
    for (const result of ruleResults) {
      await db.run(`
        INSERT INTO evaluation_events (shipment_id, rule_id, status, input_snapshot, message, evaluated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [shipmentId, result.ruleId, result.status, JSON.stringify(result.inputSnapshot), result.message, result.evaluatedAt]);
    }

    return ruleResults;

  } catch (error) {
    const errorResult = {
      ruleId: 'ENGINE_ERROR',
      status: 'BLOCKER',
      inputSnapshot: { error: error.message, shipmentKeys: Object.keys(shipment || {}) },
      evaluatedAt: new Date().toISOString(),
      message: `Compliance engine failed: ${error.message}`
    };
    ruleResults.push(errorResult);
    
    await db.run(`
      INSERT INTO evaluation_events (shipment_id, rule_id, status, input_snapshot, message, evaluated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [shipmentId, errorResult.ruleId, errorResult.status, JSON.stringify(errorResult.inputSnapshot), errorResult.message, errorResult.evaluatedAt]);
    
    return ruleResults;
  }
}

// Export existing + new Phase 1 function
module.exports = {
  normalizeProduct,
  loadRules,
  matchScope,
  evaluateCondition,
  evaluateDocuments,
  runRules,    // Phase 1: RuleResult pipeline integration
  levenshtein
};
