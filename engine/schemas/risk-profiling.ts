/**
 * Risk Profiling Schema
 * 
 * Dynamic risk assessment for shipments.
 * Augments, not replaces lab results and document validation.
 * 
 * Version: 1.0
 */

// =====================================================
// RISK ENTITY
// =====================================================

export interface PreviousShipment {
  shipmentId: string;
  date: string;
  outcome: 'READY' | 'BLOCKED' | 'WARNING';
  blockedFields?: string[];  // lab, document, metadata
}

export interface CountryRiskFlag {
  hazard: string;            // e.g., "aflatoxin", "ethylene_oxide"
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  lastReported: string;     // date of alert
}

export interface RiskProfile {
  exporterId: string;
  previousShipments: PreviousShipment[];
  countryRiskFlags: Record<string, CountryRiskFlag>;
  riskScore: number;         // computed score 0-100
}

// =====================================================
// RISK COMPUTATION
// =====================================================

/**
 * Compute risk score based on history
 * 
 * @param previousShipments - Array of past shipment outcomes
 * @param countryRiskFlags - Country-level risk flags
 * @returns number 0-100
 */
export function computeRiskScore(
  previousShipments: PreviousShipment[],
  countryRiskFlags: Record<string, CountryRiskFlag>
): number {
  let score = 0;
  
  // Base score from previous shipments (last 10)
  const recentShipments = previousShipments.slice(-10);
  
  if (recentShipments.length === 0) {
    score += 50; // Neutral for new exporters
  } else {
    const blockedCount = recentShipments.filter(s => s.outcome === 'BLOCKED').length;
    const warningCount = recentShipments.filter(s => s.outcome === 'WARNING').length;
    
    // More blocked = higher risk
    score += Math.max(0, 50 - (blockedCount * 10));
    score += Math.max(0, 20 - (warningCount * 5));
  }
  
  // Adjust for country risk flags
  const highSeverityCount = Object.values(countryRiskFlags).filter(f => f.severity === 'HIGH').length;
  const mediumSeverityCount = Object.values(countryRiskFlags).filter(f => f.severity === 'MEDIUM').length;
  
  score += highSeverityCount * 15;
  score += mediumSeverityCount * 5;
  
  return Math.min(100, Math.max(0, score));
}

// =====================================================
// RISK RULES
// =====================================================

export interface RiskFlag {
  code: string;
  severity: 'BLOCKER' | 'WARNING';
  source: 'EXPORTER_HISTORY' | 'COUNTRY_RISK' | 'COMMODITY_RISK' | 'RISK_SCORE';
  message: string;
}

/**
 * Evaluate risk profile and generate flags
 */
export function evaluateRisk(
  riskProfile: RiskProfile | null,
  product: string,
  destination: string
): { blockers: RiskFlag[]; warnings: RiskFlag[] } {
  const blockers: RiskFlag[] = [];
  const warnings: RiskFlag[] = [];
  
  if (!riskProfile) {
    // No risk profile = new exporter = warning
    warnings.push({
      code: 'NO_RISK_PROFILE',
      severity: 'WARNING',
      source: 'EXPORTER_HISTORY',
      message: 'No historical data for exporter - standard scrutiny applied'
    });
    return { blockers, warnings };
  }
  
  const previousShipments = riskProfile.previousShipments || [];
  const countryRiskFlags = riskProfile.countryRiskFlags || {};
  
  // 1. EXPORTER HISTORY - Check last 3 shipments
  const last3 = previousShipments.slice(-3);
  const blockedCount = last3.filter(s => s.outcome === 'BLOCKED').length;
  
  if (blockedCount === 3) {
    blockers.push({
      code: 'EXPORTER_HISTORY_BLOCKED',
      severity: 'BLOCKER',
      source: 'EXPORTER_HISTORY',
      message: 'Last 3 shipments blocked - exporter requires manual review'
    });
  } else if (blockedCount === 2) {
    warnings.push({
      code: 'EXPORTER_HISTORY_WARNING',
      severity: 'WARNING',
      source: 'EXPORTER_HISTORY',
      message: '2 of last 3 shipments blocked - increased scrutiny'
    });
  }
  
  // 2. COUNTRY RISK FLAGS
  Object.values(countryRiskFlags).forEach(flag => {
    if (flag.severity === 'HIGH') {
      blockers.push({
        code: 'COUNTRY_HIGH_RISK',
        severity: 'BLOCKER',
        source: 'COUNTRY_RISK',
        message: `Country flagged HIGH risk for ${flag.hazard} - manual review required`
      });
    } else if (flag.severity === 'MEDIUM') {
      warnings.push({
        code: 'COUNTRY_MEDIUM_RISK',
        severity: 'WARNING',
        source: 'COUNTRY_RISK',
        message: `Country has MEDIUM risk for ${flag.hazard} - verify additional checks`
      });
    }
  });
  
  // 3. COMMODITY-SPECIFIC RISK THRESHOLDS
  // Some commodities have higher baseline risk
  const highRiskCommodities = ['sesame', 'fish', 'spices'];
  if (highRiskCommodities.includes(product)) {
    warnings.push({
      code: 'COMMODITY_HIGH_RISK',
      severity: 'WARNING',
      source: 'COMMODITY_RISK',
      message: `${product} is a high-risk commodity - stricter thresholds apply`
    });
  }
  
  // 4. RISK SCORE THRESHOLD
  if (riskProfile.riskScore > 70) {
    warnings.push({
      code: 'RISK_SCORE_ELEVATED',
      severity: 'WARNING',
      source: 'RISK_SCORE',
      message: `Risk score ${riskProfile.riskScore} elevated - additional verification recommended`
    });
  }
  
  return { blockers, warnings };
}

// =====================================================
// EXAMPLE RISK PROFILES
// =====================================================

export const EXAMPLE_RISK_PROFILES: Record<string, RiskProfile> = {
  // Good exporter - clean history
  'exporter_good': {
    exporterId: 'exporter_good',
    previousShipments: [
      { shipmentId: 'shp_001', date: '2026-01-15', outcome: 'READY' },
      { shipmentId: 'shp_002', date: '2026-02-10', outcome: 'READY' },
      { shipmentId: 'shp_003', date: '2026-03-01', outcome: 'READY' }
    ],
    countryRiskFlags: {},
    riskScore: 20
  },
  
  // Problematic exporter - recent blocks
  'exporter_problem': {
    exporterId: 'exporter_problem',
    previousShipments: [
      { shipmentId: 'shp_010', date: '2026-03-20', outcome: 'BLOCKED', blockedFields: ['labResults'] },
      { shipmentId: 'shp_011', date: '2026-03-22', outcome: 'BLOCKED', blockedFields: ['documents'] },
      { shipmentId: 'shp_012', date: '2026-03-25', outcome: 'BLOCKED', blockedFields: ['labResults', 'documents'] }
    ],
    countryRiskFlags: {},
    riskScore: 90
  },
  
  // Exporter from high-risk country
  'exporter_high_risk_country': {
    exporterId: 'exporter_high_risk_country',
    previousShipments: [],
    countryRiskFlags: {
      'aflatoxin': { hazard: 'aflatoxin', severity: 'HIGH', lastReported: '2026-03-15' }
    },
    riskScore: 75
  }
};

// =====================================================
// MRL THRESHOLD ADJUSTMENT
// =====================================================

/**
 * Adjust MRL threshold based on risk profile
 * 
 * Higher risk = stricter thresholds (lower limits)
 */
export function getAdjustedMRL(
  baseLimit: number,
  riskProfile: RiskProfile | null,
  commodity: string
): number {
  if (!riskProfile || riskProfile.riskScore < 50) {
    return baseLimit; // Use standard threshold
  }
  
  // Increase scrutiny for high-risk exporters
  // Reduce limit by 20% for medium risk, 40% for high risk
  const reduction = riskProfile.riskScore > 70 ? 0.4 : 0.2;
  return baseLimit * (1 - reduction);
}

// =====================================================
// INTEGRATION EXAMPLE
// =====================================================

/**
 * Full shipment validation including risk
 */
export function validateWithRisk(
  shipment: any,
  riskProfile: RiskProfile | null
) {
  // 1. Evaluate risk first
  const riskResult = evaluateRisk(riskProfile, shipment.product.category, shipment.corridor.destinationCountry);
  
  // 2. If risk blockers exist, return immediately
  if (riskResult.blockers.length > 0) {
    return {
      status: 'BLOCKED_BY_RISK',
      blockers: riskResult.blockers,
      warnings: riskResult.warnings
    };
  }
  
  // 3. Continue with lab + document validation
  // ... (lab and document validation would happen here)
  
  return {
    status: 'CONTINUE_VALIDATION',
    riskWarnings: riskResult.warnings
  };
}