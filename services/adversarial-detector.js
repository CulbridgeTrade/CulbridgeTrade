/**
 * Adversarial Detection Engine
 * 
 * Purpose: Detect strategic manipulation by actors in the export ecosystem
 * and apply penalties or escalations to preserve system integrity.
 * 
 * Patterns detected:
 * - Lab Rotation: Repeatedly switching labs to avoid repeated test failures
 * - Batch Splitting: Splitting large shipment into smaller lots to stay below detection thresholds
 * - Near-Threshold Submission: Sending shipments just below rejection thresholds
 * - Port Switching: Alternating ports to avoid inspection
 * 
 * Integration: Decision Engine, Fix Optimizer
 */

const fs = require('fs');
const path = require('path');

// ==================== IN-MEMORY STORAGE ====================

let actorPatterns = [];
let suspiciousShipments = [];

// ==================== SAMPLE DATA ====================

const samplePatterns = [
  { actor_id: 'LAB-NG-002', actor_type: 'lab', pattern_type: 'lab_rotation', pattern_count: 5, risk_multiplier: 1.3 },
  { actor_id: 'LAB-GH-001', actor_type: 'lab', pattern_type: 'result_reversal', pattern_count: 3, risk_multiplier: 1.4 },
  { actor_id: 'EXP-BR-001', actor_type: 'exporter', pattern_type: 'near_threshold_submission', pattern_count: 8, risk_multiplier: 1.2 },
  { actor_id: 'BROKER-001', actor_type: 'broker', pattern_type: 'batch_splitting', pattern_count: 4, risk_multiplier: 1.25 },
  { actor_id: 'EXP-NG-001', actor_type: 'exporter', pattern_type: 'port_switching', pattern_count: 3, risk_multiplier: 1.15 }
];

// ==================== CORE FUNCTIONS ====================

/**
 * Initialize service
 */
function initialize() {
  console.log('Adversarial Detection Layer initializing...');
  loadPatterns();
  console.log(`Adversarial Detector: ${actorPatterns.length} patterns loaded`);
  return true;
}

/**
 * Load patterns from storage
 */
function loadPatterns() {
  const dataPath = path.join(__dirname, '..', 'data', 'actor_patterns.json');
  try {
    if (fs.existsSync(dataPath)) {
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      actorPatterns = data.patterns || [];
      suspiciousShipments = data.suspicious || [];
    } else {
      actorPatterns = samplePatterns;
      savePatterns();
    }
  } catch (error) {
    actorPatterns = samplePatterns;
    savePatterns();
  }
}

/**
 * Save patterns
 */
function savePatterns() {
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const dataPath = path.join(dataDir, 'actor_patterns.json');
  fs.writeFileSync(dataPath, JSON.stringify({ patterns: actorPatterns, suspicious: suspiciousShipments }, null, 2));
}

/**
 * Detect patterns for a shipment
 */
function detectPatterns(shipment) {
  const patterns = [];
  const exporterId = shipment.exporter_id || shipment.exporterId;
  const labId = shipment.lab_id || shipment.labId;
  const port = shipment.port || shipment.destination;
  
  // Check lab rotation - exporter switching labs frequently
  const exporterLabHistory = actorPatterns.filter(p => 
    p.actor_id === exporterId && p.pattern_type === 'lab_rotation'
  );
  if (exporterLabHistory.length > 0 && exporterLabHistory[0].pattern_count > 2) {
    patterns.push({ 
      type: 'lab_rotation', 
      risk_multiplier: exporterLabHistory[0].risk_multiplier 
    });
  }
  
  // Check near-threshold submission
  const nearThreshold = actorPatterns.filter(p => 
    p.actor_id === exporterId && p.pattern_type === 'near_threshold_submission'
  );
  if (nearThreshold.length > 0 && nearThreshold[0].pattern_count > 3) {
    patterns.push({ 
      type: 'near_threshold_submission', 
      risk_multiplier: nearThreshold[0].risk_multiplier 
    });
  }
  
  // Check batch splitting
  if (shipment.quantity && shipment.standard_lot_size) {
    if (shipment.quantity < shipment.standard_lot_size * 0.5) {
      patterns.push({ type: 'batch_splitting', risk_multiplier: 1.25 });
    }
  }
  
  // Check port switching
  const portHistory = actorPatterns.filter(p => 
    p.actor_id === exporterId && p.pattern_type === 'port_switching'
  );
  if (portHistory.length > 0 && portHistory[0].pattern_count > 2) {
    patterns.push({ 
      type: 'port_switching', 
      risk_multiplier: portHistory[0].risk_multiplier 
    });
  }
  
  return patterns;
}

/**
 * Apply adversarial penalties to a shipment
 */
function applyAdversarialPenalties(shipment) {
  const detectedPatterns = detectPatterns(shipment);
  
  let totalMultiplier = 1.0;
  detectedPatterns.forEach(p => {
    totalMultiplier *= p.risk_multiplier;
  });
  
  // Cap multiplier to prevent runaway inflation
  totalMultiplier = Math.min(totalMultiplier, 3.0);
  
  // Log suspicious shipment
  if (detectedPatterns.length > 0) {
    const shipmentId = shipment.shipment_id || shipment.id;
    suspiciousShipments.push({
      shipment_id: shipmentId,
      actor_id: shipment.exporter_id || shipment.exporterId,
      detected_patterns: detectedPatterns,
      penalty_applied: true,
      risk_multiplier: totalMultiplier,
      timestamp: new Date().toISOString()
    });
    savePatterns();
  }
  
  return {
    risk_multiplier: totalMultiplier,
    detected_patterns: detectedPatterns,
    adjusted_risk_score: (shipment.risk_score || 0.5) * totalMultiplier
  };
}

/**
 * Record actor activity
 */
function recordActivity(actorId, actorType, patternType, count = 1) {
  const existing = actorPatterns.find(p => 
    p.actor_id === actorId && 
    p.actor_type === actorType && 
    p.pattern_type === patternType
  );
  
  if (existing) {
    existing.pattern_count += count;
    existing.last_detected = new Date().toISOString();
    // Update risk multiplier based on count
    existing.risk_multiplier = calculateRiskMultiplier(patternType, existing.pattern_count);
  } else {
    actorPatterns.push({
      actor_id: actorId,
      actor_type: actorType,
      pattern_type: patternType,
      pattern_count: count,
      last_detected: new Date().toISOString(),
      risk_multiplier: calculateRiskMultiplier(patternType, count)
    });
  }
  
  savePatterns();
  return actorPatterns;
}

/**
 * Calculate risk multiplier based on pattern type and count
 */
function calculateRiskMultiplier(patternType, count) {
  const multipliers = {
    lab_rotation: { base: 1.2, per_count: 0.1, max: 1.5 },
    batch_splitting: { base: 1.15, per_count: 0.1, max: 1.4 },
    near_threshold_submission: { base: 1.1, per_count: 0.05, max: 1.3 },
    port_switching: { base: 1.1, per_count: 0.1, max: 1.4 },
    repeated_late_docs: { base: 1.1, per_count: 0.1, max: 1.3 }
  };
  
  const config = multipliers[patternType] || { base: 1.1, per_count: 0.1, max: 1.3 };
  const multiplier = config.base + (count - 1) * config.per_count;
  return Math.min(multiplier, config.max);
}

/**
 * Analyze actor for suspicious behavior
 */
function analyzeActor(actorId, actorType) {
  const patterns = actorPatterns.filter(p => 
    p.actor_id === actorId && p.actor_type === actorType
  );
  
  if (patterns.length === 0) {
    return {
      actor_id: actorId,
      actor_type: actorType,
      risk_multiplier: 1.0,
      patterns: [],
      suspicious: false,
      recommendation: 'AUTO_APPROVE'
    };
  }
  
  const totalMultiplier = patterns.reduce((sum, p) => sum * p.risk_multiplier, 1);
  const suspicious = totalMultiplier > 1.2;
  
  return {
    actor_id: actorId,
    actor_type: actorType,
    risk_multiplier: Math.round(totalMultiplier * 100) / 100,
    patterns: patterns.map(p => ({
      pattern_type: p.pattern_type,
      pattern_count: p.pattern_count,
      risk_multiplier: p.risk_multiplier,
      last_detected: p.last_detected
    })),
    suspicious,
    recommendation: suspicious ? 'REQUIRES_MANUAL_REVIEW' : 'AUTO_APPROVE'
  };
}

/**
 * Get high risk actors
 */
function getHighRiskActors(minRisk = 1.2) {
  const actorRisks = {};
  
  actorPatterns.forEach(p => {
    if (!actorRisks[p.actor_id]) {
      actorRisks[p.actor_id] = {
        actor_id: p.actor_id,
        actor_type: p.actor_type,
        total_multiplier: 1.0,
        patterns: 0
      };
    }
    actorRisks[p.actor_id].total_multiplier *= p.risk_multiplier;
    actorRisks[p.actor_id].patterns += 1;
  });
  
  return Object.values(actorRisks)
    .filter(a => a.total_multiplier >= minRisk)
    .map(a => ({
      ...a,
      risk_multiplier: Math.round(a.total_multiplier * 100) / 100
    }))
    .sort((a, b) => b.total_multiplier - a.total_multiplier);
}

/**
 * Get patterns
 */
function getPatterns(filters = {}) {
  let result = [...actorPatterns];
  
  if (filters.actor_type) {
    result = result.filter(p => p.actor_type === filters.actor_type);
  }
  if (filters.pattern_type) {
    result = result.filter(p => p.pattern_type === filters.pattern_type);
  }
  if (filters.actor_id) {
    result = result.filter(p => p.actor_id === filters.actor_id);
  }
  
  return result;
}

/**
 * Get suspicious shipments
 */
function getSuspiciousShipments() {
  return suspiciousShipments;
}

/**
 * Get configuration
 */
function getConfig() {
  return {
    patterns_count: actorPatterns.length,
    suspicious_shipments_count: suspiciousShipments.length,
    actors_count: new Set(actorPatterns.map(p => p.actor_id)).size,
    pattern_types: [...new Set(actorPatterns.map(p => p.pattern_type))]
  };
}

// ==================== EXPORTS ====================

module.exports = {
  initialize,
  detectPatterns,
  applyAdversarialPenalties,
  recordActivity,
  analyzeActor,
  getHighRiskActors,
  getPatterns,
  getSuspiciousShipments,
  getConfig
};
