/**
 * Engine Output & Audit Log Schema
 * 
 * Deterministic outputs: the engine must produce the same result for the same shipment data and versions.
 * Full auditability: every BLOCKER or WARNING must be traceable to rule version, lab version, document, and shipment data.
 * Legal & regulatory defensibility: regulators (NL: NVWA, DE: BVL, EU: EFSA) or courts must be able to reconstruct exactly why a shipment was blocked.
 */

export type EngineStatus = 'REJECTED' | 'READY' | 'VALIDATING';
export type AuditOutput = 'PASS' | 'BLOCKER' | 'WARNING';

/**
 * Blocker entry - why shipment was rejected
 */
export interface Blocker {
  ruleId: string;               // rule evaluated
  ruleVersion: string;         // exact version used
  field: string;               // field that triggered the rule
  value: any;                  // actual value observed
  labId?: string;              // optional lab entity ID
  labVersion?: string;         // optional lab version
  documentType?: string;       // optional document
  reportHash?: string;         // optional SHA256 hash of lab report
  message: string;             // descriptive message
  timestamp: string;           // ISO timestamp of evaluation
}

/**
 * Warning entry - non-blocking issues
 */
export interface Warning {
  ruleId: string;
  ruleVersion: string;
  field: string;
  value: any;
  labId?: string;
  labVersion?: string;
  documentType?: string;
  reportHash?: string;
  message: string;
  timestamp: string;
}

/**
 * Audit log entry - step-by-step evaluation record
 */
export interface AuditLogEntry {
  step: string;                // e.g., "Lab Validation", "Document Validation"
  ruleId?: string;             // applicable if step triggered a rule
  ruleVersion?: string;
  inputData: any;              // raw data evaluated (lab result, document, shipment field)
  output: AuditOutput;
  timestamp: string;
}

/**
 * Complete engine output
 */
export interface EngineOutput {
  shipmentId: string;
  status: EngineStatus;
  blockers: Blocker[];
  warnings: Warning[];
  auditLog: AuditLogEntry[];
  evaluatedAt: string;         // overall evaluation timestamp
  evaluationEngine: string;     // e.g., "culbridge-engine-v1.0"
  evaluationMode: 'automatic' | 'manual' | 'simulation';
}

/**
 * Example engine output (Sesame → NL, rejected)
 */
export const SAMPLE_ENGINE_OUTPUT: EngineOutput = {
  shipmentId: 'shipment_001',
  status: 'REJECTED',
  blockers: [
    {
      ruleId: 'EU_SESAME_EO_001',
      ruleVersion: 'v3',
      field: 'labResults.ethylene_oxide.value',
      value: 0.12,
      labId: 'lab_ng_001',
      labVersion: 'v4',
      reportHash: 'sha256:a1b2c3d4e5f6...',
      message: 'Ethylene Oxide exceeds EU MRL limit of 0.02 mg/kg',
      timestamp: '2026-03-28T10:34:12Z'
    },
    {
      ruleId: 'MISSING_DOCUMENT_001',
      ruleVersion: 'v2',
      field: 'documents.certificate_of_origin.present',
      value: false,
      documentType: 'certificate_of_origin',
      message: 'Certificate of Origin missing for NL corridor',
      timestamp: '2026-03-28T10:34:12Z'
    }
  ],
  warnings: [],
  auditLog: [
    {
      step: 'Shipment Loading',
      inputData: { shipmentId: 'shipment_001', product: 'sesame', corridor: 'NL' },
      output: 'PASS',
      timestamp: '2026-03-28T10:34:10Z'
    },
    {
      step: 'Lab Validation',
      ruleId: 'EU_SESAME_EO_001',
      ruleVersion: 'v3',
      inputData: { value: 0.12, unit: 'mg/kg', labId: 'lab_ng_001', labVersion: 'v4' },
      output: 'BLOCKER',
      timestamp: '2026-03-28T10:34:11Z'
    },
    {
      step: 'Document Validation',
      ruleId: 'MISSING_DOCUMENT_001',
      ruleVersion: 'v2',
      inputData: { certificate_of_origin: { present: false } },
      output: 'BLOCKER',
      timestamp: '2026-03-28T10:34:12Z'
    }
  ],
  evaluatedAt: '2026-03-28T10:34:12Z',
  evaluationEngine: 'culbridge-engine-v1.0',
  evaluationMode: 'automatic'
};

/**
 * Create a blocker entry
 */
export function createBlocker(
  ruleId: string,
  ruleVersion: string,
  field: string,
  value: any,
  message: string,
  options?: {
    labId?: string;
    labVersion?: string;
    documentType?: string;
    reportHash?: string;
  }
): Blocker {
  return {
    ruleId,
    ruleVersion,
    field,
    value,
    message,
    timestamp: new Date().toISOString(),
    ...options
  };
}

/**
 * Create a warning entry
 */
export function createWarning(
  ruleId: string,
  ruleVersion: string,
  field: string,
  value: any,
  message: string,
  options?: {
    labId?: string;
    labVersion?: string;
    documentType?: string;
    reportHash?: string;
  }
): Warning {
  return {
    ruleId,
    ruleVersion,
    field,
    value,
    message,
    timestamp: new Date().toISOString(),
    ...options
  };
}

/**
 * Add audit log entry
 */
export function createAuditLogEntry(
  step: string,
  inputData: any,
  output: AuditOutput,
  ruleId?: string,
  ruleVersion?: string
): AuditLogEntry {
  return {
    step,
    ruleId,
    ruleVersion,
    inputData,
    output,
    timestamp: new Date().toISOString()
  };
}

/**
 * Determine overall status from blockers/warnings
 */
export function determineStatus(blockers: Blocker[], warnings: Warning[]): EngineStatus {
  if (blockers.length > 0) {
    return 'REJECTED';
  }
  return 'READY';
}

/**
 * Serialize engine output for storage
 */
export function serializeEngineOutput(output: EngineOutput): string {
  return JSON.stringify(output, null, 2);
}

/**
 * Deserialize engine output from storage
 */
export function deserializeEngineOutput(json: string): EngineOutput {
  return JSON.parse(json) as EngineOutput;
}

/**
 * Get summary for regulator report
 */
export function getRegulatorSummary(output: EngineOutput): string {
  const lines = [
    `Shipment ID: ${output.shipmentId}`,
    `Status: ${output.status}`,
    `Evaluated: ${output.evaluatedAt}`,
    `Engine: ${output.evaluationEngine}`,
    ``
  ];
  
  if (output.blockers.length > 0) {
    lines.push(`BLOCKERS (${output.blockers.length}):`);
    for (const b of output.blockers) {
      lines.push(`  - ${b.ruleId} (${b.ruleVersion}): ${b.message}`);
      lines.push(`    Field: ${b.field}, Value: ${JSON.stringify(b.value)}`);
      if (b.labId) lines.push(`    Lab: ${b.labId} (${b.labVersion})`);
      if (b.documentType) lines.push(`    Document: ${b.documentType}`);
      if (b.reportHash) lines.push(`    Report Hash: ${b.reportHash}`);
    }
    lines.push('');
  }
  
  if (output.warnings.length > 0) {
    lines.push(`WARNINGS (${output.warnings.length}):`);
    for (const w of output.warnings) {
      lines.push(`  - ${w.ruleId} (${w.ruleVersion}): ${w.message}`);
    }
    lines.push('');
  }
  
  lines.push(`AUDIT LOG (${output.auditLog.length} steps):`);
  for (const entry of output.auditLog) {
    lines.push(`  [${entry.timestamp}] ${entry.step}: ${entry.output}`);
    if (entry.ruleId) {
      lines.push(`    Rule: ${entry.ruleId} (${entry.ruleVersion})`);
    }
  }
  
  return lines.join('\n');
}