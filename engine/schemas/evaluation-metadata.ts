/**
 * Shipment Evaluation Metadata Schema
 * 
 * Records the versions of all critical data used for evaluation.
 * Attached to each shipment for full audit trail.
 */

export interface ShipmentEvaluationMetadata {
  shipmentId: string;
  evaluatedAt: string;                     // timestamp of evaluation
  
  // Rule versions used
  ruleVersions: Record<string, string>;    // { "EU_SESAME_EO_001": "v2", ... }
  
  // Lab versions used (per lab result)
  labVersions: Record<string, string>;     // { "lab_ng_001": "v4", ... }
  
  // Corridor mapping version used
  corridorMappingVersion: string;          // e.g., "v3"
  corridorMappingId: string;                // e.g., "map_sesame_nl"
  
  // Substance ontology version
  substanceOntologyVersion: string;        // e.g., "v1.2"
  
  // Evaluation context
  evaluationEngine: string;                 // e.g., "culbridge-engine-v1"
  evaluationMode: 'automatic' | 'manual' | 'simulation';
  evaluatedBy?: string;                     // user ID if manual
  
  // Outcome summary
  outcome: 'PASS' | 'FAIL' | 'WARNING';
  blockers: string[];                       // rule IDs that blocked
  warnings: string[];                        // rule IDs that warned
}

/**
 * Example evaluation metadata
 */
export const SAMPLE_EVALUATION_METADATA: ShipmentEvaluationMetadata = {
  shipmentId: 'ship_2024_001',
  evaluatedAt: '2024-07-15T14:30:00Z',
  
  ruleVersions: {
    'EU_GENERIC_PEST_001': 'v2',
    'EU_AFLATOXIN_001': 'v3',
    'NL_SALMONELLA_001': 'v1'
  },
  
  labVersions: {
    'lab_ng_001': 'v4',
    'lab_ng_002': 'v2'
  },
  
  corridorMappingVersion: 'v3',
  corridorMappingId: 'map_sesame_nl',
  
  substanceOntologyVersion: 'v1.2',
  
  evaluationEngine: 'culbridge-engine-v1.0',
  evaluationMode: 'automatic',
  
  outcome: 'FAIL',
  blockers: ['EU_GENERIC_PEST_001'],
  warnings: ['EU_AFLATOXIN_001']
};

/**
 * Create evaluation metadata from a shipment evaluation
 */
export function createEvaluationMetadata(
  shipmentId: string,
  ruleVersions: Record<string, string>,
  labVersions: Record<string, string>,
  corridorMappingId: string,
  corridorMappingVersion: string,
  substanceOntologyVersion: string,
  outcome: 'PASS' | 'FAIL' | 'WARNING',
  blockers: string[],
  warnings: string[]
): ShipmentEvaluationMetadata {
  return {
    shipmentId,
    evaluatedAt: new Date().toISOString(),
    ruleVersions,
    labVersions,
    corridorMappingVersion,
    corridorMappingId,
    substanceOntologyVersion,
    evaluationEngine: 'culbridge-engine-v1.0',
    evaluationMode: 'automatic',
    outcome,
    blockers,
    warnings
  };
}

/**
 * Serialize metadata for storage
 */
export function serializeMetadata(metadata: ShipmentEvaluationMetadata): string {
  return JSON.stringify(metadata, null, 2);
}

/**
 * Deserialize metadata from storage
 */
export function deserializeMetadata(json: string): ShipmentEvaluationMetadata {
  return JSON.parse(json) as ShipmentEvaluationMetadata;
}

/**
 * Verify metadata integrity
 */
export function verifyMetadataIntegrity(
  metadata: ShipmentEvaluationMetadata,
  expectedShipmentId: string
): boolean {
  return metadata.shipmentId === expectedShipmentId &&
         !!metadata.evaluatedAt &&
         Object.keys(metadata.ruleVersions).length > 0 &&
         !!metadata.corridorMappingId;
}

/**
 * Get summary of evaluation for audit report
 */
export function getEvaluationSummary(metadata: ShipmentEvaluationMetadata): string {
  const lines = [
    `Shipment: ${metadata.shipmentId}`,
    `Evaluated: ${metadata.evaluatedAt}`,
    `Outcome: ${metadata.outcome}`,
    `Engine: ${metadata.evaluationEngine}`,
    `Mode: ${metadata.evaluationMode}`,
    ``,
    `Rules Used (${Object.keys(metadata.ruleVersions).length}):`,
    ...Object.entries(metadata.ruleVersions).map(([id, v]) => `  - ${id}: ${v}`),
    ``,
    `Labs Referenced (${Object.keys(metadata.labVersions).length}):`,
    ...Object.entries(metadata.labVersions).map(([id, v]) => `  - ${id}: ${v}`),
    ``,
    `Mapping: ${metadata.corridorMappingId} (${metadata.corridorMappingVersion})`,
    `Substance Ontology: ${metadata.substanceOntologyVersion}`
  ];
  
  if (metadata.blockers.length > 0) {
    lines.push(``, `Blockers: ${metadata.blockers.join(', ')}`);
  }
  
  if (metadata.warnings.length > 0) {
    lines.push(``, `Warnings: ${metadata.warnings.join(', ')}`);
  }
  
  return lines.join('\n');
}