/**
 * Lab Ontology - Product to Required Tests Mapping
 * 
 * Dynamically generates required lab fields for any shipment.
 * Allows one engine to handle all products and corridors.
 * 
 * Version: 1.0
 */

/**
 * Lab test type
 */
export type LabTestType = 'aflatoxin' | 'pesticide' | 'microbe' | 'heavy_metal' | 'moisture' | 'histamine' | 'mercury';

/**
 * Required lab tests for a commodity
 */
export interface CommodityLabRequirements {
  commodity: string;
  tests: LabTestType[];
  notes?: string;
}

/**
 * Product → Required Tests mapping
 */
export const LAB_ONTOLOGY: Record<string, CommodityLabRequirements> = {
  sesame: {
    commodity: 'sesame',
    tests: ['aflatoxin', 'pesticide', 'microbe'],
    notes: 'EU requires aflatoxin + pesticide + salmonella for sesame'
  },
  cocoa: {
    commodity: 'cocoa',
    tests: ['aflatoxin', 'heavy_metal'],
    notes: 'Cadmium testing required for EU cocoa products'
  },
  cashew: {
    commodity: 'cashew',
    tests: ['aflatoxin', 'heavy_metal'],
    notes: 'Lead testing for cashews to EU'
  },
  ginger: {
    commodity: 'ginger',
    tests: ['aflatoxin', 'pesticide'],
    notes: 'Ethylene oxide concern for ginger'
  },
  fish: {
    commodity: 'fish',
    tests: ['heavy_metal', 'microbe'],
    notes: 'Mercury for certain fish species, histamine for scombroid'
  },
  coffee: {
    commodity: 'coffee',
    tests: ['aflatoxin', 'pesticide'],
    notes: 'Ochratoxin A concern for coffee'
  },
  spices: {
    commodity: 'spices',
    tests: ['aflatoxin', 'pesticide', 'microbe'],
    notes: 'Multiple requirements for spice exports'
  },
  groundnuts: {
    commodity: 'groundnuts',
    tests: ['aflatoxin', 'pesticide'],
    notes: 'Peanuts = high aflatoxin risk'
  },
  seeds: {
    commodity: 'seeds',
    tests: ['aflatoxin', 'pesticide'],
    notes: 'Edible seeds similar to sesame requirements'
  }
};

/**
 * Substance to test type mapping
 */
export const SUBSTANCE_TO_TEST: Record<string, LabTestType> = {
  // Aflatoxin tests
  aflatoxinB1: 'aflatoxin',
  aflatoxinB2: 'aflatoxin',
  aflatoxinG1: 'aflatoxin',
  aflatoxinG2: 'aflatoxin',
  aflatoxinTotal: 'aflatoxin',
  
  // Pesticide tests
  chlorpyrifos: 'pesticide',
  dichlorvos: 'pesticide',
  ethylene_oxide: 'pesticide',
  pesticide: 'pesticide',
  
  // Microbe tests
  salmonella: 'microbe',
  e_coli: 'microbe',
  listeria: 'microbe',
  
  // Heavy metal tests
  cadmium: 'heavy_metal',
  lead: 'heavy_metal',
  arsenic: 'heavy_metal',
  mercury: 'heavy_metal',
  
  // Other
  moisture: 'moisture',
  histamine: 'histamine'
};

/**
 * Get required tests for a commodity
 */
export function getRequiredTests(commodity: string): LabTestType[] {
  const reqs = LAB_ONTOLOGY[commodity.toLowerCase()];
  return reqs?.tests || [];
}

/**
 * Map substance to test type
 */
export function getTestTypeForSubstance(substance: string): LabTestType | null {
  return SUBSTANCE_TO_TEST[substance.toLowerCase()] || null;
}

/**
 * Check if shipment has required lab tests
 */
export function checkRequiredLabTests(
  commodity: string,
  labResults: Record<string, any>
): { complete: boolean; missing: string[] } {
  const required = getRequiredTests(commodity);
  const missing: string[] = [];
  
  for (const testType of required) {
    // Find substances that map to this test type
    const substances = Object.keys(SUBSTANCE_TO_TEST).filter(
      key => SUBSTANCE_TO_TEST[key] === testType
    );
    
    // Check if any of these substances have results
    const hasResult = substances.some(s => labResults[s] !== undefined);
    
    if (!hasResult) {
      missing.push(testType);
    }
  }
  
  return {
    complete: missing.length === 0,
    missing
  };
}

/**
 * Get substance threshold (MRL) for a corridor
 * 
 * This would be loaded from a rules registry in production
 */
export interface MRLThreshold {
  substance: string;
  limit: number;
  unit: string;
  jurisdiction: string;
}

/**
 * Example MRL data for EU (Netherlands)
 */
export const EU_MRL_THRESHOLDS: MRLThreshold[] = [
  { substance: 'aflatoxinB1', limit: 2.0, unit: 'μg/kg', jurisdiction: 'EU' },
  { substance: 'aflatoxinTotal', limit: 4.0, unit: 'μg/kg', jurisdiction: 'EU' },
  { substance: 'cadmium', limit: 0.5, unit: 'mg/kg', jurisdiction: 'EU' }, // cocoa
  { substance: 'lead', limit: 0.1, unit: 'mg/kg', jurisdiction: 'EU' },
  { substance: 'chlorpyrifos', limit: 0.01, unit: 'mg/kg', jurisdiction: 'EU' },
  { substance: 'ethylene_oxide', limit: 0.1, unit: 'mg/kg', jurisdiction: 'EU' },
  { substance: 'mercury', limit: 1.0, unit: 'mg/kg', jurisdiction: 'EU' }, // fish
  { substance: 'histamine', limit: 100, unit: 'mg/kg', jurisdiction: 'EU' }
];

/**
 * Get MRL threshold for substance + jurisdiction
 */
export function getMRLThreshold(substance: string, jurisdiction: string = 'EU'): MRLThreshold | null {
  return EU_MRL_THRESHOLDS.find(
    t => t.substance === substance.toLowerCase() && t.jurisdiction === jurisdiction
  ) || null;
}

/**
 * Check if lab result exceeds MRL
 */
export function checkMRL(value: number, substance: string, jurisdiction: string = 'EU'): {
  exceeds: boolean;
  threshold?: MRLThreshold;
} {
  const threshold = getMRLThreshold(substance, jurisdiction);
  
  if (!threshold) {
    return { exceeds: false }; // No threshold = no check
  }
  
  return {
    exceeds: value > threshold.limit,
    threshold
  };
}

/**
 * Example: Sesame to NL required tests
 */
export function exampleSesameRequirements() {
  const tests = getRequiredTests('sesame');
  console.log('Sesame required tests:', tests);
  // ['aflatoxin', 'pesticide', 'microbe']
  
  const completeness = checkRequiredLabTests('sesame', {
    aflatoxinB1: 1.5,
    aflatoxinTotal: 2.8
  });
  console.log('Lab completeness check:', completeness);
  // { complete: false, missing: ['pesticide', 'microbe'] }
  
  const mrlCheck = checkMRL(3.5, 'aflatoxinB1', 'EU');
  console.log('MRL check:', mrlCheck);
  // { exceeds: true, threshold: { limit: 2.0, ... } }
}