/**
 * Minimum Required Data Inputs
 * 
 * Non-negotiable fields required for shipment evaluation.
 * Missing mandatory data → BLOCKER
 * 
 * Version: 1.0
 */

// =====================================================
// PRODUCT INFO
// =====================================================

export interface ProductInfo {
  name: string;        // e.g., "sesame seeds"
  hsCode: string;      // e.g., "120740"
  category: string;   // e.g., "plant", "animal", "food"
  batchId: string;    // e.g., "NG-SES-20260328"
}

// =====================================================
// CORRIDOR
// =====================================================

export interface Corridor {
  originCountry: string;      // e.g., "NG"
  destinationCountry: string; // e.g., "NL", "DE"
}

// =====================================================
// LAB RESULT
// =====================================================

export interface LabResult {
  value: number;       // Measured result
  unit: string;        // Normalized: "mg/kg", "μg/kg"
  labId: string;       // Must map to verified LabEntity
  testDate: string;   // ISO string
  reportHash: string; // SHA256 for audit
  method?: string;     // e.g., "GC-MS", "HPLC"
}

// =====================================================
// DOCUMENTS
// =====================================================

export interface Document {
  present: boolean;
  hash?: string;
  reference?: string;
}

// =====================================================
// METADATA (Optional)
// =====================================================

export interface ShipmentMetadata {
  weight?: number;        // kg
  volume?: number;        // cubic meters
  containerNumber?: string;
}

// =====================================================
// RISK PROFILE (Optional but Critical)
// =====================================================

export interface RiskProfile {
  previousRasffAlerts?: string[];  // e.g., ["RASFF2023-123"]
  countryRiskFlags?: Record<string, string>; // e.g., { "ethylene_oxide": "HIGH" }
}

// =====================================================
// COMPLETE SHIPMENT
// =====================================================

export interface Shipment {
  id: string;
  product: ProductInfo;
  corridor: Corridor;
  labResults: Record<string, LabResult>;  // substance → result
  documents: Record<string, Document>;    // doc type → presence
  metadata?: ShipmentMetadata;
  riskProfile?: RiskProfile;
  status: 'DRAFT' | 'VALIDATING' | 'READY' | 'REJECTED';
}

// =====================================================
// REQUIRED FIELD VALIDATION
// =====================================================

export const MANDATORY_PRODUCT_FIELDS = ['name', 'hsCode', 'category', 'batchId'];
export const MANDATORY_CORRIDOR_FIELDS = ['originCountry', 'destinationCountry'];
export const MANDATORY_LAB_FIELDS = ['value', 'unit', 'labId', 'testDate', 'reportHash'];

export interface ValidationResult {
  valid: boolean;
  missing: string[];
  errors: string[];
}

/**
 * Validate shipment has all mandatory fields
 */
export function validateShipmentInputs(shipment: any): ValidationResult {
  const missing: string[] = [];
  const errors: string[] = [];
  
  // Product validation
  if (!shipment.product) {
    missing.push('product');
  } else {
    for (const field of MANDATORY_PRODUCT_FIELDS) {
      if (!shipment.product[field]) {
        missing.push(`product.${field}`);
      }
    }
  }
  
  // Corridor validation
  if (!shipment.corridor) {
    missing.push('corridor');
  } else {
    for (const field of MANDATORY_CORRIDOR_FIELDS) {
      if (!shipment.corridor[field]) {
        missing.push(`corridor.${field}`);
      }
    }
  }
  
  // Lab results validation
  if (!shipment.labResults || Object.keys(shipment.labResults).length === 0) {
    missing.push('labResults');
  } else {
    for (const [substance, result] of Object.entries(shipment.labResults as Record<string, LabResult>)) {
      for (const field of MANDATORY_LAB_FIELDS) {
        if (!result[field as keyof LabResult]) {
          errors.push(`labResults.${substance}.${field} is required`);
        }
      }
    }
  }
  
  // Documents validation (basic check)
  if (!shipment.documents) {
    missing.push('documents');
  }
  
  return {
    valid: missing.length === 0 && errors.length === 0,
    missing,
    errors
  };
}

// =====================================================
// CORRIDOR-SPECIFIC REQUIREMENTS
// =====================================================

export interface CorridorRequirements {
  destination: string;
  product: string;
  requiredLabTests: string[];
  requiredDocuments: string[];
}

/**
 * Corridor → Required tests mapping
 */
export const CORRIDOR_REQUIREMENTS: Record<string, Record<string, CorridorRequirements>> = {
  'NL': {
    'sesame': {
      destination: 'NL',
      product: 'sesame',
      requiredLabTests: ['ethylene_oxide', 'aflatoxin', 'salmonella'],
      requiredDocuments: ['phytosanitary', 'certificateOfOrigin']
    },
    'cocoa': {
      destination: 'NL',
      product: 'cocoa',
      requiredLabTests: ['aflatoxin', 'cadmium'],
      requiredDocuments: ['nafdac', 'certificateOfOrigin']
    },
    'cashew': {
      destination: 'NL',
      product: 'cashew',
      requiredLabTests: ['aflatoxin', 'lead'],
      requiredDocuments: ['certificateOfOrigin']
    }
  },
  'DE': {
    'sesame': {
      destination: 'DE',
      product: 'sesame',
      requiredLabTests: ['ethylene_oxide', 'aflatoxin', 'salmonella'],
      requiredDocuments: ['phytosanitary']  // CoO optional for DE
    },
    'cocoa': {
      destination: 'DE',
      product: 'cocoa',
      requiredLabTests: ['aflatoxin', 'cadmium'],
      requiredDocuments: ['nafdac']
    }
  }
};

/**
 * Get required tests for corridor + product
 */
export function getRequiredTests(destination: string, product: string): string[] {
  const destRequirements = CORRIDOR_REQUIREMENTS[destination];
  if (!destRequirements) return [];
  const productReq = destRequirements[product];
  return productReq?.requiredLabTests || [];
}

/**
 * Get required documents for corridor + product
 */
export function getRequiredDocuments(destination: string, product: string): string[] {
  const destRequirements = CORRIDOR_REQUIREMENTS[destination];
  if (!destRequirements) return [];
  const productReq = destRequirements[product];
  return productReq?.requiredDocuments || [];
}

// =====================================================
// PRE-FLIGHT VALIDATION EXAMPLE
// =====================================================

/**
 * Example: Validate shipment ready for engine evaluation
 */
export function preFlightCheck(shipment: any): { ready: boolean; blockers: string[] } {
  const blockers: string[] = [];
  
  // 1. Check mandatory inputs
  const inputValidation = validateShipmentInputs(shipment);
  if (!inputValidation.valid) {
    if (inputValidation.missing.length > 0) {
      blockers.push(`Missing mandatory fields: ${inputValidation.missing.join(', ')}`);
    }
    if (inputValidation.errors.length > 0) {
      blockers.push(...inputValidation.errors);
    }
    return { ready: false, blockers };
  }
  
  // 2. Get required tests for corridor
  const requiredTests = getRequiredTests(
    shipment.corridor.destinationCountry,
    shipment.product.category
  );
  
  // 3. Check required lab tests exist
  const presentTests = Object.keys(shipment.labResults);
  for (const test of requiredTests) {
    if (!presentTests.includes(test)) {
      blockers.push(`Required lab test missing: ${test}`);
    }
  }
  
  // 4. Check required documents exist
  const requiredDocs = getRequiredDocuments(
    shipment.corridor.destinationCountry,
    shipment.product.category
  );
  for (const doc of requiredDocs) {
    if (!shipment.documents[doc]?.present) {
      blockers.push(`Required document missing: ${doc}`);
    }
  }
  
  return {
    ready: blockers.length === 0,
    blockers
  };
}

/**
 * Example: Full validation + evaluation flow
 */
export function validateAndEvaluate(shipment: any) {
  // Pre-flight check
  const preFlight = preFlightCheck(shipment);
  if (!preFlight.ready) {
    return {
      status: 'BLOCKED',
      blockers: preFlight.blockers,
      stage: 'PRE_FLIGHT'
    };
  }
  
  // Continue with engine evaluation...
  return {
    status: 'READY_FOR_EVALUATION',
    blockers: []
  };
}