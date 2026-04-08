/**
 * Unit Normalization & Substance Ontology Schema
 * 
 * Lab heterogeneity is real: labs use different units, naming, and partial substance names.
 * Canonicalization is mandatory: normalize units and map substance names to standard ontology.
 * Failure to normalize → silent compliance errors (false passes or blocks).
 */

export type HazardCategory = 'pesticide' | 'mycotoxin' | 'microbe' | 'heavy_metal' | 'chemical';

export interface SubstanceEntity {
  id: string;                // canonical: "ethylene_oxide"
  name: string;              // full name: "Ethylene Oxide"
  aliases: string[];         // ["EO", "EtO", "EthyleneOxide", "Oxirane"]
  standardUnit: string;      // canonical unit: "mg/kg"
  hazardCategory: HazardCategory;
  description?: string;
}

/**
 * Canonical substance registry
 */
export const SUBSTANCE_REGISTRY: SubstanceEntity[] = [
  {
    id: 'ethylene_oxide',
    name: 'Ethylene Oxide',
    aliases: ['EO', 'EtO', 'EthyleneOxide', 'Oxirane', '1,2-Epoxyethane'],
    standardUnit: 'mg/kg',
    hazardCategory: 'pesticide',
    description: 'Sterilization agent, banned in EU for food contact'
  },
  {
    id: 'aflatoxin_b1',
    name: 'Aflatoxin B1',
    aliases: ['AFB1', 'Aflatoxin B1', 'AFB1', 'AfB1'],
    standardUnit: 'μg/kg',
    hazardCategory: 'mycotoxin',
    description: 'Most potent carcinogenic mycotoxin'
  },
  {
    id: 'aflatoxin_total',
    name: 'Total Aflatoxins',
    aliases: ['AF Total', 'Total Aflatoxins', 'AFB1+AFB2+AFG1+AFG2'],
    standardUnit: 'μg/kg',
    hazardCategory: 'mycotoxin',
    description: 'Sum of B1, B2, G1, G2'
  },
  {
    id: 'salmonella',
    name: 'Salmonella spp.',
    aliases: ['Salmonella', 'S. spp', 'Salmonella spp.'],
    standardUnit: 'cfu/25g',
    hazardCategory: 'microbe',
    description: 'Pathogenic bacteria, zero tolerance'
  },
  {
    id: 'cadmium',
    name: 'Cadmium',
    aliases: ['Cd', 'Cadmium'],
    standardUnit: 'mg/kg',
    hazardCategory: 'heavy_metal',
    description: 'Heavy metal, cumulative toxicant'
  },
  {
    id: 'lead',
    name: 'Lead',
    aliases: ['Pb', 'Lead'],
    standardUnit: 'mg/kg',
    hazardCategory: 'heavy_metal',
    description: 'Heavy metal, neurotoxic'
  },
  {
    id: 'mercury',
    name: 'Mercury',
    aliases: ['Hg', 'Mercury', 'Total Mercury'],
    standardUnit: 'mg/kg',
    hazardCategory: 'heavy_metal',
    description: 'Heavy metal, bioaccumulative'
  },
  {
    id: 'histamine',
    name: 'Histamine',
    aliases: ['His', 'Histamine'],
    standardUnit: 'mg/kg',
    hazardCategory: 'microbe',
    description: 'Scombroid poisoning agent'
  }
];

/**
 * Unit conversion table
 * All conversions go through standard unit
 */
export const UNIT_CONVERSIONS: Record<string, number> = {
  // To mg/kg
  'ppm->mg/kg': 1,
  'ppb->mg/kg': 0.001,
  'g/kg->mg/kg': 1000,
  'μg/g->mg/kg': 1,
  
  // To μg/kg
  'ppm->μg/kg': 1000,
  'mg/kg->μg/kg': 1000,
  'ppb->μg/kg': 1,
  'ng/g->μg/kg': 1,
  
  // To cfu/25g
  'cfu/g->cfu/25g': 25,
  'cfu/100g->cfu/25g': 0.25,
  'mpn/g->cfu/25g': 25  // approximation
};

/**
 * Normalize a value to canonical unit
 */
export function normalizeUnit(
  value: number,
  fromUnit: string,
  toStandardUnit: string
): number {
  if (fromUnit === toStandardUnit) return value;
  
  const key = `${fromUnit}->${toStandardUnit}`;
  const conversion = UNIT_CONVERSIONS[key];
  
  if (conversion === undefined) {
    throw new Error(`Unknown unit conversion: ${fromUnit} -> ${toStandardUnit}`);
  }
  
  return value * conversion;
}

/**
 * Get canonical substance by alias
 */
export function getSubstanceByAlias(alias: string): SubstanceEntity | undefined {
  const normalizedAlias = alias.toLowerCase().trim();
  
  return SUBSTANCE_REGISTRY.find(substance => 
    substance.id === normalizedAlias ||
    substance.aliases.some(a => a.toLowerCase() === normalizedAlias)
  );
}

/**
 * Get canonical substance by ID
 */
export function getSubstanceById(id: string): SubstanceEntity | undefined {
  return SUBSTANCE_REGISTRY.find(s => s.id === id);
}

/**
 * Product → Required Test Mapping
 */
export interface ProductTestMapping {
  product: string;
  commodity: string;
  requiredSubstances: string[];  // canonical substance IDs
}

export const PRODUCT_TEST_MAPPINGS: ProductTestMapping[] = [
  {
    product: 'sesame',
    commodity: 'sesame',
    requiredSubstances: ['ethylene_oxide', 'aflatoxin_b1', 'aflatoxin_total', 'salmonella']
  },
  {
    product: 'cocoa',
    commodity: 'cocoa',
    requiredSubstances: ['aflatoxin_b1', 'cadmium', 'lead']
  },
  {
    product: 'cashew',
    commodity: 'cashew',
    requiredSubstances: ['aflatoxin_b1', 'aflatoxin_total', 'salmonella']
  },
  {
    product: 'ginger',
    commodity: 'ginger',
    requiredSubstances: ['cadmium', 'lead', 'mercury']
  },
  {
    product: 'fish',
    commodity: 'fish',
    requiredSubstances: ['mercury', 'histamine']
  }
];

/**
 * Get required tests for a product
 */
export function getRequiredTestsForProduct(product: string): string[] {
  const mapping = PRODUCT_TEST_MAPPINGS.find(m => 
    m.product === product || m.commodity === product
  );
  return mapping?.requiredSubstances || [];
}

/**
 * Normalize lab result to canonical form
 */
export interface NormalizedLabResult {
  substanceId: string;
  value: number;
  unit: string;            // canonical unit
  originalValue: number;
  originalUnit: string;
}

export function normalizeLabResult(
  substanceAlias: string,
  value: number,
  unit: string
): NormalizedLabResult {
  const substance = getSubstanceByAlias(substanceAlias);
  
  if (!substance) {
    throw new Error(`Unknown substance alias: ${substanceAlias}`);
  }
  
  const normalizedValue = normalizeUnit(value, unit, substance.standardUnit);
  
  return {
    substanceId: substance.id,
    value: normalizedValue,
    unit: substance.standardUnit,
    originalValue: value,
    originalUnit: unit
  };
}

/**
 * Get substance ontology version
 */
export function getSubstanceOntologyVersion(): string {
  return 'v1.2';
}