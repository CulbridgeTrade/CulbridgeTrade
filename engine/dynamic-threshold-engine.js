/**
 * Dynamic Threshold Engine
 * 
 * Data-driven threshold adjustment based on:
 * 1. Versioned threshold tables (product/corridor/hazard)
 * 2. Risk profile (exporter history)
 * 3. RASFF alerts (country/corridor risk)
 * 4. Corridor-specific rules
 * 
 * Version: 1.0
 */

const fs = require('fs');
const path = require('path');

// Load RASFF data
const RASFF_DATA_PATH = path.join(__dirname, '..', 'data', 'rasff_alerts.json');

// =====================================================
// EMBEDDED THRESHOLD TYPES (from threshold.ts)
// =====================================================

const DEFAULT_ADJUSTMENT_RULES = {
  // If exporter has 3+ blockers, reduce thresholds by 20%
  previousBlockersFactor: {
    threshold: 3,
    factor: 0.8,
    hazards: ['aflatoxinB1', 'aflatoxinTotal', 'salmonella']
  },
  // If country has HIGH risk flag for hazard, apply stricter limit
  countryRiskFactors: {
    'HIGH': 0.5,   // 50% of original limit
    'MEDIUM': 0.8, // 80% of original limit
    'LOW': 1.0     // no adjustment
  },
  // If RASFF rejection rate > 0.5 for corridor/hazard, zero tolerance
  rasffThreshold: {
    rejectionRateThreshold: 0.5,
    action: 'ZERO_TOLERANCE'
  },
  // Maximum reduction cap
  maxReductionCap: 0.5  // Never reduce below 50% of original
};

// =====================================================
// EMBEDDED THRESHOLD DATA
// =====================================================

const EXAMPLE_THRESHOLDS = [
  // Sesame → NL (EU Regulation 2023/915)
  {
    productCategory: 'sesame',
    corridorId: 'NG-NL',
    hazard: 'aflatoxinB1',
    maxAllowed: 2.0,
    unit: 'μg/kg',
    isZeroTolerance: false,
    version: '1.0.0',
    effectiveDate: '2024-01-01',
    regulatoryReference: 'EU 2023/915'
  },
  {
    productCategory: 'sesame',
    corridorId: 'NG-NL',
    hazard: 'aflatoxinTotal',
    maxAllowed: 4.0,
    unit: 'μg/kg',
    isZeroTolerance: false,
    version: '1.0.0',
    effectiveDate: '2024-01-01',
    regulatoryReference: 'EU 2023/915'
  },
  {
    productCategory: 'sesame',
    corridorId: 'NG-NL',
    hazard: 'salmonella',
    maxAllowed: 0,
    unit: 'cfu/25g',
    isZeroTolerance: true,
    version: '1.0.0',
    effectiveDate: '2024-01-01',
    regulatoryReference: 'EU 2023/915'
  },
  // Groundnuts → NL
  {
    productCategory: 'groundnuts',
    corridorId: 'NG-NL',
    hazard: 'aflatoxinB1',
    maxAllowed: 8.0,
    unit: 'μg/kg',
    isZeroTolerance: false,
    version: '1.0.0',
    effectiveDate: '2024-01-01',
    regulatoryReference: 'EU 2023/915'
  },
  // Cocoa → NL (EU 2023/914)
  {
    productCategory: 'cocoaBeans',
    corridorId: 'NG-NL',
    hazard: 'aflatoxinB1',
    maxAllowed: 5.0,
    unit: 'μg/kg',
    isZeroTolerance: false,
    version: '1.0.0',
    effectiveDate: '2024-01-01',
    regulatoryReference: 'EU 2023/914'
  },
  {
    productCategory: 'cocoaBeans',
    corridorId: 'NG-NL',
    hazard: 'cadmium',
    maxAllowed: 0.5,
    unit: 'mg/kg',
    isZeroTolerance: false,
    version: '1.0.0',
    effectiveDate: '2024-01-01',
    regulatoryReference: 'EU 2023/914'
  },
  // Cashew → NL
  {
    productCategory: 'cashew',
    corridorId: 'NG-NL',
    hazard: 'aflatoxinB1',
    maxAllowed: 5.0,
    unit: 'μg/kg',
    isZeroTolerance: false,
    version: '1.0.0',
    effectiveDate: '2024-01-01',
    regulatoryReference: 'EU 2023/915'
  },
  // Ginger → NL
  {
    productCategory: 'ginger',
    corridorId: 'NG-NL',
    hazard: 'pesticide',
    maxAllowed: 0.05,
    unit: 'mg/kg',
    isZeroTolerance: false,
    version: '1.0.0',
    effectiveDate: '2024-01-01',
    regulatoryReference: 'EU 2023/915'
  },
  // Sesame → NL - Ethylene Oxide
  {
    productCategory: 'sesame',
    corridorId: 'NG-NL',
    hazard: 'ethyleneOxide',
    maxAllowed: 0.1,
    unit: 'mg/kg',
    isZeroTolerance: false,
    version: '1.0.0',
    effectiveDate: '2024-01-01',
    regulatoryReference: 'EU 2023/915'
  },
  // Sesame → DE - Ethylene Oxide
  {
    productCategory: 'sesame',
    corridorId: 'NG-DE',
    hazard: 'ethyleneOxide',
    maxAllowed: 0.1,
    unit: 'mg/kg',
    isZeroTolerance: false,
    version: '1.0.0',
    effectiveDate: '2024-01-01',
    regulatoryReference: 'EU 2023/915'
  },
  // Sesame → DE - Aflatoxin (same as NL)
  {
    productCategory: 'sesame',
    corridorId: 'NG-DE',
    hazard: 'aflatoxinB1',
    maxAllowed: 2.0,
    unit: 'μg/kg',
    isZeroTolerance: false,
    version: '1.0.0',
    effectiveDate: '2024-01-01',
    regulatoryReference: 'EU 2023/915'
  },
  {
    productCategory: 'sesame',
    corridorId: 'NG-DE',
    hazard: 'aflatoxinTotal',
    maxAllowed: 4.0,
    unit: 'μg/kg',
    isZeroTolerance: false,
    version: '1.0.0',
    effectiveDate: '2024-01-01',
    regulatoryReference: 'EU 2023/915'
  }
];

// =====================================================
// THRESHOLD STORAGE
// =====================================================

let thresholdTable = [];
let thresholdVersions = [];

/**
 * Initialize threshold table
 */
function initializeThresholds() {
  thresholdTable = [...EXAMPLE_THRESHOLDS];
  thresholdVersions = [{
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    createdBy: 'system',
    changes: 'Initial threshold table'
  }];
  console.log(`[ThresholdEngine] Initialized with ${thresholdTable.length} thresholds`);
}

/**
 * Load thresholds from external source (simulated)
 */
function loadExternalThresholds() {
  // In production, this would fetch from a database or API
  // For now, we use the example thresholds
  initializeThresholds();
}

/**
 * Get threshold for product/corridor/hazard
 */
function getThreshold(productCategory, originCountry, destinationCountry, hazard) {
  // Normalize country codes - handle both full names and codes
  const normalizeCountry = (country) => {
    const mapping = {
      'Nigeria': 'NG',
      'Netherlands': 'NL',
      'Germany': 'DE',
      'Ghana': 'GH',
      'Ethiopia': 'ET',
      'Brazil': 'BR'
    };
    return mapping[country] || country;
  };
  
  const originCode = normalizeCountry(originCountry);
  const destCode = normalizeCountry(destinationCountry);
  const corridorId = `${originCode}-${destCode}`;
  
  // Find matching threshold
  const threshold = thresholdTable.find(t => 
    t.productCategory === productCategory &&
    t.corridorId === corridorId &&
    t.hazard === hazard
  );
  
  if (!threshold) {
    // Fallback to product-only (generic)
    const genericThreshold = thresholdTable.find(t => 
      t.productCategory === productCategory &&
      t.hazard === hazard &&
      !t.corridorId.includes('-')
    );
    
    if (genericThreshold) {
      return { ...genericThreshold, corridorId };
    }
    
    // Return null if no threshold found
    return null;
  }
  
  return threshold;
}

// =====================================================
// RISK PROFILE PROCESSING
// =====================================================

/**
 * Build risk profile from shipment data
 */
function buildRiskProfile(shipment) {
  const { exporterId, originCountry, destinationCountry, productCategory } = shipment;
  const corridorId = getCorridorId(originCountry, destinationCountry);
  
  // Load RASFF data
  let rasffAlerts = [];
  try {
    const rasffData = JSON.parse(fs.readFileSync(RASFF_DATA_PATH, 'utf8'));
    rasffAlerts = rasffData.alerts || [];
  } catch (e) {
    console.warn('[ThresholdEngine] Could not load RASFF data:', e.message);
  }
  
  // Filter RASFF alerts for this origin/product
  const relevantAlerts = rasffAlerts.filter(a => 
    a.origin_country === originCountry && 
    a.product?.toLowerCase().includes(productCategory?.toLowerCase())
  );
  
  // Calculate rejection rate per hazard
  const hazardStats = {};
  relevantAlerts.forEach(alert => {
    const hazard = mapHazardType(alert.hazard);
    if (!hazardStats[hazard]) {
      hazardStats[hazard] = { count: 0, rejected: 0 };
    }
    hazardStats[hazard].count++;
    if (alert.action === 'rejected' || alert.action === 'destroyed') {
      hazardStats[hazard].rejected++;
    }
  });
  
  // Build hazard-specific RASFF summaries
  const rasffSummaries = Object.entries(hazardStats).map(([hazard, stats]) => ({
    product: productCategory,
    originCountry,
    hazard,
    alertCount: stats.count,
    lastAlertDate: relevantAlerts[0]?.date || null,
    rejectionRate: stats.count > 0 ? stats.rejected / stats.count : 0
  }));
  
  // Determine country risk flags based on RASFF
  const countryRiskFlags = {};
  rasffSummaries.forEach(summary => {
    if (summary.rejectionRate > 0.5) {
      countryRiskFlags[summary.hazard] = 'HIGH';
    } else if (summary.rejectionRate > 0.2) {
      countryRiskFlags[summary.hazard] = 'MEDIUM';
    } else {
      countryRiskFlags[summary.hazard] = 'LOW';
    }
  });
  
  // In production, would fetch from database
  // For now, simulate based on RASFF
  const previousBlockersCount = relevantAlerts.length > 3 ? 3 : Math.floor(relevantAlerts.length / 2);
  
  return {
    exporterId,
    previousBlockersCount,
    previousWarningsCount: 0,
    countryRiskFlags,
    corridorRiskFlags: {},
    rasffAlerts: rasffSummaries,
    computedRiskScore: calculateRiskScore(rasffSummaries, previousBlockersCount)
  };
}

/**
 * Map RASFF hazard string to HazardType
 */
function mapHazardType(rasffHazard) {
  const mapping = {
    'salmonella': 'salmonella',
    'aflatoxin': 'aflatoxinB1',
    'pesticide': 'pesticide',
    'heavy metals': 'heavyMetals',
    'cadmium': 'cadmium',
    'lead': 'lead',
    'mercury': 'mercury',
    'dioxins': 'dioxins',
    'mycotoxins': 'mycotoxins',
    'ethylene_oxide': 'ethyleneOxide',
    'ethylene oxide': 'ethyleneOxide'
  };
  return mapping[rasffHazard?.toLowerCase()] || 'pesticide';
}

/**
 * Calculate risk score from RASFF data
 */
function calculateRiskScore(rasffAlerts, previousBlockers) {
  let score = 0;
  
  // Base score from RASFF alerts
  rasffAlerts.forEach(alert => {
    score += alert.rejectionRate * 20;
  });
  
  // Add for previous blockers
  score += previousBlockers * 10;
  
  return Math.min(100, Math.max(0, score));
}

// =====================================================
// THRESHOLD ADJUSTMENT LOGIC
// =====================================================

/**
 * Adjust threshold based on risk profile
 */
function adjustThreshold(baseThreshold, riskProfile, hazard) {
  const appliedRules = [];
  let adjustmentFactor = 1.0;
  let reason = 'Base threshold applied';
  
  // 1. Check exporter history (previous blockers)
  if (riskProfile.previousBlockersCount >= DEFAULT_ADJUSTMENT_RULES.previousBlockersFactor.threshold) {
    const ruleFactor = DEFAULT_ADJUSTMENT_RULES.previousBlockersFactor.factor;
    const applicableHazards = DEFAULT_ADJUSTMENT_RULES.previousBlockersFactor.hazards;
    
    if (applicableHazards.includes(hazard)) {
      adjustmentFactor *= ruleFactor;
      appliedRules.push(`PREVIOUS_BLOCKERS_${riskProfile.previousBlockersCount}`);
      reason = `Exporter has ${riskProfile.previousBlockersCount} previous blockers - stricter limits applied`;
    }
  }
  
  // 2. Check country risk flags
  const countryRisk = riskProfile.countryRiskFlags[hazard];
  if (countryRisk) {
    const riskFactor = DEFAULT_ADJUSTMENT_RULES.countryRiskFactors[countryRisk];
    if (riskFactor < adjustmentFactor) {
      adjustmentFactor *= riskFactor;
      appliedRules.push(`COUNTRY_RISK_${countryRisk}`);
      reason = `Country has ${countryRisk} risk for ${hazard} - threshold reduced`;
    }
  }
  
  // 3. Check RASFF rejection rate
  const rasffAlert = riskProfile.rasffAlerts.find(a => a.hazard === hazard);
  if (rasffAlert && rasffAlert.rejectionRate > DEFAULT_ADJUSTMENT_RULES.rasffThreshold.rejectionRateThreshold) {
    // Apply zero tolerance
    adjustmentFactor = 0;
    appliedRules.push(`RASFF_HIGH_REJECTION_${Math.round(rasffAlert.rejectionRate * 100)}%`);
    reason = `RASFF rejection rate ${Math.round(rasffAlert.rejectionRate * 100)}% exceeds threshold - zero tolerance applied`;
  }
  
  // 4. Apply maximum reduction cap
  if (adjustmentFactor < DEFAULT_ADJUSTMENT_RULES.maxReductionCap) {
    adjustmentFactor = DEFAULT_ADJUSTMENT_RULES.maxReductionCap;
    appliedRules.push('MAX_REDUCTION_CAP');
    reason = 'Maximum reduction cap applied';
  }
  
  const adjustedValue = baseThreshold.maxAllowed * adjustmentFactor;
  
  return {
    baseThreshold: {
      value: baseThreshold.maxAllowed,
      unit: baseThreshold.unit,
      isZeroTolerance: baseThreshold.isZeroTolerance
    },
    adjustedThreshold: adjustedValue,
    adjustmentFactor,
    reason,
    appliedRules,
    timestamp: new Date().toISOString()
  };
}

// =====================================================
// MAIN EVALUATION FUNCTION
// =====================================================

/**
 * Adjust all thresholds for a shipment based on risk profile
 * 
 * @param {Object} shipment - Shipment data with product, origin, destination
 * @returns {Object} Adjusted thresholds keyed by hazard
 */
function adjustThresholdsForShipment(shipment) {
  const { productCategory, originCountry, destinationCountry } = shipment;
  
  // Build risk profile
  const riskProfile = buildRiskProfile(shipment);
  console.log(`[ThresholdEngine] Risk profile for ${shipment.exporterId}: score=${riskProfile.computedRiskScore}`);
  
  // Get all relevant hazards from threshold table
  const productThresholds = thresholdTable.filter(t => 
    t.productCategory === productCategory
  );
  
  const adjustedThresholds = {};
  
  productThresholds.forEach(threshold => {
    const adjustment = adjustThreshold(threshold, riskProfile, threshold.hazard);
    adjustedThresholds[threshold.hazard] = adjustment;
    
    console.log(`  ${threshold.hazard}: ${threshold.maxAllowed} → ${adjustment.adjustedThreshold.toFixed(2)} (${adjustment.reason})`);
  });
  
  return {
    adjustedThresholds,
    riskProfile,
    version: thresholdVersions[thresholdVersions.length - 1].version
  };
}

/**
 * Evaluate a single lab result against adjusted threshold
 */
function evaluateLabResult(labResult, adjustedThreshold, hazard) {
  const { value } = labResult;
  const { adjustedThreshold: limit, baseThreshold, adjustmentFactor } = adjustedThreshold;
  
  // Check zero tolerance first
  if (baseThreshold.isZeroTolerance && value > 0) {
    return {
      passed: false,
      result: 'BLOCKER',
      message: `${hazard} detected (${value}) - zero tolerance in effect`,
      details: {
        value,
        limit: 0,
        adjustmentFactor,
        baseLimit: baseThreshold.value
      }
    };
  }
  
  // Compare against adjusted limit
  if (value > limit) {
    return {
      passed: false,
      result: 'BLOCKER',
      message: `${hazard} exceeds adjusted limit: ${value} > ${limit.toFixed(2)} ${baseThreshold.unit}`,
      details: {
        value,
        limit: limit.toFixed(2),
        adjustmentFactor,
        baseLimit: baseThreshold.value
      }
    };
  }
  
  return {
    passed: true,
    result: 'PASS',
    message: `${hazard} within limits: ${value} <= ${limit.toFixed(2)} ${baseThreshold.unit}`,
    details: {
      value,
      limit: limit.toFixed(2),
      adjustmentFactor,
      baseLimit: baseThreshold.value
    }
  };
}

// =====================================================
// AUDIT LOGGING
// =====================================================

const AUDIT_PATH = path.join(__dirname, '..', 'data', 'threshold_audit.json');

/**
 * Log threshold adjustment to audit
 */
function logThresholdAudit(shipmentId, ruleId, evaluationResult) {
  const auditEntry = {
    auditId: `THRESHOLD_AUDIT-${Date.now()}`,
    shipmentId,
    ruleId,
    baseThreshold: evaluationResult.details?.baseLimit,
    adjustedThreshold: evaluationResult.details?.limit,
    adjustmentFactor: evaluationResult.details?.adjustmentFactor,
    inputValue: evaluationResult.details?.value,
    result: evaluationResult.result,
    timestamp: new Date().toISOString()
  };
  
  // Append to audit log
  try {
    let audits = [];
    if (fs.existsSync(AUDIT_PATH)) {
      audits = JSON.parse(fs.readFileSync(AUDIT_PATH, 'utf8'));
    }
    audits.unshift(auditEntry);
    audits = audits.slice(0, 1000); // Keep last 1000
    fs.writeFileSync(AUDIT_PATH, JSON.stringify(audits, null, 2));
  } catch (e) {
    console.error('[ThresholdEngine] Failed to write audit:', e.message);
  }
  
  return auditEntry;
}

/**
 * Get threshold audit for shipment
 */
function getThresholdAudit(shipmentId) {
  try {
    if (!fs.existsSync(AUDIT_PATH)) return [];
    const audits = JSON.parse(fs.readFileSync(AUDIT_PATH, 'utf8'));
    return audits.filter(a => a.shipmentId === shipmentId);
  } catch (e) {
    return [];
  }
}

// =====================================================
// THRESHOLD MANAGEMENT
// =====================================================

/**
 * Update threshold (creates new version)
 */
function updateThreshold(productCategory, corridorId, hazard, newValue, regulatoryRef) {
  const existingIndex = thresholdTable.findIndex(t => 
    t.productCategory === productCategory &&
    t.corridorId === corridorId &&
    t.hazard === hazard
  );
  
  const version = thresholdVersions[thresholdVersions.length - 1].version;
  const [major, minor, patch] = version.split('.').map(Number);
  const newVersion = `${major}.${minor}.${patch + 1}`;
  
  const newThreshold = {
    productCategory,
    corridorId,
    hazard,
    maxAllowed: newValue,
    unit: 'μg/kg', // default
    isZeroTolerance: false,
    version: newVersion,
    effectiveDate: new Date().toISOString(),
    regulatoryReference: regulatoryRef
  };
  
  if (existingIndex >= 0) {
    thresholdTable[existingIndex] = newThreshold;
  } else {
    thresholdTable.push(newThreshold);
  }
  
  thresholdVersions.push({
    version: newVersion,
    createdAt: new Date().toISOString(),
    createdBy: 'system',
    changes: `Updated ${productCategory}/${corridorId}/${hazard} to ${newValue}`
  });
  
  console.log(`[ThresholdEngine] Updated threshold to v${newVersion}`);
  return newThreshold;
}

/**
 * Get threshold table version info
 */
function getThresholdVersion() {
  return {
    version: thresholdVersions[thresholdVersions.length - 1].version,
    thresholdCount: thresholdTable.length,
    lastUpdated: thresholdVersions[thresholdVersions.length - 1].createdAt
  };
}

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Get corridor ID string from origin/destination
 */
function getCorridorId(origin, destination) {
  return `${origin.toUpperCase()}-${destination.toUpperCase()}`;
}

/**
 * Get threshold version key
 */
function getThresholdKey(product, corridor, hazard) {
  return `${product}:${corridor}:${hazard}`;
}

// =====================================================
// INITIALIZATION
// =====================================================

initializeThresholds();

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  // Core functions
  getThreshold,
  adjustThresholdsForShipment,
  evaluateLabResult,
  
  // Audit
  logThresholdAudit,
  getThresholdAudit,
  
  // Management
  updateThreshold,
  getThresholdVersion,
  loadExternalThresholds,
  
  // Helpers
  getCorridorId,
  buildRiskProfile
};