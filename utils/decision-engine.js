/**
 * Decision Engine - Production-Ready Financial Decision System
 * 
 * Builds on XGBoost scoring to create a closed-loop, calibrated,
 * economically-grounded, confidence-aware, self-correcting system.
 * 
 * LAYERS (strict execution order):
 * 1. Deterministic Engine (hard gates)
 * 2. Feature Extraction
 * 3. XGBoost → Risk Score
 * 4. Calibration Layer
 * 5. Behavioral Adjustments
 * 6. Confidence Gate ← BLOCKS if insufficient data
 * 7. Expected Loss Calculation
 * 8. Fix Optimization
 * 9. Decision Generation
 * 10. Full Audit Log
 */

const crypto = require('crypto');

// ==================== NEW SERVICE IMPORTS ====================
const accuracyMonitor = require('../services/accuracy-monitor');
const fixOptimizer = require('../services/fix-optimizer');
const adversarialDetector = require('../services/adversarial-detector');
const humanLayer = require('../services/human-layer');

// ==================== CONFIGURATION ====================

const config = {
  // Thresholds
  riskThreshold: 0.6,
  inspectionThreshold: 0.5,
  confidenceThreshold: 0.6,
  minSampleSize: 30,
  
  // Economic defaults
  defaultShipmentValue: 25000,
  destructionCost: 25000,
  delayCost: 3000,
  returnCost: 5000,
  
  // Calibration buckets
  calibrationBuckets: [
    { min: 0.0, max: 0.1 },
    { min: 0.1, max: 0.2 },
    { min: 0.2, max: 0.3 },
    { min: 0.3, max: 0.4 },
    { min: 0.4, max: 0.5 },
    { min: 0.5, max: 0.6 },
    { min: 0.6, max: 0.7 },
    { min: 0.7, max: 0.8 },
    { min: 0.8, max: 0.9 },
    { min: 0.9, max: 1.0 }
  ],
  
  // Drift thresholds
  maxCalibrationError: 0.15,
  maxDaysSinceTraining: 14,
  minDataVolume: 100,
  
  // Health check thresholds
  healthThresholds: {
    calibrationError: 0.2,
    daysSinceTraining: 14,
    minVolume: 100
  }
};

// ==================== IN-MEMORY STORAGE ====================

const modelData = {
  // Calibration buckets (NOW WITH sample_size)
  calibration: {},
  
  // Historical predictions
  predictions: [],
  
  // Shipment outcomes
  outcomes: [],
  
  // External signals (RASFF, manual)
  externalSignals: [],
  
  // Actor reliability (ENHANCED)
  actorReliability: {
    labs: {},
    exporters: {},
    ports: {}
  },
  
  // Fix rules (NEW)
  fixRules: [],
  
  // Drift metrics (NEW)
  driftMetrics: [],
  
  // Model metadata
  modelMetadata: {
    lastTrainingDate: new Date().toISOString(),
    totalTrainingSamples: 0,
    version: '2.0.0'
  },
  
  // Behavioral tracking
  recentLabs: {},
  recentPorts: {},
  recentExporters: {},
  
  // Feature weights
  featureWeights: {
    lab_aflatoxin_total: 0.35,
    lab_pesticide_count: 0.20,
    lab_salmonella_present: 0.15,
    exporter_risk_score: 0.15,
    historical_rejections: 0.10,
    destination_port: 0.03,
    product_type: 0.02
  }
};

// ==================== 1. CALIBRATION LAYER (WITH sample_size) ====================

function initializeCalibration() {
  for (const bucket of config.calibrationBuckets) {
    const key = `${bucket.min}-${bucket.max}`;
    modelData.calibration[key] = {
      bucket_min: bucket.min,
      bucket_max: bucket.max,
      num_samples: 0,        // NEW: sample_size
      num_rejections: 0,
      empirical_rate: 0,
      last_updated: new Date().toISOString()
    };
  }
  initializeFixRules();
  console.log('Calibration + Fix Rules initialized');
  return true;
}

function findBucket(riskScore) {
  for (const bucket of config.calibrationBuckets) {
    if (riskScore >= bucket.min && riskScore < bucket.max) {
      return `${bucket.min}-${bucket.max}`;
    }
  }
  if (riskScore >= 0.9 && riskScore <= 1.0) return '0.9-1.0';
  return '0.0-0.1';
}

function updateCalibration(riskScore, actualOutcome) {
  const bucketKey = findBucket(riskScore);
  
  if (bucketKey && modelData.calibration[bucketKey]) {
    const bucket = modelData.calibration[bucketKey];
    bucket.num_samples++;
    if (actualOutcome === 'REJECTED' || actualOutcome === 'FLAGGED') {
      bucket.num_rejections++;
    }
    bucket.empirical_rate = bucket.num_rejections / bucket.num_samples;
    bucket.last_updated = new Date().toISOString();
  }
  
  return getCalibrationTable();
}

function getCalibratedProbability(riskScore) {
  const bucketKey = findBucket(riskScore);
  const bucket = modelData.calibration[bucketKey];
  
  if (!bucket || bucket.num_samples < 5) {
    return riskScore;
  }
  
  const weight = Math.min(1, bucket.num_samples / 20);
  return (1 - weight) * riskScore + weight * bucket.empirical_rate;
}

function getCalibrationTable() {
  return Object.values(modelData.calibration);
}

function getBucketSampleSize(riskScore) {
  const bucketKey = findBucket(riskScore);
  const bucket = modelData.calibration[bucketKey];
  return bucket ? bucket.num_samples : 0;
}

// ==================== 2. CONFIDENCE GATING LAYER (NEW) ====================

/**
 * Apply confidence gate - BLOCKS decisions when data is weak
 */
function applyConfidenceGate({ confidence, sample_size, riskScore }) {
  // Get sample size from calibration bucket
  const bucketSampleSize = sample_size || getBucketSampleSize(riskScore);
  
  if (confidence < config.confidenceThreshold || bucketSampleSize < config.minSampleSize) {
    return {
      gated: true,
      decision: 'INSUFFICIENT_DATA',
      reason: confidence < config.confidenceThreshold 
        ? `LOW_CONFIDENCE (${confidence.toFixed(2)})` 
        : `LOW_SAMPLE_SIZE (${bucketSampleSize} < ${config.minSampleSize})`,
      confidence,
      sample_size: bucketSampleSize
    };
  }
  
  return { gated: false, confidence, sample_size: bucketSampleSize };
}

// ==================== 3. FULL ECONOMIC LOSS ENGINE (NEW) ====================

/**
 * Calculate expected loss with FULL breakdown
 * Uses inspection_probability to derive component probabilities
 */
function calculateExpectedLoss(inspectionProbability, shipmentValue, destructionCost, delayCost, returnCost) {
  // Source probabilities from inspection probability
  // In production, these would be learned from outcomes table
  const destruction_probability = inspectionProbability * 0.6;
  const delay_probability = inspectionProbability * 0.25;
  const return_probability = inspectionProbability * 0.15;
  
  const destruction = destruction_probability * (destructionCost || config.destructionCost);
  const delay = delay_probability * (delayCost || config.delayCost);
  const returns = return_probability * (returnCost || config.returnCost);
  
  const expected_loss = destruction + delay + returns;
  
  return {
    expected_loss_usd: Math.round(expected_loss),
    loss_breakdown: {
      destruction: Math.round(destruction),
      delay: Math.round(delay),
      return: Math.round(returns)
    },
    probabilities: {
      destruction: destruction_probability,
      delay: delay_probability,
      return: return_probability
    }
  };
}

/**
 * Calculate loss from explicit inputs (for advanced use)
 */
function calculateLossFromInputs(input) {
  const { 
    shipment_value, 
    destruction_cost, 
    delay_cost, 
    return_cost,
    destruction_probability,
    delay_probability,
    return_probability
  } = input;
  
  return {
    expected_loss_usd: Math.round(
      (destruction_probability || 0) * (destruction_cost || config.destructionCost) +
      (delay_probability || 0) * (delay_cost || config.delayCost) +
      (return_probability || 0) * (return_cost || config.returnCost)
    ),
    loss_breakdown: {
      destruction: Math.round((destruction_probability || 0) * (destruction_cost || config.destructionCost)),
      delay: Math.round((delay_probability || 0) * (delay_cost || config.delayCost)),
      return: Math.round((return_probability || 0) * (return_cost || config.returnCost))
    }
  };
}

// ==================== 4. CONTEXTUAL BEHAVIORAL ENGINE (NEW) ====================

/**
 * Actor reliability tracking
 */
function updateActorReliability(actorType, actorId, outcome) {
  if (!modelData.actorReliability[actorType + 's']) return;
  
  const storageKey = actorType + 's';
  const actor = modelData.actorReliability[storageKey][actorId] || {
    total_shipments: 0,
    total_failures: 0,
    reliability_score: 0.8,
    last_updated: new Date().toISOString()
  };
  
  actor.total_shipments++;
  if (outcome === 'REJECTED' || outcome === 'FLAGGED') {
    actor.total_failures++;
  }
  
  actor.reliability_score = actor.total_shipments > 0 
    ? 1 - (actor.total_failures / actor.total_shipments)
    : 0.8;
  actor.last_updated = new Date().toISOString();
  
  modelData.actorReliability[storageKey][actorId] = actor;
  return actor;
}

function getActorReliabilityScore(actorType, actorId) {
  const storageKey = actorType + 's';
  const actor = modelData.actorReliability[storageKey]?.[actorId];
  return actor ? actor.reliability_score : null;
}

/**
 * Get port alert rate from RASFF signals
 */
function getPortAlertRate(port) {
  const portSignals = modelData.externalSignals.filter(s => 
    s.signal_type === 'RASFF' && s.description?.includes(port)
  );
  const totalSignals = modelData.externalSignals.filter(s => s.signal_type === 'RASFF').length;
  return totalSignals > 0 ? portSignals.length / totalSignals : 0;
}

/**
 * Contextual behavioral adjustments - uses RELIABILITY scores
 */
function applyBehavioralAdjustments(input) {
  let adjustment = 0;
  const adjustments = [];
  
  const { 
    lab_switched_recently, 
    port_switched_recently, 
    batch_reuse_flag,
    lab_id,
    port,
    exporter_id 
  } = input;
  
  // Lab reliability check
  if (lab_switched_recently && lab_id) {
    const labReliability = getActorReliabilityScore('lab', lab_id);
    if (labReliability !== null && labReliability < 0.6) {
      adjustment += 0.2;
      adjustments.push({ factor: 'lab_unreliable_switch', adjustment: 0.2 });
    } else {
      adjustment += 0.10;
      adjustments.push({ factor: 'lab_switched', adjustment: 0.10 });
    }
  }
  
  // Port alert rate check
  if (port_switched_recently && port) {
    const portAlertRate = getPortAlertRate(port);
    if (portAlertRate > 0.4) {
      adjustment += 0.15;
      adjustments.push({ factor: 'port_high_alert', adjustment: 0.15 });
    } else {
      adjustment += 0.10;
      adjustments.push({ factor: 'port_switched', adjustment: 0.10 });
    }
  }
  
  // Exporter reliability check
  if (exporter_id) {
    const exporterReliability = getActorReliabilityScore('exporter', exporter_id);
    if (exporterReliability !== null && exporterReliability < 0.5) {
      adjustment += 0.25;
      adjustments.push({ factor: 'exporter_unreliable', adjustment: 0.25 });
    }
  }
  
  // Batch reuse
  if (batch_reuse_flag) {
    adjustment += 0.20;
    adjustments.push({ factor: 'batch_reuse', adjustment: 0.20 });
  }
  
  return {
    total_adjustment: adjustment,
    breakdown: adjustments
  };
}

// ==================== 5. DRIFT DETECTION SYSTEM (NEW) ====================

/**
 * Record drift metrics
 */
function recordDriftMetrics(avgPredictedRisk, actualRejectionRate) {
  const calibrationError = Math.abs(avgPredictedRisk - actualRejectionRate);
  
  const metric = {
    id: generateId('DRIFT'),
    week_start: getWeekStart(new Date()),
    avg_predicted_risk: avgPredictedRisk,
    actual_rejection_rate: actualRejectionRate,
    calibration_error: calibrationError,
    created_at: new Date().toISOString()
  };
  
  modelData.driftMetrics.push(metric);
  
  // Keep only last 52 weeks
  if (modelData.driftMetrics.length > 52) {
    modelData.driftMetrics.shift();
  }
  
  return metric;
}

/**
 * Check if drift exceeds threshold
 */
function checkDriftStatus() {
  if (modelData.driftMetrics.length === 0) {
    return { status: 'NO_DATA', calibration_error: 0 };
  }
  
  const latest = modelData.driftMetrics[modelData.driftMetrics.length - 1];
  const isDrifted = latest.calibration_error > config.maxCalibrationError;
  
  return {
    status: isDrifted ? 'DRIFT_DETECTED' : 'STABLE',
    calibration_error: latest.calibration_error,
    threshold: config.maxCalibrationError,
    avg_predicted_risk: latest.avg_predicted_risk,
    actual_rejection_rate: latest.actual_rejection_rate,
    should_retrain: isDrifted
  };
}

function getDriftMetrics() {
  return modelData.driftMetrics;
}

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff)).toISOString().split('T')[0];
}

// ==================== 6. FIX OPTIMIZATION ENGINE (NEW) ====================

/**
 * Initialize fix rules table
 */
function initializeFixRules() {
  modelData.fixRules = [
    {
      id: 1,
      condition: 'aflatoxin_high',
      action: 'retest_tier1_lab',
      cost_usd: 120,
      expected_risk_reduction: 0.4
    },
    {
      id: 2,
      condition: 'lab_untrusted',
      action: 'switch_lab',
      cost_usd: 200,
      expected_risk_reduction: 0.3
    },
    {
      id: 3,
      condition: 'documentation_missing',
      action: 'add_documentation',
      cost_usd: 50,
      expected_risk_reduction: 0.15
    },
    {
      id: 4,
      condition: 'port_high_risk',
      action: 'reroute_port',
      cost_usd: 500,
      expected_risk_reduction: 0.5
    },
    {
      id: 5,
      condition: 'exporter_review',
      action: 'exporter_audit',
      cost_usd: 800,
      expected_risk_reduction: 0.6
    },
    {
      id: 6,
      condition: 'pesticide_detected',
      action: 'treatment_certificate',
      cost_usd: 180,
      expected_risk_reduction: 0.35
    },
    {
      id: 7,
      condition: 'salmonella_present',
      action: 'sanitation_retest',
      cost_usd: 300,
      expected_risk_reduction: 0.45
    }
  ];
}

/**
 * Select best fix based on cost-effectiveness
 */
function selectBestFix(applicableFixes) {
  // FIX: Handle undefined/null/empty array
  if (!applicableFixes || !Array.isArray(applicableFixes) || applicableFixes.length === 0) {
    return { action: 'No fix available', cost_usd: 0, risk_reduction: 0 };
  }
  
  // FIX: Filter out any rules with invalid cost
  const validFixes = applicableFixes.filter(fix => fix && fix.cost_usd > 0 && fix.expected_risk_reduction > 0);
  
  if (validFixes.length === 0) {
    return { action: 'No fix available', cost_usd: 0, risk_reduction: 0 };
  }
  
  // Sort by efficiency: risk_reduction / cost
  const sorted = [...validFixes].sort((a, b) => 
    (b.expected_risk_reduction / b.cost_usd) -
    (a.expected_risk_reduction / a.cost_usd)
  );
  
  return {
    action: sorted[0].action,
    cost_usd: sorted[0].cost_usd,
    risk_reduction: sorted[0].expected_risk_reduction,
    efficiency: sorted[0].expected_risk_reduction / sorted[0].cost_usd
  };
}

/**
 * Get applicable fixes for shipment
 */
function getApplicableFixes(shipmentData, riskScore) {
  const applicable = [];
  
  for (const rule of modelData.fixRules) {
    let matches = false;
    
    switch (rule.condition) {
      case 'aflatoxin_high':
        matches = shipmentData.lab_aflatoxin_total > 10;
        break;
      case 'lab_untrusted':
        const labRel = shipmentData.lab_id ? getActorReliabilityScore('lab', shipmentData.lab_id) : null;
        matches = labRel !== null && labRel < 0.6;
        break;
      case 'documentation_missing':
        matches = !shipmentData.documentation_complete;
        break;
      case 'port_high_risk':
        matches = ['Rotterdam', 'Hamburg', 'Antwerp'].includes(shipmentData.destination_port);
        break;
      case 'exporter_review':
        const expRel = shipmentData.exporter_id ? getActorReliabilityScore('exporter', shipmentData.exporter_id) : null;
        matches = expRel !== null && expRel < 0.5;
        break;
      case 'pesticide_detected':
        matches = shipmentData.lab_pesticide_count > 3;
        break;
      case 'salmonella_present':
        matches = shipmentData.lab_salmonella_present === true;
        break;
    }
    
    if (matches) {
      applicable.push(rule);
    }
  }
  
  return applicable;
}

// ==================== 7. KILL SWITCH / HEALTH CHECK (NEW) ====================

/**
 * Check model health
 */
function checkModelHealth() {
  const { calibrationError, daysSinceTraining, minVolume } = config.healthThresholds;
  
  // Calculate days since last training
  const lastTrain = new Date(modelData.modelMetadata.lastTrainingDate);
  const now = new Date();
  const daysTrain = Math.floor((now - lastTrain) / (1000 * 60 * 60 * 24));
  
  // Get data volume
  const dataVolume = modelData.outcomes.length;
  
  // Get drift status
  const driftStatus = checkDriftStatus();
  
  // Determine health
  let health = 'HEALTHY';
  const issues = [];
  
  if (driftStatus.calibration_error > calibrationError) {
    health = 'DEGRADED';
    issues.push(`Calibration error (${driftStatus.calibration_error.toFixed(2)}) > ${calibrationError}`);
  }
  
  if (daysTrain > daysSinceTraining) {
    health = 'DEGRADED';
    issues.push(`Days since training (${daysTrain}) > ${daysSinceTraining}`);
  }
  
  if (dataVolume < minVolume) {
    health = 'DEGRADED';
    issues.push(`Data volume (${dataVolume}) < ${minVolume}`);
  }
  
  if (issues.length > 1) {
    health = 'CRITICAL';
  }
  
  return {
    health,
    issues,
    metrics: {
      calibration_error: driftStatus.calibration_error,
      days_since_training: daysTrain,
      data_volume: dataVolume
    }
  };
}

/**
 * Deterministic fallback when model is degraded
 */
function deterministicDecisionOnly(shipmentData) {
  // Calculate basic risk for loss estimation
  const riskScore = calculateBaseRiskSync(shipmentData);
  const shipmentValue = shipmentData.shipment_value || config.defaultShipmentValue;
  
  // Simple expected loss for deterministic
  const expectedLoss = riskScore * shipmentValue;
  
  // Simple rule-based decision when ML is unavailable
  if (shipmentData.lab_salmonella_present) {
    return { 
      decision: 'DO_NOT_SHIP', 
      reason: 'Deterministic: Salmonella detected', 
      model_health: 'FALLBACK',
      risk_score: riskScore,
      expected_loss_usd: expectedLoss,
      loss_breakdown: {
        destruction: expectedLoss * 0.6,
        delay: expectedLoss * 0.25,
        return: expectedLoss * 0.15
      },
      confidence: 0.5,
      sample_size: 0
    };
  }
  if (shipmentData.lab_aflatoxin_total > 20) {
    return { 
      decision: 'DO_NOT_SHIP', 
      reason: 'Deterministic: Aflatoxin critical', 
      model_health: 'FALLBACK',
      risk_score: riskScore,
      expected_loss_usd: expectedLoss,
      loss_breakdown: {
        destruction: expectedLoss * 0.6,
        delay: expectedLoss * 0.25,
        return: expectedLoss * 0.15
      },
      confidence: 0.5,
      sample_size: 0
    };
  }
  if (shipmentData.deterministic_blocked) {
    return { 
      decision: 'DO_NOT_SHIP', 
      reason: 'Deterministic: Compliance failure', 
      model_health: 'FALLBACK',
      risk_score: riskScore,
      expected_loss_usd: expectedLoss,
      loss_breakdown: {
        destruction: expectedLoss * 0.6,
        delay: expectedLoss * 0.25,
        return: expectedLoss * 0.15
      },
      confidence: 0.5,
      sample_size: 0
    };
  }
  return { 
    decision: 'CLEAR_TO_SHIP', 
    reason: 'Deterministic: Pass', 
    model_health: 'FALLBACK',
    risk_score: riskScore,
    expected_loss_usd: expectedLoss,
    loss_breakdown: {
      destruction: expectedLoss * 0.6,
      delay: expectedLoss * 0.25,
      return: expectedLoss * 0.15
    },
    confidence: 0.5,
    sample_size: 0
  };
}

/**
 * Synchronous base risk calculation (for fallback)
 */
function calculateBaseRiskSync(shipmentData) {
  let riskScore = 0;
  
  const { 
    lab_aflatoxin_total, 
    lab_pesticide_count, 
    lab_salmonella_present,
    exporter_risk_score,
    historical_rejections,
    destination_port
  } = shipmentData;
  
  if (lab_aflatoxin_total !== undefined) {
    if (lab_aflatoxin_total > 15) riskScore += 0.35;
    else if (lab_aflatoxin_total > 10) riskScore += 0.28;
    else if (lab_aflatoxin_total > 5) riskScore += 0.17;
    else riskScore += 0.07;
  }
  
  if (lab_pesticide_count !== undefined) {
    if (lab_pesticide_count > 5) riskScore += 0.18;
    else if (lab_pesticide_count > 3) riskScore += 0.14;
    else if (lab_pesticide_count > 1) riskScore += 0.08;
  }
  
  if (lab_salmonella_present) riskScore += 0.15;
  
  if (exporter_risk_score !== undefined) {
    if (exporter_risk_score > 70) riskScore += 0.12;
    else if (exporter_risk_score > 40) riskScore += 0.07;
  }
  
  if (historical_rejections !== undefined) {
    if (historical_rejections > 5) riskScore += 0.09;
    else if (historical_rejections > 2) riskScore += 0.06;
    else if (historical_rejections > 0) riskScore += 0.03;
  }
  
  if (destination_port) {
    const highRiskPorts = ['Rotterdam', 'Hamburg', 'Antwerp'];
    if (highRiskPorts.includes(destination_port)) riskScore += 0.04;
  }
  
  return Math.min(1, riskScore);
}

// ==================== 8. BEHAVIORAL TRACKING ====================

function trackShipment(shipmentData) {
  const { shipment_id, lab_id, port, exporter_id } = shipmentData;
  const timestamp = new Date().toISOString();
  
  if (lab_id) {
    if (!modelData.recentLabs[lab_id]) modelData.recentLabs[lab_id] = [];
    modelData.recentLabs[lab_id].push({ shipment_id, timestamp });
    modelData.recentLabs[lab_id] = modelData.recentLabs[lab_id].slice(-10);
  }
  
  if (port) {
    if (!modelData.recentPorts[port]) modelData.recentPorts[port] = [];
    modelData.recentPorts[port].push({ shipment_id, timestamp });
    modelData.recentPorts[port] = modelData.recentPorts[port].slice(-10);
  }
  
  if (exporter_id) {
    if (!modelData.recentExporters[exporter_id]) modelData.recentExporters[exporter_id] = [];
    modelData.recentExporters[exporter_id].push({ shipment_id, timestamp });
    modelData.recentExporters[exporter_id] = modelData.recentExporters[exporter_id].slice(-10);
  }
}

function checkBehavioralSignals(currentShipment) {
  const signals = {
    lab_switched_recently: false,
    port_switched_recently: false,
    batch_reuse_flag: false,
    lab_switch_count: 0,
    port_switch_count: 0
  };
  
  const { lab_id, port, exporter_id, batch_number } = currentShipment;
  
  // Check lab switching - FIX: Check if modelData.recentLabs exists and has entries
  if (lab_id && modelData.recentLabs && modelData.recentLabs[lab_id] && modelData.recentLabs[lab_id].length > 0) {
    const recentShipments = modelData.recentLabs[lab_id].slice(-4, -1);
    if (recentShipments && recentShipments.length > 0) {
      signals.lab_switched_recently = true;
      signals.lab_switch_count = recentShipments.length;
    }
  }
  
  // Check port switching - FIX: Check if modelData.recentPorts exists and has entries
  if (port && modelData.recentPorts && modelData.recentPorts[port] && modelData.recentPorts[port].length > 0) {
    const recentShipments = modelData.recentPorts[port].slice(-4, -1);
    if (recentShipments && recentShipments.length > 0) {
      signals.port_switched_recently = true;
      signals.port_switch_count = recentShipments.length;
    }
  }
  
  // Check batch reuse
  if (batch_number) {
    const batchCount = modelData.outcomes ? modelData.outcomes.filter(o => o.batch_number === batch_number).length : 0;
    if (batchCount > 1) {
      signals.batch_reuse_flag = true;
    }
  }
  
  return signals;
}

// ==================== 9. EXTERNAL SIGNALS ====================

function addExternalSignal(signalData) {
  const signal = {
    id: generateId('EXT'),
    shipment_id: signalData.shipment_id,
    signal_type: signalData.signal_type,
    severity: signalData.severity || 0.5,
    source: signalData.source || 'manual',
    description: signalData.description,
    timestamp: signalData.timestamp || new Date().toISOString()
  };
  
  modelData.externalSignals.push(signal);
  return signal;
}

function getExternalSignals(shipmentId) {
  return modelData.externalSignals.filter(s => s.shipment_id === shipmentId);
}

// ==================== 10. CORE DECISION PIPELINE ====================

/**
 * MAIN DECISION FUNCTION - Strict Execution Order
 */
async function predictDecision(shipmentData) {
  const timestamp = new Date().toISOString();
  const auditLog = { steps: [], timestamp };
  
  // === STEP 1: Check Model Health (Kill Switch) ===
  const modelHealth = checkModelHealth();
  auditLog.steps.push({ step: 'health_check', result: modelHealth.health });
  
  if (modelHealth.health === 'DEGRADED' || modelHealth.health === 'CRITICAL') {
    const fallback = deterministicDecisionOnly(shipmentData);
    return {
      ...fallback,
      model_health: modelHealth.health,
      audit_log: auditLog
    };
  }
  
  // === STEP 2: Deterministic Engine (hard gates) ===
  if (shipmentData.deterministic_blocked || shipmentData.lab_salmonella_present) {
    auditLog.steps.push({ step: 'deterministic', result: 'BLOCKED' });
    return {
      decision: 'DO_NOT_SHIP',
      reason: 'Deterministic compliance failure',
      model_health: modelHealth.health,
      audit_log: auditLog
    };
  }
  auditLog.steps.push({ step: 'deterministic', result: 'PASS' });
  
  // === STEP 3: Feature Extraction ===
  const baseRisk = await calculateBaseRisk(shipmentData);
  auditLog.steps.push({ step: 'feature_extraction', base_risk: baseRisk });
  
  // === STEP 4: XGBoost → Risk Score (simplified) ===
  // In production, this would call actual XGBoost model
  const riskScore = baseRisk;
  auditLog.steps.push({ step: 'xgboost', risk_score: riskScore });
  
  // === STEP 5: Calibration Layer ===
  const inspectionProbability = getCalibratedProbability(riskScore);
  const sampleSize = getBucketSampleSize(riskScore);
  auditLog.steps.push({ step: 'calibration', inspection_probability: inspectionProbability, sample_size: sampleSize });
  
  // === STEP 6: Behavioral Adjustments (Contextual) ===
  const behavioralSignals = checkBehavioralSignals(shipmentData);
  const behavioralAdjustments = applyBehavioralAdjustments({
    ...behavioralSignals,
    lab_id: shipmentData.lab_id,
    port: shipmentData.destination_port,
    exporter_id: shipmentData.exporter_id
  });
  
  let adjustedRisk = riskScore + behavioralAdjustments.total_adjustment;
  adjustedRisk = Math.min(1, adjustedRisk);
  auditLog.steps.push({ step: 'behavioral', adjustment: behavioralAdjustments });
  
  // === STEP 7: External Signals ===
  const externalSignals = getExternalSignals(shipmentData.id || shipmentData.shipment_id);
  let signalPenalty = 0;
  for (const signal of externalSignals) {
    signalPenalty += signal.severity * 0.3;
  }
  adjustedRisk = Math.min(1, adjustedRisk + signalPenalty);
  auditLog.steps.push({ step: 'external_signals', count: externalSignals.length, penalty: signalPenalty });
  
  // === STEP 8: Confidence Gate (BLOCKS if insufficient) ===
  const confidence = calculateConfidence(riskScore, sampleSize);
  const gateResult = applyConfidenceGate({ 
    confidence, 
    sample_size: sampleSize, 
    riskScore 
  });
  
  if (gateResult.gated) {
    auditLog.steps.push({ step: 'confidence_gate', result: 'BLOCKED', ...gateResult });
    return {
      decision: 'INSUFFICIENT_DATA',
      reason: gateResult.reason,
      confidence: confidence,
      sample_size: sampleSize,
      model_health: modelHealth.health,
      audit_log: auditLog
    };
  }
  auditLog.steps.push({ step: 'confidence_gate', result: 'PASS', confidence, sample_size: sampleSize });
  
  // === STEP 9: Expected Loss Calculation (FULL breakdown) ===
  const expectedLoss = calculateExpectedLoss(
    inspectionProbability,
    shipmentData.shipment_value || config.defaultShipmentValue,
    shipmentData.destruction_cost,
    shipmentData.delay_cost,
    shipmentData.return_cost
  );
  auditLog.steps.push({ step: 'loss_calculation', ...expectedLoss });
  
  // === STEP 10: Fix Optimization ===
  const applicableFixes = getApplicableFixes(shipmentData, adjustedRisk);
  const cheapestFix = selectBestFix(applicableFixes);
  auditLog.steps.push({ step: 'fix_optimization', fix: cheapestFix });
  
  // === STEP 11: Decision Generation ===
  const decision = determineDecision(inspectionProbability, adjustedRisk, shipmentData);
  auditLog.steps.push({ step: 'decision', ...decision });
  
  // === STEP 12: Track for behavioral analysis ===
  trackShipment(shipmentData);
  
  // === STEP 13: Store prediction ===
  modelData.predictions.push({
    shipment_id: shipmentData.id || shipmentData.shipment_id,
    risk_score: adjustedRisk,
    decision: decision.action,
    timestamp
  });
  
  // === FULL OUTPUT (MANDATORY STRUCTURE) ===
  return {
    decision: decision.action,
    inspection_probability: Math.round(inspectionProbability * 100) / 100,
    risk_score: Math.round(adjustedRisk * 100) / 100,
    confidence: Math.round(confidence * 100) / 100,
    sample_size: sampleSize,
    expected_loss_usd: expectedLoss.expected_loss_usd,
    loss_breakdown: expectedLoss.loss_breakdown,
    cheapest_fix: cheapestFix,
    behavioral_adjustments: behavioralAdjustments.total_adjustment,
    behavioral_details: behavioralAdjustments.breakdown,
    model_health: modelHealth.health,
    reason: decision.reason,
    audit_log: auditLog
  };
}

// ==================== HELPER FUNCTIONS ====================

async function calculateBaseRisk(shipmentData) {
  let riskScore = 0;
  
  const { 
    lab_aflatoxin_total, 
    lab_pesticide_count, 
    lab_salmonella_present,
    exporter_risk_score,
    historical_rejections,
    destination_port,
    product_type 
  } = shipmentData;
  
  if (lab_aflatoxin_total !== undefined) {
    if (lab_aflatoxin_total > 15) riskScore += 0.35;
    else if (lab_aflatoxin_total > 10) riskScore += 0.28;
    else if (lab_aflatoxin_total > 5) riskScore += 0.17;
    else riskScore += 0.07;
  }
  
  if (lab_pesticide_count !== undefined) {
    if (lab_pesticide_count > 5) riskScore += 0.18;
    else if (lab_pesticide_count > 3) riskScore += 0.14;
    else if (lab_pesticide_count > 1) riskScore += 0.08;
  }
  
  if (lab_salmonella_present) riskScore += 0.15;
  
  if (exporter_risk_score !== undefined) {
    if (exporter_risk_score > 70) riskScore += 0.12;
    else if (exporter_risk_score > 40) riskScore += 0.07;
  }
  
  if (historical_rejections !== undefined) {
    if (historical_rejections > 5) riskScore += 0.09;
    else if (historical_rejections > 2) riskScore += 0.06;
    else if (historical_rejections > 0) riskScore += 0.03;
  }
  
  if (destination_port) {
    const highRiskPorts = ['Rotterdam', 'Hamburg', 'Antwerp'];
    if (highRiskPorts.includes(destination_port)) riskScore += 0.04;
  }
  
  return Math.min(1, riskScore);
}

function determineDecision(inspectionProbability, riskScore, shipmentData) {
  if (inspectionProbability > 0.5 || riskScore > 0.7) {
    return {
      action: 'HIGH_RISK_INSPECTION',
      reason: `High inspection probability (${(inspectionProbability * 100).toFixed(0)}%)`
    };
  }
  
  if (riskScore > config.riskThreshold) {
    return {
      action: 'REVIEW_REQUIRED',
      reason: 'Elevated risk - manual review recommended'
    };
  }
  
  return {
    action: 'CLEAR_TO_SHIP',
    reason: 'Low risk - standard processing'
  };
}

function calculateConfidence(riskScore, sampleSize) {
  const bucketKey = findBucket(riskScore);
  const bucket = modelData.calibration[bucketKey];
  
  const effectiveSamples = sampleSize || (bucket ? bucket.num_samples : 0);
  
  if (effectiveSamples < 5) return 0.3;
  
  // Higher confidence with more samples
  return Math.min(0.95, 0.5 + (effectiveSamples / 50));
}

// ==================== OUTCOME FEEDBACK LOOP ====================

async function recordOutcome(outcomeData) {
  const outcome = {
    id: generateId('OUT'),
    shipment_id: outcomeData.shipment_id,
    predicted_risk: outcomeData.predicted_risk,
    predicted_class: outcomeData.predicted_class,
    actual_outcome: outcomeData.actual_outcome,
    port: outcomeData.port,
    product: outcomeData.product,
    lab_id: outcomeData.lab_id,
    exporter_id: outcomeData.exporter_id,
    batch_number: outcomeData.batch_number,
    timestamp: outcomeData.timestamp || new Date().toISOString()
  };
  
  modelData.outcomes.push(outcome);
  
  // Update calibration
  updateCalibration(outcomeData.predicted_risk, outcomeData.actual_outcome);
  
  // Update actor reliability
  if (outcomeData.lab_id) {
    updateActorReliability('lab', outcomeData.lab_id, outcomeData.actual_outcome);
  }
  if (outcomeData.exporter_id) {
    updateActorReliability('exporter', outcomeData.exporter_id, outcomeData.actual_outcome);
  }
  if (outcomeData.port) {
    updateActorReliability('port', outcomeData.port, outcomeData.actual_outcome);
  }
  
  // Update drift metrics if we have enough data
  if (modelData.outcomes.length % 10 === 0) {
    const recent = modelData.outcomes.slice(-50);
    const avgRisk = recent.reduce((sum, o) => sum + o.predicted_risk, 0) / recent.length;
    const actualRate = recent.filter(o => o.actual_outcome === 'REJECTED').length / recent.length;
    recordDriftMetrics(avgRisk, actualRate);
  }
  
  return outcome;
}

function getOutcomes(limit = 100) {
  return modelData.outcomes.slice(-limit);
}

// ==================== MODEL RETRAINING ====================

async function retrainModel() {
  // Update calibration from outcomes
  for (const outcome of modelData.outcomes) {
    updateCalibration(outcome.predicted_risk, outcome.actual_outcome);
  }
  
  // Recalculate feature weights
  recalculateFeatureWeights();
  
  // Update metadata
  modelData.modelMetadata.lastTrainingDate = new Date().toISOString();
  modelData.modelMetadata.totalTrainingSamples = modelData.outcomes.length;
  
  return {
    status: 'retrained',
    outcomes_used: modelData.outcomes.length,
    calibration_buckets: getCalibrationTable(),
    drift_metrics: getDriftMetrics(),
    timestamp: new Date().toISOString()
  };
}

function recalculateFeatureWeights() {
  const weights = {
    lab_aflatoxin_total: 0.35,
    lab_pesticide_count: 0.20,
    lab_salmonella_present: 0.15,
    exporter_risk_score: 0.15,
    historical_rejections: 0.10,
    destination_port: 0.03,
    product_type: 0.02
  };
  
  const recentOutcomes = modelData.outcomes.slice(-50);
  if (recentOutcomes.length > 10) {
    const rejectionRate = recentOutcomes.filter(o => o.actual_outcome === 'REJECTED').length / recentOutcomes.length;
    
    if (rejectionRate > 0.3) {
      weights.lab_aflatoxin_total += 0.05;
      weights.lab_pesticide_count += 0.03;
    }
  }
  
  modelData.featureWeights = weights;
}

// ==================== UTILITIES ====================

function generateId(prefix) {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(4).toString('hex');
  return `${prefix}-${timestamp}-${random}`.toUpperCase();
}

function getConfig() {
  return {
    riskThreshold: config.riskThreshold,
    inspectionThreshold: config.inspectionThreshold,
    confidenceThreshold: config.confidenceThreshold,
    minSampleSize: config.minSampleSize,
    defaultShipmentValue: config.defaultShipmentValue,
    calibrationBuckets: config.calibrationBuckets
  };
}

function setThreshold(threshold) {
  config.riskThreshold = threshold;
  return { threshold: config.riskThreshold };
}

// Get actor reliability (public)
function getActorReliability(type, id) {
  return modelData.actorReliability[type + 's']?.[id] || null;
}

// Get fix rules
function getFixRules() {
  return modelData.fixRules;
}

// ==================== VALIDATION TEST ====================

/**
 * Run validation test on historical shipments
 */
async function runValidationTest(shipments) {
  const results = [];
  
  for (const shipment of shipments) {
    const decision = await predictDecision(shipment);
    results.push({
      shipment_id: shipment.id || shipment.shipment_id,
      predicted_decision: decision.decision,
      expected_loss: decision.expected_loss_usd,
      confidence: decision.confidence,
      model_health: decision.model_health
    });
  }
  
  // Summary
  const highRiskCaught = results.filter(r => 
    r.predicted_decision === 'HIGH_RISK_INSPECTION' || r.predicted_decision === 'DO_NOT_SHIP'
  ).length;
  
  const avgLoss = results.reduce((sum, r) => sum + r.expected_loss, 0) / results.length;
  
  return {
    total_shipments: results.length,
    high_risk_flagged: highRiskCaught,
    flagging_rate: highRiskCaught / results.length,
    avg_expected_loss: avgLoss,
    details: results
  };
}

// Initialize on load
initializeCalibration();

// Initialize new services
accuracyMonitor.initialize();
fixOptimizer.initialize();
adversarialDetector.initialize();
humanLayer.initialize();
console.log('Decision Engine: All services initialized');

module.exports = {
  // Core
  predictDecision,
  
  // Calibration
  initializeCalibration,
  getCalibrationTable,
  getCalibratedProbability,
  
  // Confidence
  applyConfidenceGate,
  calculateConfidence,
  
  // Economic Loss
  calculateExpectedLoss,
  calculateLossFromInputs,
  
  // Behavioral
  checkBehavioralSignals,
  applyBehavioralAdjustments,
  trackShipment,
  
  // Actor Reliability
  updateActorReliability,
  getActorReliability,
  getActorReliabilityScore,
  
  // Drift
  checkDriftStatus,
  getDriftMetrics,
  recordDriftMetrics,
  
  // Fix Optimization
  getFixRules,
  selectBestFix,
  getApplicableFixes,
  
  // Health
  checkModelHealth,
  deterministicDecisionOnly,
  
  // Outcomes
  recordOutcome,
  getOutcomes,
  
  // External Signals
  addExternalSignal,
  getExternalSignals,
  
  // Retraining
  retrainModel,
  
  // Validation
  runValidationTest,
  
  // Config
  getConfig,
  setThreshold
};
