/**
 * Auditable Data Layer Schema
 * 
 * Every piece of critical data (labs, documents, shipment info, rules) 
 * must be immutable and traceable.
 */

import { EngineOutput } from './engine-output';
import type { LabResult } from './lab';

/**
 * Auditable field wrapper - every critical value gets a hash and version
 */
export interface AuditableField<T> {
  value: T;
  hash: string;              // SHA256 hash of value
  createdAt: string;        // ISO timestamp
  modifiedAt?: string;       // ISO timestamp
  sourceVersion: string;    // rule, lab, or document version
}

/**
 * Shipment status enum
 */
export type ShipmentStatus = 'DRAFT' | 'VALIDATING' | 'READY' | 'REJECTED' | 'SUBMITTED' | 'APPROVED';

/**
 * Complete auditable shipment
 */
export interface AuditableShipment {
  id: string;
  
  // Product info (auditable)
  product: AuditableField<{
    name: string;
    hsCode: string;
    category: string;
    batchId: string;
    description?: string;
  }>;
  
  // Corridor info (auditable)
  corridor: AuditableField<{
    originCountry: string;
    destinationCountry: string;
    corridorCode: string;
  }>;
  
  // Lab results (V1.1 - structured array, each wrapped) - Migration: convert Record keys to testType
  labResults: AuditableField<LabResult>[];
  
  // Documents (auditable per document type)
  documents: Record<string, AuditableField<{
    present: boolean;
    type: string;
    hash?: string;           // document hash
    issueDate?: string;
    expiryDate?: string;
    documentId?: string;
  }>>;
  
  // Risk profile (auditable)
  riskProfile?: AuditableField<{
    exporterId: string;
    riskScore: number;
    recentBlockers: number;
    recentWarnings: number;
    flaggedCountries: Record<string, 'HIGH' | 'MEDIUM' | 'LOW'>;
  }>;
  
  // Shipment status
  status: ShipmentStatus;
  
  // Evaluation metadata
  evaluationMetadata?: {
    engineOutput: EngineOutput;
    evaluatedAt: string;
    ruleVersions: Record<string, string>;
    labVersions: Record<string, string>;
    mappingVersion: string;
  };
  
  // Immutable audit log
  auditLog: AuditLogEntry[];
  
  // Timestamps
  createdAt: string;
  updatedAt: string;
}

/**
 * Audit log entry for shipment
 */
export interface AuditLogEntry {
  id: string;
  shipmentId: string;
  step: string;                    // e.g., "Pre-flight Validation", "Lab Validation", "Rule Evaluation"
  ruleId?: string;                 // applicable if step triggered a rule
  ruleVersion?: string;
  input: any;                     // raw data evaluated
  result: 'BLOCKER' | 'WARNING' | 'PASS';
  timestamp: string;
  appliedThresholds?: Record<string, number>;
  labReportHash?: string;
  documentHash?: string;
}

/**
 * Changelog entry for version tracking
 */
export interface ChangelogEntry {
  id: string;
  entityType: 'RULE' | 'LAB' | 'DOCUMENT' | 'CORRIDOR' | 'MAPPING';
  entityId: string;
  previousVersion: string;
  newVersion: string;
  updatedBy: string;
  timestamp: string;
  description: string;
}

/**
 * Create an auditable field
 */
export function createAuditableField<T>(
  value: T,
  sourceVersion: string,
  existingHash?: string
): AuditableField<T> {
  const hash = existingHash || computeHash(JSON.stringify(value));
  const now = new Date().toISOString();
  
  return {
    value,
    hash,
    createdAt: now,
    sourceVersion
  };
}

/**
 * Compute SHA256 hash (simplified - use crypto in production)
 */
function computeHash(data: string): string {
  // In production, use Node.js crypto or Web Crypto API
  // This is a placeholder that returns a mock hash
  return `sha256:${Buffer.from(data).toString('base64').substring(0, 16)}`;
}

/**
 * Append to audit log (immutable append)
 */
export function appendAuditLog(
  shipment: AuditableShipment,
  entry: Omit<AuditLogEntry, 'id' | 'shipmentId' | 'timestamp'>
): AuditableShipment {
  const now = new Date().toISOString();
  
  const newEntry: AuditLogEntry = {
    ...entry,
    id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    shipmentId: shipment.id,
    timestamp: now
  };
  
  return {
    ...shipment,
    auditLog: [...shipment.auditLog, newEntry],
    updatedAt: now
  };
}

/**
 * Validate shipment has all required fields (pre-flight)
 */
export function validateRequiredFields(shipment: AuditableShipment): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  
  // Check product
  if (!shipment.product?.value?.name) missing.push('product.name');
  if (!shipment.product?.value?.hsCode) missing.push('product.hsCode');
  if (!shipment.product?.value?.category) missing.push('product.category');
  if (!shipment.product?.value?.batchId) missing.push('product.batchId');
  
  // Check corridor
  if (!shipment.corridor?.value?.originCountry) missing.push('corridor.originCountry');
  if (!shipment.corridor?.value?.destinationCountry) missing.push('corridor.destinationCountry');
  
  // Check lab results
  if (!shipment.labResults || Object.keys(shipment.labResults).length === 0) {
    missing.push('labResults (at least one required)');
  }
  
  // Check documents
  if (!shipment.documents || Object.keys(shipment.documents).length === 0) {
    missing.push('documents (at least one required)');
  }
  
  return {
    valid: missing.length === 0,
    missing
  };
}

/**
 * Check if field value has been tampered with
 */
export function verifyFieldIntegrity<T>(field: AuditableField<T>): boolean {
  const computedHash = computeHash(JSON.stringify(field.value));
  return field.hash === computedHash;
}

/**
 * Get shipment status summary for regulator
 */
export function getShipmentSummary(shipment: AuditableShipment): string {
  const lines = [
    `Shipment ID: ${shipment.id}`,
    `Status: ${shipment.status}`,
    `Product: ${shipment.product?.value?.name} (HS: ${shipment.product?.value?.hsCode})`,
    `Corridor: ${shipment.corridor?.value?.originCountry} → ${shipment.corridor?.value?.destinationCountry}`,
    `Created: ${shipment.createdAt}`,
    `Last Updated: ${shipment.updatedAt}`,
    ''
  ];
  
  if (shipment.riskProfile?.value) {
    lines.push(`Risk Score: ${shipment.riskProfile.value.riskScore}`);
    lines.push(`Recent Blockers: ${shipment.riskProfile.value.recentBlockers}`);
    lines.push('');
  }
  
  lines.push(`Lab Results: ${Object.keys(shipment.labResults).length}`);
  for (const [substance, result] of Object.entries(shipment.labResults)) {
    lines.push(`  - ${substance}: ${result.value.value} ${result.value.unit} (Lab: ${result.value.labId})`);
  }
  lines.push('');
  
  lines.push(`Documents: ${Object.keys(shipment.documents).length}`);
  for (const [docType, doc] of Object.entries(shipment.documents)) {
    lines.push(`  - ${docType}: ${doc.value.present ? 'Present' : 'Missing'}`);
  }
  lines.push('');
  
  if (shipment.auditLog.length > 0) {
    lines.push(`Audit Log (${shipment.auditLog.length} entries):`);
    for (const entry of shipment.auditLog.slice(-10)) { // Last 10 entries
      lines.push(`  [${entry.timestamp}] ${entry.step}: ${entry.result}`);
      if (entry.ruleId) lines.push(`    Rule: ${entry.ruleId} (${entry.ruleVersion})`);
    }
  }
  
  return lines.join('\n');
}

/**
 * Export complete audit trail for regulator
 */
export function exportAuditTrail(shipment: AuditableShipment): string {
  const lines = [
    '=== CULBRIDGE AUDIT TRAIL ===',
    `Shipment: ${shipment.id}`,
    `Export Date: ${new Date().toISOString()}`,
    '',
    '--- SHIPMENT DATA ---',
    getShipmentSummary(shipment),
    '',
    '--- COMPLETE AUDIT LOG ---'
  ];
  
  for (const entry of shipment.auditLog) {
    lines.push('');
    lines.push(`[${entry.timestamp}] ${entry.step}`);
    lines.push(`  Result: ${entry.result}`);
    if (entry.ruleId) {
      lines.push(`  Rule: ${entry.ruleId}`);
      lines.push(`  Version: ${entry.ruleVersion}`);
    }
    if (entry.input) {
      lines.push(`  Input: ${JSON.stringify(entry.input).substring(0, 200)}`);
    }
    if (entry.appliedThresholds) {
      lines.push(`  Thresholds: ${JSON.stringify(entry.appliedThresholds)}`);
    }
    if (entry.labReportHash) {
      lines.push(`  Lab Report Hash: ${entry.labReportHash}`);
    }
    if (entry.documentHash) {
      lines.push(`  Document Hash: ${entry.documentHash}`);
    }
  }
  
  return lines.join('\n');
}