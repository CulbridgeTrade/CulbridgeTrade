/**
 * XGBoost Integration Module for Culbridge
 * 
 * This module provides predictive risk scoring for EU shipments using
 * gradient boosting (inspired by XGBoost) for shipment rejection prediction.
 * 
 * Features:
 * - Predictive risk scoring (0-1 probability)
 * - Feature importance analysis
 * - Historical pattern learning
 * - Integration with deterministic engine
 * 
 * Note: This is a pure JavaScript implementation. For production,
 * consider using Python XGBoost via API or native bindings.
 */

const crypto = require('crypto');

// Configuration
const config = {
  riskThreshold: 0.6,  // Threshold for flagging high-risk shipments
  confidenceLevel: 0.8,
  modelTrained: false,
  features: [
    'lab_aflatoxin_total',
    'lab_pesticide_count',
    'lab_salmonella_present',
    'exporter_risk_score',
    'destination_port',
    'batch_number',
    'product_type',
    'seasonality',
    'historical_rejections'
  ]
};

// In-memory model storage
const modelData = {
  featureWeights: {},
  trees: [],
  trainingData: [],
  predictions: []
};

/**
 * Initialize XGBoost model with default weights
 * Based on RASFF alert patterns and lab result correlations
 */
function initializeModel() {
  // Default feature weights based on EU regulatory concerns
  modelData.featureWeights = {
    // Lab results (highest importance)
    lab_aflatoxin_total: 0.35,
    lab_pesticide_count: 0.20,
    lab_salmonella_present: 0.15,
    
    // Exporter history
    exporter_risk_score: 0.15,
    historical_rejections: 0.10,
    
    // Shipment metadata
    destination_port: 0.03,
    product_type: 0.02
  };
  
  modelData.modelTrained = true;
  console.log('XGBoost model initialized with default weights');
  return true;
}

/**
 * Train the model with historical data
 * @param {Array} trainingData - Array of {features, label} objects
 */
async function trainModel(trainingData) {
  if (!trainingData || trainingData.length === 0) {
    console.log('No training data provided, using default model');
    initializeModel();
    return { status: 'default' };
  }
  
  modelData.trainingData = trainingData;
  
  // Simple gradient boosting simulation
  // In production, this would use actual XGBoost
  
  // Calculate feature importance from data
  const featureCounts = {};
  const featurePositiveCounts = {};
  
  for (const record of trainingData) {
    for (const feature of config.features) {
      if (record.features[feature] !== undefined && record.features[feature] !== null) {
        if (!featureCounts[feature]) {
          featureCounts[feature] = 0;
          featurePositiveCounts[feature] = 0;
        }
        featureCounts[feature]++;
        if (record.label === 1) {
          featurePositiveCounts[feature]++;
        }
      }
    }
  }
  
  // Update weights based on data
  for (const feature of config.features) {
    if (featureCounts[feature] > 0) {
      const positiveRate = featurePositiveCounts[feature] / featureCounts[feature];
      // Adjust weight based on correlation with rejection
      modelData.featureWeights[feature] = Math.min(0.5, Math.max(0.01, positiveRate));
    }
  }
  
  modelData.modelTrained = true;
  
  return {
    status: 'trained',
    records_used: trainingData.length,
    features: config.features
  };
}

/**
 * Predict risk score for a shipment
 * @param {Object} features - Shipment features
 * @returns {Object} Risk prediction
 */
async function predictRisk(features) {
  if (!modelData.modelTrained) {
    initializeModel();
  }
  
  const timestamp = new Date().toISOString();
  let riskScore = 0;
  const featureScores = {};
  
  // Calculate risk based on feature weights and values
  for (const [feature, weight] of Object.entries(modelData.featureWeights)) {
    let value = features[feature];
    let score = 0;
    
    if (value === undefined || value === null) {
      score = 0.3; // Default unknown score
    } else if (feature === 'lab_aflatoxin_total') {
      // Higher aflatoxin = higher risk
      if (value > 15) score = 0.95;
      else if (value > 10) score = 0.8;
      else if (value > 5) score = 0.5;
      else score = 0.2;
    } else if (feature === 'lab_pesticide_count') {
      // More pesticides = higher risk
      if (value > 5) score = 0.9;
      else if (value > 3) score = 0.7;
      else if (value > 1) score = 0.4;
      else score = 0.1;
    } else if (feature === 'lab_salmonella_present') {
      // Salmonella positive = very high risk
      score = value === true || value === 'positive' || value === 1 ? 0.95 : 0.1;
    } else if (feature === 'exporter_risk_score') {
      // Higher exporter risk = higher shipment risk
      score = value > 70 ? 0.8 : value > 40 ? 0.5 : 0.2;
    } else if (feature === 'historical_rejections') {
      // More rejections = higher risk
      if (value > 5) score = 0.9;
      else if (value > 2) score = 0.7;
      else if (value > 0) score = 0.4;
      else score = 0.1;
    } else if (feature === 'destination_port') {
      // Certain ports have higher rejection rates
      const highRiskPorts = ['Rotterdam', 'Hamburg', 'Antwerp'];
      score = highRiskPorts.includes(value) ? 0.6 : 0.3;
    } else if (feature === 'product_type') {
      // Certain products have higher risk
      const highRiskProducts = ['sesame', 'cocoa', 'nuts'];
      score = highRiskProducts.includes(value?.toLowerCase()) ? 0.5 : 0.3;
    } else if (feature === 'seasonality') {
      // Seasonal patterns
      const highRiskSeasons = ['monsoon', 'rainy'];
      score = highRiskSeasons.includes(value?.toLowerCase()) ? 0.7 : 0.3;
    } else {
      // Default scoring
      if (typeof value === 'number') {
        score = value > 50 ? 0.7 : value > 20 ? 0.4 : 0.2;
      } else {
        score = 0.3;
      }
    }
    
    featureScores[feature] = score;
    riskScore += score * weight;
  }
  
  // Normalize to 0-1 range
  riskScore = Math.min(1, Math.max(0, riskScore));
  
  // Calculate confidence based on data completeness
  let dataCompleteness = 0;
  for (const feature of config.features) {
    if (features[feature] !== undefined && features[feature] !== null) {
      dataCompleteness++;
    }
  }
  const confidence = dataCompleteness / config.features.length;
  
  // Determine risk level
  let riskLevel = 'low';
  if (riskScore >= config.riskThreshold) {
    riskLevel = 'high';
  } else if (riskScore >= 0.4) {
    riskLevel = 'medium';
  }
  
  const prediction = {
    risk_score: Math.round(riskScore * 100) / 100,
    risk_level: riskLevel,
    confidence: Math.round(confidence * 100) / 100,
    threshold_used: config.riskThreshold,
    feature_contributions: featureScores,
    predicted_at: timestamp,
    recommendations: []
  };
  
  // Generate recommendations
  if (riskScore >= config.riskThreshold) {
    prediction.recommendations.push('Flag shipment for additional inspection');
    prediction.recommendations.push('Consider mandatory lab retest before shipment');
  }
  if (features.lab_aflatoxin_total > 10) {
    prediction.recommendations.push('Aflatoxin levels require attention');
  }
  if (features.lab_salmonella_present) {
    prediction.recommendations.push('Salmonella detected - requires immediate action');
  }
  if (confidence < 0.5) {
    prediction.recommendations.push('Insufficient data for reliable prediction');
  }
  
  // Store prediction
  modelData.predictions.push({
    shipment_id: features.shipment_id,
    features,
    prediction,
    timestamp
  });
  
  return prediction;
}

/**
 * Batch predict for multiple shipments
 * @param {Array} shipments - Array of shipment features
 * @returns {Array} Array of predictions
 */
async function batchPredict(shipments) {
  const results = [];
  for (const shipment of shipments) {
    const prediction = await predictRisk(shipment);
    results.push({
      shipment_id: shipment.shipment_id || shipment.id,
      ...prediction
    });
  }
  return results;
}

/**
 * Get feature importance
 * @returns {Object} Feature importance scores
 */
function getFeatureImportance() {
  return { ...modelData.featureWeights };
}

/**
 * Get prediction history
 * @param {number} limit - Number of predictions to return
 * @returns {Array} Prediction history
 */
function getPredictionHistory(limit = 50) {
  return modelData.predictions.slice(-limit);
}

/**
 * Retrain model with new data
 * @param {Array} newTrainingData - Additional training data
 */
async function retrain(newTrainingData) {
  const allData = [...modelData.trainingData, ...newTrainingData];
  return await trainModel(allData);
}

/**
 * Set custom risk threshold
 * @param {number} threshold - New threshold (0-1)
 */
function setRiskThreshold(threshold) {
  if (threshold < 0 || threshold > 1) {
    throw new Error('Threshold must be between 0 and 1');
  }
  config.riskThreshold = threshold;
  return { threshold: config.riskThreshold };
}

/**
 * Get model configuration
 */
function getConfig() {
  return {
    riskThreshold: config.riskThreshold,
    features: config.features,
    modelTrained: modelData.modelTrained,
    predictionsCount: modelData.predictions.length
  };
}

/**
 * Predict with deterministic engine integration
 * @param {Object} shipmentData - Combined shipment and lab data
 * @param {Object} deterministicResult - Result from deterministic engine
 * @returns {Object} Combined decision
 */
async function predictWithIntegration(shipmentData, deterministicResult) {
  // Extract features from shipment
  const features = {
    shipment_id: shipmentData.id,
    lab_aflatoxin_total: shipmentData.lab_aflatoxin_total,
    lab_pesticide_count: shipmentData.lab_pesticide_count,
    lab_salmonella_present: shipmentData.lab_salmonella_present,
    exporter_risk_score: shipmentData.exporter_risk_score,
    destination_port: shipmentData.destination,
    product_type: shipmentData.product,
    batch_number: shipmentData.batch_number,
    historical_rejections: shipmentData.historical_rejections || 0,
    seasonality: shipmentData.seasonality || 'normal'
  };
  
  // Get XGBoost prediction
  const xgboostResult = await predictRisk(features);
  
  // Combined decision
  const combinedDecision = {
    shipment_id: shipmentData.id,
    deterministic_status: deterministicResult.status,
    xgboost_risk_score: xgboostResult.risk_score,
    xgboost_risk_level: xgboostResult.risk_level,
    final_recommendation: determineRecommendation(deterministicResult, xgboostResult),
    deterministic_findings: deterministicResult,
    xgboost_insights: xgboostResult,
    timestamp: new Date().toISOString()
  };
  
  return combinedDecision;
}

function determineRecommendation(deterministicResult, xgboostResult) {
  // Hard blocks always take precedence
  if (deterministicResult.status === 'BLOCKED') {
    return {
      action: 'BLOCK',
      reason: 'Deterministic compliance failure',
      priority: 'CRITICAL'
    };
  }
  
  // Check XGBoost risk
  if (xgboostResult.risk_level === 'high') {
    return {
      action: 'ADDITIONAL_INSPECTION',
      reason: 'High predicted risk - recommend inspection',
      priority: 'HIGH'
    };
  }
  
  if (deterministicResult.status === 'WARNING') {
    return {
      action: 'REVIEW',
      reason: 'Warning in deterministic check',
      priority: 'MEDIUM'
    };
  }
  
  return {
    action: 'APPROVE',
    reason: 'Low risk - standard processing',
    priority: 'NORMAL'
  };
}

module.exports = {
  initializeModel,
  trainModel,
  predictRisk,
  batchPredict,
  getFeatureImportance,
  getPredictionHistory,
  retrain,
  setRiskThreshold,
  getConfig,
  predictWithIntegration
};
