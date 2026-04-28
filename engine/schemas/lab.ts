/**
 * Lab Entity Schema
 * 
 * First-class entity: Approved lab whose test results are trusted by authorities.
 * 
 * Version: 1.0
 */

export type LabStatus = 'ACTIVE' | 'SUSPENDED' | 'REVOKED';

export interface LabEntity {
  id: string;
  name: string;
  country: string;              // e.g., NG, NL, DE
  accreditation: string[];       // e.g., ["ISO/IEC 17025", "NAFDAC"]
  scopes: string[];             // tests lab is certified: ["pesticide", "aflatoxin", "microbe"]
  verified: boolean;            // system-verified against authoritative registry
  status: LabStatus;
  lastSynced: string;           // last registry sync timestamp
  createdAt: string;
  updatedAt: string;
}

/**
 * Lab Result - V1.1 SPEC (canonical for all shipments)
 */
export type LabResult = {
  testType: string;            // e.g. "salmonella", "aflatoxin_b1"
  result: "PASS" | "FAIL" | "ABSENT" | "PRESENT";
  value?: number;              // optional numeric measurement
  unit?: string;               // e.g. µg/kg, ppm
  accredited: boolean;         // ISO/IEC 17025 check
  labName?: string;
  testDate: string;
};

/**
 * Shipment with lab integration
 */
export interface ShipmentWithLab {
  id: string;
  product: string;              // commodity
  corridor: string;             // origin → destination
  labResults: LabResult[];
  status: 'DRAFT' | 'VALIDATING' | 'READY' | 'REJECTED';
}

/**
 * Lab verification check result
 */
export interface LabVerificationResult {
  valid: boolean;
  lab?: LabEntity;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Required fields for any lab result
 */
export const REQUIRED_LAB_FIELDS = ['testType', 'result', 'testDate', 'accredited'] as (keyof LabResult)[];

/**
 * Check if all required lab data fields are present
 */
export function hasAllRequiredLabFields(results: Record<string, LabResult>): boolean {
  for (const result of Object.values(results)) {
    const missing = REQUIRED_LAB_FIELDS.filter(field => !(field in result));
    if (missing.length > 0) return false;
  }
  return true;
}

/**
 * Verify a lab result against lab entity
 */
export function evaluateLabResult(result: LabResult, lab: LabEntity | null): LabVerificationResult {
  // Lab doesn't exist
  if (!lab) {
    return {
      valid: false,
      error: {
        code: 'LAB_NOT_FOUND',
        message: `Lab validation failed for test "${result.testType}" - lab not found in registry`
      }
    };
  }

  // Lab not verified
  if (!lab.verified) {
    return {
      valid: false,
      lab,
      error: {
        code: 'LAB_UNVERIFIED',
        message: `Lab "${lab.name}" is not verified`
      }
    };
  }

  // Lab not active
  if (lab.status !== 'ACTIVE') {
    return {
      valid: false,
      lab,
      error: {
        code: 'LAB_INACTIVE',
        message: `Lab "${lab.name}" status is ${lab.status}`
      }
    };
  }

  // Valid
  return { valid: true, lab };
}

/**
 * Example: Approved labs for Nigeria
 */
export const EXAMPLE_LABS: LabEntity[] = [
  {
    id: 'lab_001',
    name: 'Nigerian Agricultural Quarantine Service (NAQS) Lab',
    country: 'NG',
    accreditation: ['ISO/IEC 17025', 'NAFDAC'],
    scopes: ['aflatoxin', 'pesticide', 'heavy_metal'],
    verified: true,
    status: 'ACTIVE',
    lastSynced: '2026-03-28T00:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-03-28T00:00:00Z'
  },
  {
    id: 'lab_002',
    name: 'Federal Institute of Quality Control (FIQC)',
    country: 'NG',
    accreditation: ['ISO/IEC 17025'],
    scopes: ['aflatoxin', 'microbe'],
    verified: true,
    status: 'ACTIVE',
    lastSynced: '2026-03-28T00:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-03-28T00:00:00Z'
  },
  {
    id: 'lab_003',
    name: 'Lagos State Environmental Chemistry Lab',
    country: 'NG',
    accreditation: ['NAFDAC'],
    scopes: ['pesticide'],
    verified: true,
    status: 'ACTIVE',
    lastSynced: '2026-03-15T00:00:00Z',
    createdAt: '2026-01-15T00:00:00Z',
    updatedAt: '2026-03-15T00:00:00Z'
  },
  {
    id: 'lab_004',
    name: 'Unverified Lab Corp',
    country: 'NG',
    accreditation: [],
    scopes: ['aflatoxin'],
    verified: false,           // NOT VERIFIED
    status: 'SUSPENDED',
    lastSynced: '2026-02-01T00:00:00Z',
    createdAt: '2025-12-01T00:00:00Z',
    updatedAt: '2026-02-01T00:00:00Z'
  }
];