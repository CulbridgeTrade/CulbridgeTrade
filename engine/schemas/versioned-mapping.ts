/**
 * Versioned Product-Corridor Mapping Schema
 * 
 * Maps product category → required tests/documents → corridor with versioning.
 * Engine dynamically selects version based on shipment date or mapping snapshot.
 */

export interface ProductCorridorMapping {
  id: string;                // e.g., "map_sesame_nl_v3"
  version: string;           // e.g., "v3"
  productCategory: string;   // e.g., "plant", "seafood", "spice"
  commodity?: string;        // specific commodity, e.g., "sesame", "cocoa"
  corridor: string;          // e.g., "NL", "DE", "BE", "FR"
  requiredSubstances: string[];   // canonical SubstanceEntity.id
  requiredDocuments: string[];    // canonical Document.type
  mrlThresholds: Record<string, number>;  // substanceId → max residue limit
  validFrom: string;         // ISO 8601, version start date
  validTo?: string;          // ISO 8601, version end date (null = current)
  createdAt: string;
  updatedAt: string;
}

/**
 * Example mappings
 */
export const SAMPLE_MAPPINGS: ProductCorridorMapping[] = [
  {
    id: 'map_sesame_nl',
    version: 'v3',
    productCategory: 'plant',
    commodity: 'sesame',
    corridor: 'NL',
    requiredSubstances: [
      'ethylene_oxide',
      'aflatoxin_b1',
      'aflatoxin_total',
      'salmonella'
    ],
    requiredDocuments: ['phytosanitary', 'certificate_of_origin'],
    mrlThresholds: {
      'ethylene_oxide': 0.02,
      'aflatoxin_b1': 2.0,
      'aflatoxin_total': 4.0
    },
    validFrom: '2024-01-01T00:00:00Z',
    validTo: '2025-12-31T23:59:59Z',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-06-01T00:00:00Z'
  },
  {
    id: 'map_cocoa_nl',
    version: 'v2',
    productCategory: 'plant',
    commodity: 'cocoa',
    corridor: 'NL',
    requiredSubstances: [
      'aflatoxin_b1',
      'cadmium',
      'lead'
    ],
    requiredDocuments: ['phytosanitary', 'certificate_of_origin', 'nafdac_cert'],
    mrlThresholds: {
      'aflatoxin_b1': 5.0,
      'cadmium': 0.6,
      'lead': 0.5
    },
    validFrom: '2024-01-01T00:00:00Z',
    validTo: '2025-12-31T23:59:59Z',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-03-15T00:00:00Z'
  },
  {
    id: 'map_cashew_de',
    version: 'v1',
    productCategory: 'nut',
    commodity: 'cashew',
    corridor: 'DE',
    requiredSubstances: [
      'aflatoxin_b1',
      'aflatoxin_total',
      'salmonella'
    ],
    requiredDocuments: ['phytosanitary'],
    mrlThresholds: {
      'aflatoxin_b1': 2.0,
      'aflatoxin_total': 10.0
    },
    validFrom: '2024-01-01T00:00:00Z',
    validTo: undefined,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z'
  },
  {
    id: 'map_ginger_nl',
    version: 'v1',
    productCategory: 'spice',
    commodity: 'ginger',
    corridor: 'NL',
    requiredSubstances: [
      'cadmium',
      'lead',
      'mercury'
    ],
    requiredDocuments: ['phytosanitary', 'certificate_of_origin'],
    mrlThresholds: {
      'cadmium': 0.5,
      'lead': 0.3,
      'mercury': 0.1
    },
    validFrom: '2024-05-01T00:00:00Z',
    validTo: undefined,
    createdAt: '2024-05-01T00:00:00Z',
    updatedAt: '2024-05-01T00:00:00Z'
  }
];

/**
 * Get applicable mapping for a shipment
 */
export function getApplicableMapping(
  mappings: ProductCorridorMapping[],
  productCategory: string,
  corridor: string,
  commodity?: string,
  shipmentDate?: string
): ProductCorridorMapping | undefined {
  const date = shipmentDate || new Date().toISOString();
  
  // Find mappings that match product/corridor (and optionally commodity)
  const candidates = mappings.filter(m => {
    if (m.corridor !== corridor) return false;
    if (m.productCategory !== productCategory) return false;
    if (commodity && m.commodity && m.commodity !== commodity) return false;
    
    // Check date validity
    if (m.validFrom > date) return false;
    if (m.validTo && m.validTo < date) return false;
    
    return true;
  });
  
  // If commodity specified, prefer that match
  if (commodity) {
    const commodityMatch = candidates.find(m => m.commodity === commodity);
    if (commodityMatch) return commodityMatch;
  }
  
  // Return most recent valid mapping
  return candidates.sort((a, b) => 
    new Date(b.validFrom).getTime() - new Date(a.validFrom).getTime()
  )[0];
}

/**
 * Get required tests for a mapping
 */
export function getRequiredTests(mapping: ProductCorridorMapping): string[] {
  return mapping.requiredSubstances;
}

/**
 * Get required documents for a mapping
 */
export function getRequiredDocuments(mapping: ProductCorridorMapping): string[] {
  return mapping.requiredDocuments;
}