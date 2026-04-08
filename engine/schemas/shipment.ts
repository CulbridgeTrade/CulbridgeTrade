/**
 * Canonical Shipment Object Schema
 * 
 * This is the stable shape that every UI component or integration relies on.
 * Must handle any commodity, corridor, lab results, or documents.
 * 
 * Version: 1.0
 */

export const SHIPMENT_STATUS = {
  DRAFT: 'DRAFT',
  PARTIAL: 'PARTIAL',
  VALIDATING: 'VALIDATING',
  READY: 'READY',
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED'
} as const;

export const COMPLIANCE_STATUS = {
  PASS: 'PASS',
  WARNING: 'WARNING',
  BLOCKER: 'BLOCKER',
  UNKNOWN: 'UNKNOWN'
} as const;

export type ShipmentStatus = typeof SHIPMENT_STATUS[keyof typeof SHIPMENT_STATUS];
export type ComplianceStatus = typeof COMPLIANCE_STATUS[keyof typeof COMPLIANCE_STATUS];

/**
 * Document type
 */
export interface Document {
  id: string;
  type: string;
  status: 'UPLOADED' | 'VALID' | 'INVALID';
  fileName?: string;
  hash?: string;
  uploadedAt: string;
  verifiedAt?: string;
  rejectionReason?: string;
}

/**
 * Canonical Shipment Type
 */
export interface Shipment {
  // Core identity
  id: string;
  status: ShipmentStatus;
  
  // Commodity information
  commodity: {
    description: string;
    hsCode: string;
    confidence: number;
    type?: string;
  };
  
  // Lab results - dynamic key-value for any substance
  labResults: Record<string, number | string | boolean>;
  
  // Documents
  documents: {
    required: string[];
    uploaded: Document[];
    missing: string[];
  };
  
  // Traceability (EUDR)
  traceability: {
    originChainComplete: boolean;
    additionalMetadata?: Record<string, any>;
    geolocation?: Array<{ lat: number; lng: number; timestamp: string }>;
  };
  
  // Compliance evaluation result
  compliance: {
    status: ComplianceStatus;
    blockers: string[];
    warnings: string[];
    evaluatedAt: string;
    evaluatedBy: string;
  };
  
  // Risk profile
  risk: {
    rasffFlag: boolean;
    historicalIssues?: string[];
    exporterVerified: boolean;
    agentVerified: boolean;
  };
  
  // Submission readiness
  submission: {
    ready: boolean;
    errors: string[];
    token?: string;
    sgdNumber?: string;
  };
  
  // Timestamps
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  approvedAt?: string;
  rejectedAt?: string;
  
  // Entity references
  exporter?: { id: string; name: string };
  destination?: { country: string; port?: string };
}

/**
 * Shipment creation input
 */
export interface CreateShipmentInput {
  commodity: { description: string; hsCode?: string; type?: string };
  destination?: { country: string; port?: string };
  exporterId?: string;
  agentId?: string;
}

/**
 * Shipment evaluation payload
 */
export interface EvaluateShipmentInput {
  labResults?: Record<string, number | string | boolean>;
  documents?: string[];
  traceability?: Partial<Shipment['traceability']>;
}

/**
 * Validation helper
 */
export function validateShipment(shipment: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!shipment.id) errors.push('id is required');
  if (!shipment.status) errors.push('status is required');
  if (!shipment.commodity) errors.push('commodity is required');
  if (!shipment.commodity?.description) errors.push('commodity.description is required');
  
  const validStatuses = Object.values(SHIPMENT_STATUS);
  if (shipment.status && !validStatuses.includes(shipment.status)) {
    errors.push(`invalid status: ${shipment.status}`);
  }
  
  if (shipment.compliance?.status) {
    const validCompliance = Object.values(COMPLIANCE_STATUS);
    if (!validCompliance.includes(shipment.compliance.status)) {
      errors.push(`invalid compliance status: ${shipment.compliance.status}`);
    }
  }
  
  return { valid: errors.length === 0, errors };
}

/**
 * Default empty shipment factory
 */
export function createEmptyShipment(id: string): Shipment {
  return {
    id,
    status: 'DRAFT',
    commodity: { description: '', hsCode: '', confidence: 0 },
    labResults: {},
    documents: { required: [], uploaded: [], missing: [] },
    traceability: { originChainComplete: false },
    compliance: { status: 'UNKNOWN', blockers: [], warnings: [], evaluatedAt: '', evaluatedBy: 'system' },
    risk: { rasffFlag: false, exporterVerified: false, agentVerified: false },
    submission: { ready: false, errors: [] },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

/**
 * Compute missing documents
 */
export function computeMissingDocuments(shipment: Shipment): string[] {
  const uploadedTypes = shipment.documents.uploaded
    .filter(d => d.status === 'VALID')
    .map(d => d.type);
  
  return shipment.documents.required.filter(r => !uploadedTypes.includes(r));
}

/**
 * Determine submission readiness
 */
export function computeSubmissionReady(shipment: Shipment): { ready: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!shipment.commodity.description) errors.push('Commodity description required');
  
  const missingDocs = computeMissingDocuments(shipment);
  if (missingDocs.length > 0) errors.push(`Missing documents: ${missingDocs.join(', ')}`);
  
  if (shipment.compliance.status === 'BLOCKER') {
    errors.push(`Compliance blockers: ${shipment.compliance.blockers.join(', ')}`);
  }
  
  if (shipment.status !== 'READY') errors.push(`Shipment must be READY, currently ${shipment.status}`);
  
  return { ready: errors.length === 0, errors };
}