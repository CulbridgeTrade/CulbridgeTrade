/**
 * MRL Risk Scan Engine
 * 
 * Implements the Farm-to-Port compliance logic from the technical brief.
 * Pulls farm sources, pesticide logs, queries EU MRL, and outputs risk score.
 */

const { run, get, all } = require('../utils/db');

const RISK_LEVELS = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
};

// Half-life table for top 50 pesticides (default 14 days if unknown)
const PESTICIDE_HALFLIFE_TABLE = {
  'Chlorpyrifos': 30,
  'Endosulfan': 50,
  'Cypermethrin': 30,
  'Carbosulfan': 40,
  'Lindane': 26,
  'Pirimiphos-methyl': 20,
  'Carbofuran': 60,
  'Dimethoate': 7,
  'Profenofos': 25,
  'Lambda-cyhalothrin': 21,
  'DDT': 3000,
  'Malathion': 3,
  'Permethrin': 30,
  'Fipronil': 200,
  'Imidacloprid': 191,
  'Glyphosate': 3
};

/**
 * Run MRL Risk Scan for a shipment
 * Returns RiskAssessment object with chemical breakdown
 */
async function calculateMRLRisk(shipmentId) {
  // Get linked farms and crops for this shipment
  const shipmentFarms = await all(`
    SELECT sf.*, f.state, f.zone, c.crop_name
    FROM shipment_farms sf
    JOIN farms f ON sf.farm_id = f.farm_id
    JOIN crop_records c ON sf.crop_id = c.crop_id
    WHERE sf.shipment_id = ?
  `, [shipmentId]);

  if (shipmentFarms.length === 0) {
    return {
      shipment_risk_level: RISK_LEVELS.MEDIUM,
      chemical_breakdown: [],
      lab_test_required: true,
      shipment_blocked: false,
      reason: 'No farm sources linked to shipment',
      generated_at: new Date().toISOString()
    };
  }

  // Get harvest date from first crop record
  const firstFarm = shipmentFarms[0];
  const cropName = firstFarm.crop_name;
  const harvestDate = firstFarm.expected_harvest || new Date();

  // Get all pesticide logs for linked farms/crops
  const pesticideLogs = await all(`
    SELECT pl.*, c.crop_name
    FROM pesticide_logs pl
    JOIN crop_records c ON pl.crop_id = c.crop_id
    WHERE pl.farm_id IN (SELECT farm_id FROM shipment_farms WHERE shipment_id = ?)
  `, [shipmentId]);

  const risks = [];

  // Query EU MRL for each pesticide × commodity combination
  for (const log of pesticideLogs) {
    const mrlRecord = await queryEUMRL(log.active_ingredient, cropName);
    const daysSinceApplication = daysBetween(log.application_date, harvestDate);

    // Step 1: PHI compliance check
    const phiCompliant = daysSinceApplication >= log.pre_harvest_interval_days;

    // Step 2: Estimate residue (simplified decay model)
    const estimatedResidue = estimateResidue(
      log.dosage_per_hectare,
      log.active_ingredient,
      daysSinceApplication
    );

    // Step 3: Compare to EU MRL
    const mrlValue = mrlRecord?.mrl_value || 0.01;
    const mrlBreachRatio = mrlRecord ? (estimatedResidue / mrlValue) : 1;

    // Step 4: Score per chemical
    let chemicalRisk = RISK_LEVELS.LOW;
    
    if (!mrlRecord || mrlRecord.is_default_mrl) {
      chemicalRisk = RISK_LEVELS.HIGH;
    } else if (!phiCompliant) {
      chemicalRisk = RISK_LEVELS.HIGH;
    } else if (mrlBreachRatio > 1.5) {
      chemicalRisk = RISK_LEVELS.CRITICAL;
    } else if (mrlBreachRatio > 0.8) {
      chemicalRisk = RISK_LEVELS.HIGH;
    } else if (mrlBreachRatio > 0.5) {
      chemicalRisk = RISK_LEVELS.MEDIUM;
    }

    risks.push({
      active_ingredient: log.active_ingredient,
      pesticide_name: log.pesticide_name,
      farm_id: log.farm_id,
      eu_mrl: mrlValue,
      estimated_residue: Math.round(estimatedResidue * 10000) / 10000,
      mrl_breach_ratio: Math.round(mrlBreachRatio * 100) / 100,
      phi_compliant: phiCompliant,
      days_since_application: daysSinceApplication,
      pre_harvest_interval_days: log.pre_harvest_interval_days,
      risk_level: chemicalRisk,
      recommendation: generateRecommendation(chemicalRisk, phiCompliant, mrlRecord)
    });
  }

  // Overall shipment risk = highest individual chemical risk
  const overallRisk = getHighestRisk(risks);

  // Get current MRL database version
  const mrlVersion = await getCurrentMRLVersion();

  return {
    shipment_risk_level: overallRisk,
    chemical_breakdown: risks,
    lab_test_required: overallRisk === RISK_LEVELS.HIGH || overallRisk === RISK_LEVELS.CRITICAL,
    shipment_blocked: overallRisk === RISK_LEVELS.CRITICAL,
    farms_count: shipmentFarms.length,
    pesticides_logged: pesticideLogs.length,
    generated_at: new Date().toISOString(),
    mrl_database_version: mrlVersion
  };
}

/**
 * Query EU MRL database for ingredient × commodity
 */
async function queryEUMRL(activeIngredient, commodity) {
  // First check the curated risk matrix
  const matrix = await get(`
    SELECT * FROM pesticide_commodity_risk_matrix 
    WHERE active_ingredient = ? AND commodity = ?
  `, [activeIngredient, commodity]);

  if (matrix) {
    return {
      mrl_value: matrix.eu_mrl_mg_kg,
      is_default_mrl: matrix.is_default_mrl,
      is_banned_in_eu: matrix.is_banned_in_eu
    };
  }

  // Fall back to EU MRL database
  const mrl = await get(`
    SELECT * FROM eu_mrl_database 
    WHERE active_ingredient = ? AND commodity = ? AND version = (
      SELECT MAX(version) FROM eu_mrl_database
    )
  `, [activeIngredient, commodity]);

  return mrl || null;
}

/**
 * Estimate residue using first-order decay model
 */
function estimateResidue(dosagePerHectare, activeIngredient, daysSinceApplication) {
  const halfLife = PESTICIDE_HALFLIFE_TABLE[activeIngredient] || 14;
  const decayFactor = Math.pow(0.5, daysSinceApplication / halfLife);
  const initialDeposit = dosagePerHectare * 0.05;
  return initialDeposit * decayFactor;
}

/**
 * Get days between two dates
 */
function daysBetween(date1, date2) {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffTime = Math.abs(d2 - d1);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Get highest risk level from array
 */
function getHighestRisk(risks) {
  if (!risks || risks.length === 0) return RISK_LEVELS.LOW;
  
  const priority = {
    'CRITICAL': 4,
    'HIGH': 3,
    'MEDIUM': 2,
    'LOW': 1
  };

  let highest = RISK_LEVELS.LOW;
  for (const r of risks) {
    if (priority[r.risk_level] > priority[highest]) {
      highest = r.risk_level;
    }
  }
  return highest;
}

/**
 * Generate recommendation based on risk level
 */
function generateRecommendation(riskLevel, phiCompliant, mrlRecord) {
  if (riskLevel === RISK_LEVELS.CRITICAL) {
    return 'Submit samples to EU-accredited lab immediately. Do not ship until lab confirms compliance.';
  }
  if (riskLevel === RISK_LEVELS.HIGH) {
    if (!phiCompliant) {
      return 'Pre-harvest interval not respected. Wait required days or submit for lab testing.';
    }
    return 'Lab test required before shipment can proceed.';
  }
  if (riskLevel === RISK_LEVELS.MEDIUM) {
    return 'Lab test strongly recommended.';
  }
  return 'Clear to proceed.';
}

/**
 * Get current MRL database version
 */
async function getCurrentMRLVersion() {
  const result = await get(`
    SELECT MAX(version) as version FROM eu_mrl_database
  `);
  return result?.version || 'unknown';
}

/**
 * Evaluate Shipment Gate - determines if shipment can proceed
 */
async function evaluateShipmentGate(shipmentId, mrlAssessment, labResult) {
  const { shipment_risk_level, chemical_breakdown } = mrlAssessment;

  // CRITICAL risk: hard block
  if (shipment_risk_level === RISK_LEVELS.CRITICAL) {
    return {
      status: 'BLOCKED',
      can_proceed: false,
      reason: 'One or more pesticides exceed EU MRL threshold.',
      required_actions: [
        'Submit samples to EU-accredited lab immediately',
        'Do not load or ship until lab result confirms compliance',
        'Contact Culbridge compliance team for re-assessment'
      ]
    };
  }

  // HIGH risk: blocked until lab test uploaded and cleared
  if (shipment_risk_level === RISK_LEVELS.HIGH && !labResult) {
    return {
      status: 'LAB_TEST_REQUIRED',
      can_proceed: false,
      reason: 'MRL risk is high. Lab test required before shipment can advance.',
      required_actions: [
        'Request lab test via Culbridge lab network',
        'Upload lab result when available',
        'Shipment will auto-advance if result shows compliance'
      ]
    };
  }

  // HIGH risk with lab result
  if (shipment_risk_level === RISK_LEVELS.HIGH && labResult) {
    if (labResult.passed_eu_mrl) {
      return { status: 'LAB_TEST_CLEARED', can_proceed: true };
    } else {
      return {
        status: 'LAB_TEST_FAILED',
        can_proceed: false,
        reason: `Lab confirmed MRL breach: ${labResult.failed_chemicals?.join(', ') || 'unknown chemicals'}`,
        required_actions: [
          'Do not ship this lot',
          'Investigate farm source',
          'Consider re-treatment or disposal'
        ]
      };
    }
  }

  // MEDIUM risk: advisory, not a block
  if (shipment_risk_level === RISK_LEVELS.MEDIUM) {
    return {
      status: 'MRL_SCAN_PASSED',
      can_proceed: true,
      advisory: 'Medium MRL risk detected. Lab test strongly recommended.',
      warning_chemicals: chemical_breakdown
        .filter(c => c.risk_level === RISK_LEVELS.MEDIUM)
        .map(c => c.active_ingredient)
    };
  }

  // LOW risk: clear to proceed
  return {
    status: 'MRL_SCAN_PASSED',
    can_proceed: true
  };
}

/**
 * Link farms to a shipment for MRL tracking
 */
async function linkFarmsToShipment(shipmentId, farmCropPairs) {
  for (const { farm_id, crop_id } of farmCropPairs) {
    await run(`
      INSERT OR IGNORE INTO shipment_farms (shipment_id, farm_id, crop_id)
      VALUES (?, ?, ?)
    `, [shipmentId, farm_id, crop_id]);
  }
}

/**
 * Save MRL assessment to database
 */
async function saveMRLAssessment(shipmentId, assessment) {
  await run(`
    INSERT INTO shipment_mrl_assessments (
      shipment_id, commodity, harvest_date, shipment_risk_level,
      chemical_breakdown, lab_test_required, shipment_blocked, mrl_database_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    shipmentId,
    assessment.commodity || 'unknown',
    assessment.harvest_date || null,
    assessment.shipment_risk_level,
    JSON.stringify(assessment.chemical_breakdown),
    assessment.lab_test_required,
    assessment.shipment_blocked,
    assessment.mrl_database_version
  ]);
}

/**
 * Save gate decision to database
 */
async function saveGateDecision(shipmentId, decision) {
  await run(`
    INSERT INTO shipment_gate_decisions (
      shipment_id, decision_status, can_proceed, reason,
      required_actions, advisory, warning_chemicals
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    shipmentId,
    decision.status,
    decision.can_proceed,
    decision.reason,
    JSON.stringify(decision.required_actions || []),
    decision.advisory || null,
    JSON.stringify(decision.warning_chemicals || [])
  ]);
}

module.exports = {
  calculateMRLRisk,
  evaluateShipmentGate,
  linkFarmsToShipment,
  saveMRLAssessment,
  saveGateDecision,
  RISK_LEVELS,
  PESTICIDE_HALFLIFE_TABLE,
  estimateResidue,
  daysBetween
};
