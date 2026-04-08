/**
 * Multi-Step Fix Optimizer
 * 
 * Purpose: Generate optimized sequences of corrective actions that minimize
 * total expected loss while accounting for cost, risk reduction, and interdependencies.
 * 
 * Integration: Decision Engine, Accuracy Monitor
 */

const fs = require('fs');
const path = require('path');

// ==================== IN-MEMORY STORAGE ====================

let fixRules = [];

// ==================== SAMPLE FIX RULES ====================

const sampleFixRules = [
  { fix_id: 1, condition: 'aflatoxin_high', action: 'retest', cost_usd: 120, risk_reduction: 0.4, prerequisites: [] },
  { fix_id: 2, condition: 'lab_untrusted', action: 'switch_lab', cost_usd: 200, risk_reduction: 0.3, prerequisites: [] },
  { fix_id: 3, condition: 'document_expired', action: 'renew_document', cost_usd: 150, risk_reduction: 0.5, prerequisites: [] },
  { fix_id: 4, condition: 'traceability_gap', action: 'enhance_traceability', cost_usd: 300, risk_reduction: 0.6, prerequisites: [] },
  { fix_id: 5, condition: 'mrl_near_limit', action: 'alternative_lab', cost_usd: 180, risk_reduction: 0.35, prerequisites: [] },
  { fix_id: 6, condition: 'rasff_alert', action: 'additional_inspection', cost_usd: 250, risk_reduction: 0.45, prerequisites: [] },
  { fix_id: 7, condition: 'country_high_risk', action: 'enhanced_documentation', cost_usd: 100, risk_reduction: 0.25, prerequisites: [] },
  { fix_id: 8, condition: 'exporter_new', action: 'manual_review', cost_usd: 0, risk_reduction: 0.1, prerequisites: [] },
  { fix_id: 9, condition: 'certificate_missing', action: 'obtain_certificate', cost_usd: 400, risk_reduction: 0.55, prerequisites: [] },
  { fix_id: 10, condition: 'origin_unclear', action: 'verify_origin', cost_usd: 220, risk_reduction: 0.42, prerequisites: [] },
  { fix_id: 11, condition: 'phytosanitary_concern', action: 'extra_fumigation', cost_usd: 350, risk_reduction: 0.38, prerequisites: [] },
  { fix_id: 12, condition: 'weight_discrepancy', action: 'reweigh', cost_usd: 50, risk_reduction: 0.15, prerequisites: [] }
];

// ==================== CORE FUNCTIONS ====================

/**
 * Initialize service
 */
function initialize() {
  console.log('Fix Optimization Engine initializing...');
  loadFixRules();
  console.log(`Fix Optimizer: ${fixRules.length} rules loaded`);
  return true;
}

/**
 * Load fix rules
 */
function loadFixRules() {
  const dataPath = path.join(__dirname, '..', 'data', 'fix_rules.json');
  try {
    if (fs.existsSync(dataPath)) {
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      fixRules = data.fixRules || [];
    } else {
      fixRules = sampleFixRules;
      saveFixRules();
    }
  } catch (error) {
    fixRules = sampleFixRules;
    saveFixRules();
  }
}

/**
 * Save fix rules
 */
function saveFixRules() {
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const dataPath = path.join(dataDir, 'fix_rules.json');
  fs.writeFileSync(dataPath, JSON.stringify({ fixRules }, null, 2));
}

/**
 * Get applicable fixes for a shipment
 */
function getApplicableFixes(conditions) {
  if (!conditions || !Array.isArray(conditions)) {
    return [];
  }
  return fixRules.filter(fix => conditions.includes(fix.condition));
}

/**
 * Generate all feasible sequences
 */
function buildSequences(fixes) {
  const sequences = [];
  
  // Generate combinations of 1 to all fixes
  for (let i = 1; i <= fixes.length; i++) {
    const combinations = getCombinations(fixes, i);
    sequences.push(...combinations);
  }
  
  return sequences;
}

/**
 * Get combinations
 */
function getCombinations(arr, size) {
  const results = [];
  
  function combine(start, current) {
    if (current.length === size) {
      results.push([...current]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      current.push(arr[i]);
      combine(i + 1, current);
      current.pop();
    }
  }
  
  combine(0, []);
  return results;
}

/**
 * Evaluate a sequence
 */
function evaluateSequence(sequence, currentRisk) {
  let risk = currentRisk;
  let cost = 0;
  
  sequence.forEach(fix => {
    // Apply diminishing returns
    risk *= (1 - fix.risk_reduction);
    cost += fix.cost_usd;
  });
  
  const riskReduction = 1 - risk;
  const efficiency = cost > 0 ? riskReduction / cost : riskReduction * 10;
  
  return {
    final_risk: risk,
    total_cost: cost,
    total_risk_reduction: riskReduction,
    efficiency: efficiency,
    sequence: sequence
  };
}

/**
 * Main optimizer - find optimal fix plan
 */
function optimizeFixPlan(shipment) {
  const { risk_score = 0.5, conditions = [], max_budget = null } = shipment;
  
  // Get applicable fixes
  const applicableFixes = getApplicableFixes(conditions);
  
  if (applicableFixes.length === 0) {
    return {
      optimal_fix_plan: [],
      total_cost: 0,
      expected_final_risk: risk_score,
      message: 'No applicable fixes found'
    };
  }
  
  // Build and evaluate sequences
  const sequences = buildSequences(applicableFixes);
  
  const evaluated = sequences
    .map(seq => evaluateSequence(seq, risk_score))
    .filter(seq => !max_budget || seq.total_cost <= max_budget)
    .sort((a, b) => b.efficiency - a.efficiency);
  
  const best = evaluated[0];
  
  if (!best) {
    return {
      optimal_fix_plan: [],
      total_cost: 0,
      expected_final_risk: risk_score,
      message: 'No feasible fix plan within budget'
    };
  }
  
  return {
    optimal_fix_plan: best.sequence.map(f => ({
      action: f.action,
      condition: f.condition,
      cost_usd: f.cost_usd,
      risk_reduction: f.risk_reduction
    })),
    total_cost: best.total_cost,
    expected_final_risk: Math.round(best.final_risk * 100) / 100,
    expected_risk_reduction: Math.round(best.total_risk_reduction * 100) / 100,
    alternatives: evaluated.slice(1, 5).map(alt => ({
      plan: alt.sequence.map(f => f.action),
      cost: alt.total_cost,
      risk_reduction: Math.round(alt.total_risk_reduction * 100) / 100
    }))
  };
}

/**
 * Get fix rules
 */
function getFixRules() {
  return fixRules;
}

/**
 * Add fix rule
 */
function addFixRule(rule) {
  const newRule = {
    fix_id: fixRules.length + 1,
    ...rule,
    last_updated: new Date().toISOString()
  };
  fixRules.push(newRule);
  saveFixRules();
  return newRule;
}

/**
 * Get configuration
 */
function getConfig() {
  return {
    fix_rules_count: fixRules.length,
    sample_fix_rules_count: sampleFixRules.length
  };
}

// ==================== EXPORTS ====================

module.exports = {
  initialize,
  getApplicableFixes,
  optimizeFixPlan,
  getFixRules,
  addFixRule,
  getConfig
};
