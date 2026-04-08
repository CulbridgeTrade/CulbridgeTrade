/**
 * Versioned Lab Entity Schema
 * 
 * Lab registry tracks versioned metadata. If lab accreditation or status changes,
 * a new version is created. Engine references lab version used at shipment
 * evaluation for deterministic compliance.
 */

export type LabStatus = 'ACTIVE' | 'SUSPENDED' | 'REVOKED';

export interface LabAccreditation {
  body: string;              // e.g., "ISO/IEC 17025", "NAFDAC", "SON"
  number: string;
  validFrom: string;
  validTo?: string;
  scope: string[];           // e.g., ["aflatoxin", "pesticides", "heavy_metals"]
}

export interface LabEntity {
  id: string;                // e.g., "lab_ng_001"
  version: string;            // e.g., "v4"
  name: string;              // e.g., "SGS Nigeria"
  country: string;           // e.g., "NG"
  region?: string;           // e.g., "Lagos"
  accreditation: LabAccreditation[];
  scopes: string[];          // e.g., ["sesame", "cocoa", "cashew", "ginger"]
  verified: boolean;         // manual verification flag
  status: LabStatus;
  lastSynced: string;        // timestamp of last authoritative check
  createdAt: string;
  updatedAt: string;
}

/**
 * Example lab instances
 */
export const SAMPLE_LABS: LabEntity[] = [
  {
    id: 'lab_ng_001',
    version: 'v4',
    name: 'SGS Nigeria - Lagos',
    country: 'NG',
    region: 'Lagos',
    accreditation: [
      {
        body: 'ISO/IEC 17025',
        number: 'ISO17025-LAB-001',
        validFrom: '2023-01-01T00:00:00Z',
        validTo: '2026-12-31T23:59:59Z',
        scope: ['aflatoxin', 'pesticides', 'heavy_metals', 'microbiology']
      },
      {
        body: 'NAFDAC',
        number: 'NAFDAC-LAB-2023-001',
        validFrom: '2023-01-01T00:00:00Z',
        validTo: '2025-12-31T23:59:59Z',
        scope: ['sesame', 'cocoa']
      }
    ],
    scopes: ['sesame', 'cocoa', 'cashew', 'ginger'],
    verified: true,
    status: 'ACTIVE',
    lastSynced: '2024-06-15T10:00:00Z',
    createdAt: '2022-01-01T00:00:00Z',
    updatedAt: '2024-06-15T10:00:00Z'
  },
  {
    id: 'lab_ng_002',
    version: 'v2',
    name: 'Bureau Veritas Nigeria',
    country: 'NG',
    region: 'Port Harcourt',
    accreditation: [
      {
        body: 'ISO/IEC 17025',
        number: 'ISO17025-LAB-002',
        validFrom: '2023-06-01T00:00:00Z',
        validTo: '2026-05-31T23:59:59Z',
        scope: ['aflatoxin', 'pesticides']
      }
    ],
    scopes: ['sesame', 'cocoa'],
    verified: true,
    status: 'ACTIVE',
    lastSynced: '2024-05-20T14:00:00Z',
    createdAt: '2023-06-01T00:00:00Z',
    updatedAt: '2024-05-20T14:00:00Z'
  },
  {
    id: 'lab_ng_003',
    version: 'v1',
    name: 'Nigerian Quality Labs',
    country: 'NG',
    region: 'Abuja',
    accreditation: [
      {
        body: 'SON',
        number: 'SON-LAB-001',
        validFrom: '2024-01-01T00:00:00Z',
        validTo: '2025-12-31T23:59:59Z',
        scope: ['basic_chemistry']
      }
    ],
    scopes: ['sesame'],
    verified: false,
    status: 'SUSPENDED',
    lastSynced: '2024-07-01T09:00:00Z',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-07-01T09:00:00Z'
  }
];

/**
 * Check if lab can perform a specific test
 */
export function labCanPerformTest(lab: LabEntity, substanceId: string): boolean {
  if (lab.status !== 'ACTIVE') return false;
  
  // Map substance to test scope
  const substanceToScope: Record<string, string> = {
    'ethylene_oxide': 'pesticides',
    'aflatoxin_b1': 'aflatoxin',
    'aflatoxin_total': 'aflatoxin',
    'salmonella': 'microbiology',
    'cadmium': 'heavy_metals',
    'lead': 'heavy_metals',
    'mercury': 'heavy_metals',
    'histamine': 'microbiology'
  };
  
  const requiredScope = substanceToScope[substanceId];
  if (!requiredScope) return true; // Unknown substance, allow
  
  return lab.accreditation.some(
    acc => acc.scope.includes(requiredScope) && 
           (!acc.validTo || new Date(acc.validTo) > new Date())
  );
}

/**
 * Get active lab version
 */
export function getActiveLabVersion(labs: LabEntity[], labId: string): LabEntity | undefined {
  const lab = labs.find(l => l.id === labId);
  if (!lab) return undefined;
  if (lab.status !== 'ACTIVE') return undefined;
  return lab;
}