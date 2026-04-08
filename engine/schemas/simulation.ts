/**
 * Simulation Mode Schema
 * 
 * Test new rules or updates against historical shipments without affecting live status.
 * Ensures deterministic evaluation before rules go live.
 */

import { EngineOutput } from './engine-output';

/**
 * Simulation request
 */
export interface SimulationRequest {
  historicalShipmentIds: string[];  // Shipments to test
  newRules?: string[];              // Optional: new rule IDs to test (vs current)
  ruleVersions?: Record<string, string>;  // Specific versions to test
  simulationName: string;
  description?: string;
}

/**
 * Simulation result for a single shipment
 */
export interface ShipmentSimulationResult {
  shipmentId: string;
  originalStatus: string;           // Status when evaluated with live rules
  simulatedStatus: string;         // Status with new/simulated rules
  originalBlockers: string[];      // Blockers from live evaluation
  simulatedBlockers: string[];     // Blockers from simulation
  newBlockers: string[];           // Blockers that appeared in simulation only
  clearedBlockers: string[];       // Blockers that were cleared in simulation
  engineOutput: EngineOutput;      // Full simulation output
  timestamp: string;
}

/**
 * Complete simulation result
 */
export interface SimulationResult {
  simulationId: string;
  simulationName: string;
  description?: string;
  createdAt: string;
  completedAt: string;
  shipmentCount: number;
  results: ShipmentSimulationResult[];
  summary: {
    totalShipments: number;
    statusChanged: number;
    newBlockersIntroduced: number;
    blockersCleared: number;
    ruleVersionsTested: Record<string, string>;
  };
}

/**
 * Example simulation request
 */
export const SAMPLE_SIMULATION_REQUEST: SimulationRequest = {
  historicalShipmentIds: ['ship_001', 'ship_002', 'ship_003'],
  newRules: ['EU_SESAME_EO_001', 'EU_AFLATOXIN_001'],
  ruleVersions: {
    'EU_SESAME_EO_001': 'v3',
    'EU_AFLATOXIN_001': 'v2'
  },
  simulationName: 'EO Threshold Update v3',
  description: 'Test new ethylene oxide MRL threshold (0.01 mg/kg) against Q1 shipments'
};

/**
 * Run simulation
 */
export function runSimulation(
  shipments: any[],
  rules: any[],
  newRuleVersions?: Record<string, string>
): ShipmentSimulationResult[] {
  const results: ShipmentSimulationResult[] = [];
  
  for (const shipment of shipments) {
    // Evaluate with simulated rules
    const simulatedOutput = evaluateWithRules(shipment, rules, newRuleVersions);
    
    results.push({
      shipmentId: shipment.id,
      originalStatus: shipment.status || 'UNKNOWN',
      simulatedStatus: simulatedOutput.status,
      originalBlockers: shipment.blockers || [],
      simulatedBlockers: simulatedOutput.blockers.map(b => b.ruleId),
      newBlockers: simulatedOutput.blockers
        .filter(b => !(shipment.blockers || []).includes(b.ruleId))
        .map(b => b.ruleId),
      clearedBlockers: (shipment.blockers || [])
        .filter((b: string) => !simulatedOutput.blockers.some(sb => sb.ruleId === b)),
      engineOutput: simulatedOutput,
      timestamp: new Date().toISOString()
    });
  }
  
  return results;
}

/**
 * Evaluate shipment with specific rules
 */
function evaluateWithRules(
  shipment: any,
  rules: any[],
  ruleVersions?: Record<string, string>
): EngineOutput {
  // Simplified evaluation logic
  // In production, this would call the actual rule engine
  const blockers: any[] = [];
  const warnings: any[] = [];
  const auditLog: any[] = [];
  
  for (const rule of rules) {
    const version = ruleVersions?.[rule.id] || rule.version;
    const result = evaluateRule(shipment, rule);
    
    auditLog.push({
      step: `Rule: ${rule.id}`,
      ruleId: rule.id,
      ruleVersion: version,
      inputData: shipment.labResults || {},
      output: result.blocked ? 'BLOCKER' : 'PASS',
      timestamp: new Date().toISOString()
    });
    
    if (result.blocked) {
      blockers.push({
        ruleId: rule.id,
        ruleVersion: version,
        field: result.field,
        value: result.value,
        message: result.message,
        timestamp: new Date().toISOString()
      });
    }
  }
  
  return {
    shipmentId: shipment.id,
    status: blockers.length > 0 ? 'REJECTED' : 'READY',
    blockers,
    warnings,
    auditLog,
    evaluatedAt: new Date().toISOString(),
    evaluationEngine: 'culbridge-engine-v1.0-simulation',
    evaluationMode: 'simulation',
  };
}

/**
 * Evaluate a single rule against shipment
 */
function evaluateRule(shipment: any, rule: any): { blocked: boolean; field: string; value: any; message: string } {
  // Simplified rule evaluation
  // In production, this would use actual rule conditions
  return {
    blocked: false,
    field: '',
    value: null,
    message: ''
  };
}

/**
 * Create simulation summary
 */
function createSimulationSummary(
  results: ShipmentSimulationResult[],
  ruleVersions: Record<string, string>
): SimulationResult['summary'] {
  return {
    totalShipments: results.length,
    statusChanged: results.filter(r => r.originalStatus !== r.simulatedStatus).length,
    newBlockersIntroduced: results.reduce((acc, r) => acc + r.newBlockers.length, 0),
    blockersCleared: results.reduce((acc, r) => acc + r.clearedBlockers.length, 0),
    ruleVersionsTested: ruleVersions
  };
}

/**
 * Generate simulation report
 */
export function generateSimulationReport(result: SimulationResult): string {
  const lines = [
    `Simulation Report: ${result.simulationName}`,
    `Generated: ${result.completedAt}`,
    `Shipments Tested: ${result.shipmentCount}`,
    '',
    '--- Summary ---',
    `Total Shipments: ${result.summary.totalShipments}`,
    `Status Changed: ${result.summary.statusChanged}`,
    `New Blockers Introduced: ${result.summary.newBlockersIntroduced}`,
    `Blockers Cleared: ${result.summary.blockersCleared}`,
    '',
    '--- Rule Versions Tested ---',
    ...Object.entries(result.summary.ruleVersionsTested).map(([id, v]) => `  ${id}: ${v}`),
    '',
    '--- Shipment Results ---'
  ];
  
  for (const r of result.results) {
    lines.push('');
    lines.push(`Shipment: ${r.shipmentId}`);
    lines.push(`  Original: ${r.originalStatus} → Simulated: ${r.simulatedStatus}`);
    if (r.newBlockers.length > 0) {
      lines.push(`  NEW BLOCKERS: ${r.newBlockers.join(', ')}`);
    }
    if (r.clearedBlockers.length > 0) {
      lines.push(`  CLEARED: ${r.clearedBlockers.join(', ')}`);
    }
  }
  
  return lines.join('\n');
}