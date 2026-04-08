/**
 * Decision Accuracy Monitor Service
 * 
 * Purpose: Measure real-world correctness of the decision engine.
 * Tracks false positives, false negatives, precision, recall, and economic accuracy.
 * Must be API-accessible and auditable.
 * 
 * Integration: Decision Engine, Deterministic Engine
 */

const fs = require('fs');
const path = require('path');

// ==================== CONFIGURATION ====================

const config = {
  // Thresholds from spec
  fnrThreshold: 0.1,           // Alert if >10%
  lossErrorThreshold: 0.3,       // Alert if >30%
  precisionTarget: 0.7,
  minSampleSize: 50
};

// ==================== IN-MEMORY STORAGE ====================

let outcomes = [];
let predictions = [];

// ==================== SAMPLE DATA ====================

const sampleOutcomes = [
  { shipment_id: 'COCOA-NG-001', predicted_decision: 'SHIP', actual_outcome: 'cleared', predicted_loss_usd: 500, actual_loss_usd: 0, confidence: 0.85, sample_size: 10 },
  { shipment_id: 'COCOA-NG-002', predicted_decision: 'SHIP', actual_outcome: 'cleared', predicted_loss_usd: 1200, actual_loss_usd: 3000, confidence: 0.75, sample_size: 10 },
  { shipment_id: 'COCOA-GH-001', predicted_decision: 'SHIP', actual_outcome: 'cleared', predicted_loss_usd: 200, actual_loss_usd: 0, confidence: 0.92, sample_size: 10 },
  { shipment_id: 'SESAME-NL-001', predicted_decision: 'SHIP', actual_outcome: 'rejected', predicted_loss_usd: 800, actual_loss_usd: 15000, confidence: 0.82, sample_size: 10 },
  { shipment_id: 'SESAME-NL-002', predicted_decision: 'REQUIRES_MANUAL_REVIEW', actual_outcome: 'rejected', predicted_loss_usd: 5000, actual_loss_usd: 22000, confidence: 0.55, sample_size: 10 },
  { shipment_id: 'COFFEE-ET-001', predicted_decision: 'SHIP', actual_outcome: 'cleared', predicted_loss_usd: 300, actual_loss_usd: 0, confidence: 0.88, sample_size: 10 },
  { shipment_id: 'COFFEE-ET-002', predicted_decision: 'SHIP', actual_outcome: 'cleared', predicted_loss_usd: 900, actual_loss_usd: 4500, confidence: 0.80, sample_size: 10 },
  { shipment_id: 'TIMBER-LBR-001', predicted_decision: 'DO_NOT_SHIP', actual_outcome: 'rejected', predicted_loss_usd: 45000, actual_loss_usd: 42000, confidence: 0.95, sample_size: 10 },
  { shipment_id: 'PALM-ID-001', predicted_decision: 'REQUIRES_MANUAL_REVIEW', actual_outcome: 'rejected', predicted_loss_usd: 18000, actual_loss_usd: 35000, confidence: 0.45, sample_size: 10 },
  { shipment_id: 'BEANS-NG-001', predicted_decision: 'SHIP', actual_outcome: 'cleared', predicted_loss_usd: 1500, actual_loss_usd: 0, confidence: 0.78, sample_size: 10 }
];

// ==================== CORE FUNCTIONS ====================

/**
 * Initialize service
 */
function initialize() {
  console.log('Decision Accuracy Monitor initializing...');
  loadData();
  console.log(`Accuracy Monitor: ${outcomes.length} outcomes loaded`);
  return true;
}

/**
 * Load data from storage
 */
function loadData() {
  const dataPath = path.join(__dirname, '..', 'data', 'ground_truth.json');
  try {
    if (fs.existsSync(dataPath)) {
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      outcomes = data.outcomes || [];
    } else {
      outcomes = sampleOutcomes;
      saveData();
    }
  } catch (error) {
    console.log('Loading sample accuracy data...');
    outcomes = sampleOutcomes;
    saveData();
  }
}

/**
 * Save data to storage
 */
function saveData() {
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const dataPath = path.join(dataDir, 'ground_truth.json');
  fs.writeFileSync(dataPath, JSON.stringify({ outcomes }, null, 2));
}

/**
 * Attach actual outcome (ground truth) - called when shipment completes
 */
function attachOutcome(shipmentId, actualOutcome, actualLoss, predictedDecision = null, predictedLoss = null, confidence = null, sampleSize = null) {
  const existing = outcomes.find(o => o.shipment_id === shipmentId);
  
  if (existing) {
    existing.actual_outcome = actualOutcome;
    existing.actual_loss_usd = actualLoss;
    if (predictedDecision) existing.predicted_decision = predictedDecision;
    if (predictedLoss) existing.predicted_loss_usd = predictedLoss;
    if (confidence) existing.confidence = confidence;
    if (sampleSize) existing.sample_size = sampleSize;
  } else {
    outcomes.push({
      shipment_id: shipmentId,
      predicted_decision: predictedDecision,
      actual_outcome: actualOutcome,
      predicted_loss_usd: predictedLoss,
      actual_loss_usd: actualLoss,
      confidence: confidence,
      sample_size: sampleSize,
      timestamp: new Date().toISOString()
    });
  }
  
  saveData();
  return { success: true, shipment_id: shipmentId };
}

/**
 * Record prediction snapshot
 */
function recordPrediction(shipmentData, prediction) {
  const snapshot = {
    shipment_id: shipmentData.shipment_id || shipmentData.id,
    predicted_decision: prediction.decision,
    predicted_loss_usd: prediction.expectedLoss || 0,
    confidence: prediction.confidence,
    timestamp: new Date().toISOString()
  };
  
  // Store in outcomes as pending actual
  const existing = outcomes.find(o => o.shipment_id === snapshot.shipment_id);
  if (!existing) {
    outcomes.push({
      ...snapshot,
      actual_outcome: null,
      actual_loss_usd: null
    });
  }
  
  saveData();
  return snapshot;
}

/**
 * Compute accuracy metrics for a period
 */
function computeAccuracyMetrics(periodStart = null, periodEnd = null) {
  let rows = outcomes.filter(o => o.actual_outcome !== null);
  
  if (periodStart) {
    rows = rows.filter(o => new Date(o.timestamp) >= new Date(periodStart));
  }
  if (periodEnd) {
    rows = rows.filter(o => new Date(o.timestamp) <= new Date(periodEnd));
  }
  
  const sampleSize = rows.length;
  
  if (sampleSize === 0) {
    return {
      precision: 0,
      recall: 0,
      false_negative_rate: 0,
      avg_economic_error: 0,
      sample_size: 0
    };
  }
  
  let truePositives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;
  let totalBad = 0;
  let economicErrorSum = 0;
  
  rows.forEach(row => {
    const isBad = row.actual_outcome === 'rejected';
    const predictedBad = row.predicted_decision === 'DO_NOT_SHIP' || row.predicted_decision === 'REQUIRES_MANUAL_REVIEW';
    
    if (isBad) totalBad++;
    if (predictedBad && isBad) truePositives++;
    if (predictedBad && !isBad) falsePositives++;
    if (!predictedBad && isBad) falseNegatives++;
    
    if (row.actual_loss_usd > 0 && row.predicted_loss_usd > 0) {
      economicErrorSum += Math.abs(row.predicted_loss_usd - row.actual_loss_usd) / row.actual_loss_usd;
    }
  });
  
  const precision = truePositives / (truePositives + falsePositives || 1);
  const recall = truePositives / (truePositives + falseNegatives || 1);
  const falseNegativeRate = falseNegatives / (totalBad || 1);
  const avgEconomicError = economicErrorSum / (rows.length || 1);
  
  return {
    precision: Math.round(precision * 100) / 100,
    recall: Math.round(recall * 100) / 100,
    false_negative_rate: Math.round(falseNegativeRate * 100) / 100,
    avg_economic_error: Math.round(avgEconomicError * 100) / 100,
    sample_size: sampleSize,
    // Detailed breakdown
    true_positives: truePositives,
    false_positives: falsePositives,
    false_negatives: falseNegatives,
    total_bad_shipments: totalBad
  };
}

/**
 * Get accuracy metrics (for API)
 */
function getAccuracy(periodStart = null, periodEnd = null) {
  const metrics = computeAccuracyMetrics(periodStart, periodEnd);
  
  // Add health status based on thresholds
  let health = 'HEALTHY';
  if (metrics.false_negative_rate > config.fnrThreshold) {
    health = 'DEGRADED';
  }
  if (metrics.avg_economic_error > config.lossErrorThreshold) {
    health = health === 'HEALTHY' ? 'UNRELIABLE' : 'DEGRADED';
  }
  if (metrics.sample_size < config.minSampleSize) {
    health = 'LOW_DATA';
  }
  
  const meetsCriteria = 
    metrics.false_negative_rate < config.fnrThreshold &&
    metrics.avg_economic_error < config.lossErrorThreshold &&
    metrics.precision >= config.precisionTarget;
  
  return {
    ...metrics,
    model_health: health,
    meets_deployment_criteria: meetsCriteria,
    thresholds: {
      fnr_max: config.fnrThreshold,
      loss_error_max: config.lossErrorThreshold,
      precision_min: config.precisionTarget
    }
  };
}

/**
 * Get all outcomes
 */
function getOutcomes(filters = {}) {
  let result = [...outcomes];
  
  if (filters.actual_outcome) {
    result = result.filter(o => o.actual_outcome === filters.actual_outcome);
  }
  if (filters.predicted_decision) {
    result = result.filter(o => o.predicted_decision === filters.predicted_decision);
  }
  if (filters.has_actual === true) {
    result = result.filter(o => o.actual_outcome !== null);
  }
  
  return result;
}

/**
 * Get configuration
 */
function getConfig() {
  return {
    ...config,
    outcomes_count: outcomes.length
  };
}

// ==================== EXPORTS ====================

module.exports = {
  initialize,
  attachOutcome,
  recordPrediction,
  computeAccuracyMetrics,
  getAccuracy,
  getOutcomes,
  getConfig
};
