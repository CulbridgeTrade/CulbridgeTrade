/**
 * Rule Schema
 * 
 * Deterministic constraint evaluation rules.
 * 
 * Version: 1.0
 */

/**
 * Operators supported by rule conditions
 */
export type RuleOperator = '>' | '<' | '>=' | '<=' | '==' | '!=' | 'IN' | 'NOT_IN' | 'EXISTS' | 'NOT_EXISTS';

/**
 * Effect types
 */
export type EffectType = 'BLOCKER' | 'WARNING';

/**
 * Rule scope - defines applicability
 */
export interface RuleScope {
  product?: string;        // Optional → allows generic rules
  destination?: string;    // Optional → allows corridor rules
  documentType?: string;   // Optional → document-specific rules
}

/**
 * Rule condition - the "if" part
 */
export interface RuleCondition {
  field: string;           // e.g., 'labResults.aflatoxinB1', 'documents.required'
  operator: RuleOperator;
  value: number | string | boolean | number[] | string[];
}

/**
 * Rule effect - the "then" part
 */
export interface RuleEffect {
  type: EffectType;
  message: string;
}

/**
 * Rule source - regulatory reference
 */
export interface RuleSource {
  regulation: string;
  reference: string;
  effectiveDate?: string;
  authority?: string;
}

/**
 * Complete Rule type
 */
export interface Rule {
  id: string;
  name: string;
  description?: string;
  
  // Applicability
  scope: RuleScope;
  
  // The "if" - condition
  condition: RuleCondition;
  
  // The "then" - effect
  effect: RuleEffect;
  
  // Regulatory source
  source: RuleSource;
  
  // Metadata
  enabled: boolean;
  version: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Evaluation result for a single rule
 */
export interface RuleEvaluationResult {
  ruleId: string;
  ruleName: string;
  passed: boolean;
  actualValue?: any;
  expectedValue?: any;
  effect?: RuleEffect;
}

/**
 * Complete evaluation output
 */
export interface EvaluationResult {
  shipmentId: string;
  status: 'PASS' | 'WARNING' | 'BLOCKER';
  blockers: Array<{
    ruleId: string;
    ruleName: string;
    message: string;
    source: string;
  }>;
  warnings: Array<{
    ruleId: string;
    ruleName: string;
    message: string;
    source: string;
  }>;
  passedRules: string[];
  evaluatedAt: string;
  evaluatedRules: number;
}

/**
 * Helper: Check if value passes condition
 */
export function evaluateCondition(condition: RuleCondition, shipment: any): boolean {
  const fieldValue = getNestedValue(shipment, condition.field);
  const targetValue = condition.value;
  
  switch (condition.operator) {
    case '>':
      return Number(fieldValue) > Number(targetValue);
    case '<':
      return Number(fieldValue) < Number(targetValue);
    case '>=':
      return Number(fieldValue) >= Number(targetValue);
    case '<=':
      return Number(fieldValue) <= Number(targetValue);
    case '==':
      return fieldValue === targetValue;
    case '!=':
      return fieldValue !== targetValue;
    case 'IN':
      return Array.isArray(targetValue) && targetValue.includes(fieldValue);
    case 'NOT_IN':
      return Array.isArray(targetValue) && !targetValue.includes(fieldValue);
    case 'EXISTS':
      return fieldValue !== undefined && fieldValue !== null;
    case 'NOT_EXISTS':
      return fieldValue === undefined || fieldValue === null;
    default:
      return false;
  }
}

/**
 * Helper: Get nested value from object using dot notation
 */
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * Example rules (Nigeria → Netherlands sesame)
 */
export const EXAMPLE_RULES: Rule[] = [
  {
    id: 'SESAME_NL_001',
    name: 'Lab Report Required',
    scope: { product: 'sesame', destination: 'NL' },
    condition: { field: 'documents.uploaded', operator: 'NOT_IN', value: ['LAB_REPORT'] },
    effect: { type: 'BLOCKER', message: 'Lab report mandatory for sesame exports to NL' },
    source: { regulation: 'EU Regulation 2019/2072', reference: 'NVWA' },
    enabled: true,
    version: '1.0.0',
    createdAt: '2026-03-28T00:00:00Z',
    updatedAt: '2026-03-28T00:00:00Z'
  },
  {
    id: 'SESAME_NL_002',
    name: 'Aflatoxin B1 Limit',
    scope: { product: 'sesame', destination: 'NL' },
    condition: { field: 'labResults.aflatoxinB1', operator: '>', value: 2.0 },
    effect: { type: 'BLOCKER', message: 'Aflatoxin B1 exceeds EU MRL of 2.0 μg/kg' },
    source: { regulation: 'EU 2023/915', reference: 'EC' },
    enabled: true,
    version: '1.0.0',
    createdAt: '2026-03-28T00:00:00Z',
    updatedAt: '2026-03-28T00:00:00Z'
  },
  {
    id: 'SESAME_NL_003',
    name: 'Total Aflatoxin Limit',
    scope: { product: 'sesame', destination: 'NL' },
    condition: { field: 'labResults.aflatoxinTotal', operator: '>', value: 4.0 },
    effect: { type: 'BLOCKER', message: 'Total aflatoxins exceed EU MRL of 4.0 μg/kg' },
    source: { regulation: 'EU 2023/915', reference: 'EC' },
    enabled: true,
    version: '1.0.0',
    createdAt: '2026-03-28T00:00:00Z',
    updatedAt: '2026-03-28T00:00:00Z'
  },
  {
    id: 'SESAME_NL_004',
    name: 'EUDR Traceability',
    scope: { product: 'sesame', destination: 'NL' },
    condition: { field: 'traceability.originChainComplete', operator: '==', value: false },
    effect: { type: 'BLOCKER', message: 'EUDR traceability data mandatory from Dec 2024' },
    source: { regulation: 'EU 2023/1115', reference: 'EUDR' },
    enabled: true,
    version: '1.0.0',
    createdAt: '2026-03-28T00:00:00Z',
    updatedAt: '2026-03-28T00:00:00Z'
  }
];