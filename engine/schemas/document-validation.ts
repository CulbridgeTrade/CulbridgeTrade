/**
 * Document Validation Schema
 * 
 * First-class entity: Required documents per product/corridor.
 * Missing or invalid document → BLOCKER
 * 
 * Version: 1.0
 */

// =====================================================
// DOCUMENT ENTITY
// =====================================================

export interface Document {
  present: boolean;       // true if document is provided
  type: string;           // e.g., "phytosanitary", "certificate_of_origin"
  issueDate?: string;     // ISO date of issuance
  expiryDate?: string;   // ISO date if applicable
  hash?: string;          // SHA256 hash for audit
  reference?: string;    // Document reference number
}

// =====================================================
// DOCUMENT TYPE DEFINITIONS
// =====================================================

export type DocumentType = 
  | 'phytosanitary'
  | 'certificate_of_origin'
  | 'nafdac'
  | 'soncap'
  | 'export_health_certificate'
  | 'lab_report'
  | 'insurance_certificate'
  | 'packing_list'
  | 'invoice';

export type RequirementLevel = 'MANDATORY' | 'OPTIONAL';

// =====================================================
// CORRIDOR-SPECIFIC DOCUMENT MAPPING
// =====================================================

export interface DocumentMapping {
  product: string;
  destination: string;
  documentType: DocumentType;
  requirement: RequirementLevel;
}

// =====================================================
// DOCUMENT MAPPING TABLE
// =====================================================

export const DOCUMENT_MAPPING: DocumentMapping[] = [
  // Netherlands (NL) - Sesame
  { product: 'sesame', destination: 'NL', documentType: 'phytosanitary', requirement: 'MANDATORY' },
  { product: 'sesame', destination: 'NL', documentType: 'certificate_of_origin', requirement: 'MANDATORY' },
  
  // Netherlands (NL) - Cocoa
  { product: 'cocoa', destination: 'NL', documentType: 'phytosanitary', requirement: 'MANDATORY' },
  { product: 'cocoa', destination: 'NL', documentType: 'certificate_of_origin', requirement: 'MANDATORY' },
  { product: 'cocoa', destination: 'NL', documentType: 'nafdac', requirement: 'MANDATORY' },
  
  // Netherlands (NL) - Cashew
  { product: 'cashew', destination: 'NL', documentType: 'phytosanitary', requirement: 'MANDATORY' },
  { product: 'cashew', destination: 'NL', documentType: 'certificate_of_origin', requirement: 'OPTIONAL' },
  
  // Netherlands (NL) - Fish
  { product: 'fish', destination: 'NL', documentType: 'phytosanitary', requirement: 'MANDATORY' },
  { product: 'fish', destination: 'NL', documentType: 'export_health_certificate', requirement: 'MANDATORY' },
  
  // Netherlands (NL) - Ginger
  { product: 'ginger', destination: 'NL', documentType: 'phytosanitary', requirement: 'MANDATORY' },
  { product: 'ginger', destination: 'NL', documentType: 'certificate_of_origin', requirement: 'MANDATORY' },
  
  // Germany (DE) - Sesame
  { product: 'sesame', destination: 'DE', documentType: 'phytosanitary', requirement: 'MANDATORY' },
  { product: 'sesame', destination: 'DE', documentType: 'certificate_of_origin', requirement: 'OPTIONAL' },
  
  // Germany (DE) - Cocoa
  { product: 'cocoa', destination: 'DE', documentType: 'phytosanitary', requirement: 'MANDATORY' },
  { product: 'cocoa', destination: 'DE', documentType: 'nafdac', requirement: 'MANDATORY' },
  
  // Germany (DE) - Cashew
  { product: 'cashew', destination: 'DE', documentType: 'phytosanitary', requirement: 'MANDATORY' },
  
  // Germany (DE) - Fish
  { product: 'fish', destination: 'DE', documentType: 'phytosanitary', requirement: 'MANDATORY' },
  { product: 'fish', destination: 'DE', documentType: 'export_health_certificate', requirement: 'MANDATORY' },
  
  // Belgium (BE) - Sesame
  { product: 'sesame', destination: 'BE', documentType: 'phytosanitary', requirement: 'MANDATORY' },
  { product: 'sesame', destination: 'BE', documentType: 'certificate_of_origin', requirement: 'MANDATORY' },
  
  // France (FR) - Sesame
  { product: 'sesame', destination: 'FR', documentType: 'phytosanitary', requirement: 'MANDATORY' },
  { product: 'sesame', destination: 'FR', documentType: 'certificate_of_origin', requirement: 'MANDATORY' },
];

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Get required documents for a product + destination
 */
export function getRequiredDocuments(product: string, destination: string): DocumentMapping[] {
  return DOCUMENT_MAPPING.filter(
    m => m.product === product && m.destination === destination
  );
}

/**
 * Get mandatory document types
 */
export function getMandatoryDocuments(product: string, destination: string): DocumentType[] {
  const mapping = getRequiredDocuments(product, destination);
  return mapping
    .filter(m => m.requirement === 'MANDATORY')
    .map(m => m.documentType);
}

/**
 * Get optional document types
 */
export function getOptionalDocuments(product: string, destination: string): DocumentType[] {
  const mapping = getRequiredDocuments(product, destination);
  return mapping
    .filter(m => m.requirement === 'OPTIONAL')
    .map(m => m.documentType);
}

// =====================================================
// VALIDATION LOGIC
// =====================================================

export interface DocumentValidationResult {
  valid: boolean;
  blockers: DocumentFlag[];
  warnings: DocumentFlag[];
}

export interface DocumentFlag {
  code: string;
  documentType: string;
  message: string;
  severity: 'BLOCKER' | 'WARNING';
}

/**
 * Validate documents for a shipment
 */
export function validateDocuments(
  shipmentDocuments: Record<string, Document>,
  product: string,
  destination: string
): DocumentValidationResult {
  const blockers: DocumentFlag[] = [];
  const warnings: DocumentFlag[] = [];
  
  // Get required documents for this corridor
  const requiredDocs = getRequiredDocuments(product, destination);
  
  for (const docMapping of requiredDocs) {
    const doc = shipmentDocuments[docMapping.documentType];
    const isPresent = doc?.present === true;
    
    // Check if mandatory document is missing
    if (docMapping.requirement === 'MANDATORY' && !isPresent) {
      blockers.push({
        code: 'MISSING_MANDATORY_DOCUMENT',
        documentType: docMapping.documentType,
        message: `${docMapping.documentType} is mandatory for ${product} → ${destination}`,
        severity: 'BLOCKER'
      });
    }
    
    // Check if optional document is missing (warning only)
    if (docMapping.requirement === 'OPTIONAL' && !isPresent) {
      warnings.push({
        code: 'MISSING_OPTIONAL_DOCUMENT',
        documentType: docMapping.documentType,
        message: `${docMapping.documentType} is optional but not provided`,
        severity: 'WARNING'
      });
    }
    
    // Check expiry date
    if (isPresent && doc.expiryDate) {
      const expiryDate = new Date(doc.expiryDate);
      const now = new Date();
      if (expiryDate < now) {
        blockers.push({
          code: 'EXPIRED_DOCUMENT',
          documentType: docMapping.documentType,
          message: `${docMapping.documentType} is expired (${doc.expiryDate})`,
          severity: 'BLOCKER'
        });
      }
    }
    
    // Check hash (warning if missing)
    if (isPresent && !doc.hash) {
      warnings.push({
        code: 'UNHASHED_DOCUMENT',
        documentType: docMapping.documentType,
        message: `${docMapping.documentType} hash missing - audit trail incomplete`,
        severity: 'WARNING'
      });
    }
  }
  
  return {
    valid: blockers.length === 0,
    blockers,
    warnings
  };
}

// =====================================================
// EXAMPLE VALIDATION (TypeScript demo)
// =====================================================

/*
// Example: Validate sesame to NL
const shipmentDocs: Record<string, Document> = {
  phytosanitary: { present: true, type: 'phytosanitary', hash: 'sha256:abcd1234', issueDate: '2026-03-20' },
  certificate_of_origin: { present: false, type: 'certificate_of_origin' }  // Missing!
};

const result = validateDocuments(shipmentDocs, 'sesame', 'NL');
console.log('Valid:', result.valid);
console.log('Blockers:', result.blockers.length);

// Example: Validate cocoa to DE
const shipmentDocs2: Record<string, Document> = {
  phytosanitary: { present: true, type: 'phytosanitary', hash: 'sha256:efgh5678', issueDate: '2026-03-15' },
  nafdac: { present: true, type: 'nafdac', hash: 'sha256:ijkl9012', issueDate: '2026-03-10' }
};

const result2 = validateDocuments(shipmentDocs2, 'cocoa', 'DE');
console.log('Valid:', result2.valid);
*/

// =====================================================
// ADD TO SHIPMENT SCHEMA
// =====================================================

/**
 * Extended Shipment with documents
 */
export interface ShipmentWithDocuments {
  id: string;
  product: {
    name: string;
    category: string;
  };
  corridor: {
    originCountry: string;
    destinationCountry: string;
  };
  labResults: Record<string, any>;
  documents: Record<string, Document>;  // NEW: Document validation field
  status: 'DRAFT' | 'VALIDATING' | 'READY' | 'REJECTED';
}

/**
 * Full validation flow: Lab + Documents
 */
export function validateShipmentComplete(shipment: ShipmentWithDocuments) {
  const docValidation = validateDocuments(
    shipment.documents,
    shipment.product.category,
    shipment.corridor.destinationCountry
  );
  
  return {
    documentsValid: docValidation.valid,
    documentBlockers: docValidation.blockers,
    documentWarnings: docValidation.warnings
  };
}