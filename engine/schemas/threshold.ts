/**
 * Threshold Schema - Versioned Dynamic Thresholds
 * 
 * Data-driven MRL/contamination limits that can be adjusted
 * based on risk profile, RASFF alerts, and corridor-specific rules.
 * 
 * Version: 1.0
 */

// =====================================================
// THRESHOLD TYPES
// =====================================================

/**
 * Hazard types supported by the engine
 */
export type HazardType = 
  | 'aflatoxinB1' 
  | 'aflatoxinTotal'
  | 'salmonella'
  | 'ethyleneOxide'
  | 'pesticide'
  | 'heavyMetals'
  | 'cadmium'
  | 'lead'
  | 'mercury'
  | 'dioxins'
  | 'mycotoxins';

/**
 * Severity level for risk adjustments
 */
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/**
 * Product category for threshold mapping
 */
export type ProductCategory = 
  | 'sesame'
  | 'groundnuts'
  | 'peanuts'
  | 'cocoa'
  | 'cocoaBeans'
  | 'cashew'
  | 'ginger'
  | 'beans'
  | 'spices'
  | 'fish';

/**
 * Corridor identifier (origin-destination pair)
 */
export interface CorridorId {
  originCountry: string;      // ISO 3166-1 alpha-2 or alpha-3
  destinationCountry: string; // ISO 3166-1 alpha-2 or alpha-3
}

/**
 * Base threshold limit for a hazard
 */
export interface ThresholdLimit {
  value: number;              // The numeric limit
  unit: string;              // e.g., 'μg/kg', 'mg/kg', 'cfu/g'
  isZeroTolerance?: boolean;  // If true, any detection = BLOCKER
}

/**
 * Versioned threshold mapping
 */
export interface ThresholdMapping {
  productCategory: ProductCategory;
  corridorId: string;         // e.g., "NG-NL", "GH-DE"
  hazard: HazardType;
  maxAllowed: number;
  unit: string;
  isZeroTolerance: boolean;
  version: string;
  effectiveDate: string;
  regulatoryReference: string;
}

// =====================================================
// RISK ADJUSTMENT TYPES
// =====================================================

/**
 * Risk profile for threshold adjustment
 */
export interface ThresholdRiskProfile {
  exporterId: string;
  previousBlockersCount: number;
  previousWarningsCount: number;
  countryRiskFlags: Record<HazardType, RiskLevel>;
  corridorRiskFlags: Record<string, RiskLevel>;
  rasffAlerts: RASFFAlertSummary[];
  computedRiskScore: number;
}

/**
 * Summary of RASFF alerts for an origin/corridor
 */
export interface RASFFAlertSummary {
  product: string;
  originCountry: string;
  hazard: HazardType;
  alertCount: number;
  lastAlertDate: string;
  rejectionRate: number;  // 0-1
}

/**
 * Threshold adjustment result
 */
export interface ThresholdAdjustment {
  baseThreshold: ThresholdLimit;
  adjustedThreshold: number;
  adjustmentFactor: number;
  reason: string;
  appliedRules: string[];
  timestamp: string;
}

// =====================================================
// VERSION MANAGEMENT
// =====================================================

/**
 * Threshold version entry
 */
export interface ThresholdVersion {
  version: string;
  createdAt: string;
  createdBy: string;
  changes: string;
  productCategory?: ProductCategory;
  corridorId?: string;
  hazard?: HazardType;
}

/**
 * Threshold table version
 */
export interface ThresholdTable {
  tableId: string;
  version: string;
  effectiveDate: string;
  thresholds: ThresholdMapping[];
  versions: ThresholdVersion[];
  metadata: {
    source: 'EU_REGULATION' | 'NVWA' | 'CUSTOM';
    lastSyncDate: string;
  };
}

// =====================================================
// AUDIT TYPES
// =====================================================

/**
 * Audit entry for threshold adjustments
 */
export interface ThresholdAuditEntry {
  auditId: string;
  shipmentId: string;
  ruleId: string;
  baseThreshold: number;
  adjustedThreshold: number;
  adjustmentFactor: number;
  inputValue: number;
  result: 'PASS' | 'WARNING' | 'BLOCKER';
  timestamp: string;
  riskProfile?: {
    exporterId: string;
    riskScore: number;
    rasffAlertCount: number;
  };
}

// =====================================================
// EXAMPLE THRESHOLD MAPPINGS
// =====================================================

export const EXAMPLE_THRESHOLDS: ThresholdMapping[] = [
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
  }
];

// =====================================================
// DEFAULT ADJUSTMENT RULES
// =====================================================

/**
 * Risk-based threshold adjustment rules
 */
export const DEFAULT_ADJUSTMENT_RULES = {
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
// HELPER FUNCTIONS
// =====================================================

/**
 * Get corridor ID string from origin/destination
 */
export function getCorridorId(origin: string, destination: string): string {
  return `${origin.toUpperCase()}-${destination.toUpperCase()}`;
}

/**
 * Get threshold version key
 */
export function getThresholdKey(product: ProductCategory, corridor: string, hazard: HazardType): string {
  return `${product}:${corridor}:${hazard}`;
}

/**
 * Check if threshold is exceeded
 */
export function isThresholdExceeded(
  measuredValue: number,
  threshold: ThresholdLimit
): boolean {
  if (threshold.isZeroTolerance) {
    return measuredValue > 0;
  }
  return measuredValue > threshold.value;
}