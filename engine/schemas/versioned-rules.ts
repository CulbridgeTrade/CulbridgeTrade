/**
 * Versioned Compliance Rules Schema
 * 
 * Every rule has a unique ID and version. New versions do not overwrite old rules.
 * Historical shipments reference exact rule versions used at evaluation time.
 */

export type RuleEffectType = 'BLOCKER' | 'WARNING';

export interface RuleScope {
  productCategory?: string;   // e.g., "plant", "seafood", "spice"
  hazard?: string;            // e.g., "pesticide", "mycotoxin", "heavy_metal"
  corridor?: string;          // e.g., "NL", "DE", "BE", "FR"
  commodity?: string;         // e.g., "sesame", "cocoa", "cashew", "ginger"
}

export interface RuleCondition {
  field: string;              // e.g., "labResults.ethylene_oxide"
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte' | 'in' | 'not_in';
  value: number | string | number[] | string[];
}

export interface ComplianceRule {
  id: string;                 // e.g., "EU_SESAME_EO_001"
  version: string;            // e.g., "v3"
  name: string;               // e.g., "Ethylene Oxide MRL - EU Sesame"
  description: string;
  scope: RuleScope;
  conditions: RuleCondition[];
  effect: {
    type: RuleEffectType;
    message: string;
    remediation?: string;
  };
  createdAt: string;          // ISO 8601
  updatedAt: string;          // ISO 8601
  active: boolean;
}

/**
 * Example rule instances
 */
export const SAMPLE_RULES: ComplianceRule[] = [
  {
    id: 'EU_GENERIC_PEST_001',
    version: 'v2',
    name: 'Ethylene Oxide MRL - EU',
    description: 'Ethylene oxide must not exceed 0.02 mg/kg in sesame products',
    scope: {
      productCategory: 'plant',
      hazard: 'pesticide',
      corridor: 'NL',
      commodity: 'sesame'
    },
    conditions: [
      { field: 'labResults.ethylene_oxide', operator: 'gt', value: 0.02 }
    ],
    effect: {
      type: 'BLOCKER',
      message: 'Ethylene oxide exceeds EU MRL of 0.02 mg/kg',
      remediation: 'Retest with accredited lab or source compliant batch'
    },
    createdAt: '2024-01-15T00:00:00Z',
    updatedAt: '2024-06-01T00:00:00Z',
    active: true
  },
  {
    id: 'DE_CASHEW_AF_003',
    version: 'v1',
    name: 'Aflatoxin Total MRL - Germany Cashew',
    description: 'Total aflatoxins must not exceed 10 μg/kg in cashew nuts',
    scope: {
      productCategory: 'nut',
      hazard: 'mycotoxin',
      corridor: 'DE',
      commodity: 'cashew'
    },
    conditions: [
      { field: 'labResults.aflatoxin_total', operator: 'gt', value: 10 }
    ],
    effect: {
      type: 'BLOCKER',
      message: 'Total aflatoxins exceed EU MRL of 10 μg/kg'
    },
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-01T00:00:00Z',
    active: true
  },
  {
    id: 'NL_GINGER_CD_001',
    version: 'v1',
    name: 'Cadmium MRL - Netherlands Ginger',
    description: 'Cadmium must not exceed 0.5 mg/kg in ginger products',
    scope: {
      productCategory: 'spice',
      hazard: 'heavy_metal',
      corridor: 'NL',
      commodity: 'ginger'
    },
    conditions: [
      { field: 'labResults.cadmium', operator: 'gt', value: 0.5 }
    ],
    effect: {
      type: 'BLOCKER',
      message: 'Cadmium exceeds EU MRL of 0.5 mg/kg'
    },
    createdAt: '2024-05-01T00:00:00Z',
    updatedAt: '2024-05-01T00:00:00Z',
    active: true
  }
];

/**
 * Rule evaluation result
 */
export interface RuleEvaluationResult {
  ruleId: string;
  ruleVersion: string;
  passed: boolean;
  effect: RuleEffectType;
  message: string;
  evaluatedAt: string;
}

/**
 * Get applicable rules for a shipment
 */
export function getApplicableRules(
  rules: ComplianceRule[],
  productCategory: string,
  corridor: string,
  commodity?: string
): ComplianceRule[] {
  return rules.filter(rule => {
    if (!rule.active) return false;
    
    // Check scope match
    if (rule.scope.productCategory && rule.scope.productCategory !== productCategory) return false;
    if (rule.scope.corridor && rule.scope.corridor !== corridor) return false;
    if (rule.scope.commodity && rule.scope.commodity !== commodity) return false;
    
    return true;
  });
}