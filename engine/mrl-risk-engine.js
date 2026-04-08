const db = require('../utils/db');

// EU MRL lookup (stub - ingest from EU DB)
const EU_MRL_DB = {
  'Chlorpyrifos': { sesame: 0.05, cocoa: 0.01 },
  'Endosulfan': { sesame: 0.01, cocoa: 0.01 },
  // Add top 50
};

function estimateResidue(dosage, ingredient, days) {
  const halfLife = HALFLIFE_TABLE[ingredient] || 14;
  const decayFactor = Math.pow(0.5, days / halfLife);
  return dosage * 0.05 * decayFactor; // 5% initial deposit
}

const HALFLIFE_TABLE = {
  'Chlorpyrifos': 30,
  'Endosulfan': 50,
};

function calculateMRLRisk(pesticideLogs, commodity, harvestDate) {
  const risks = [];
  for (const log of pesticideLogs) {
    const days = (new Date(harvestDate) - new Date(log.application_date)) / (1000*60*60*24);
    const mrlRecord = EU_MRL_DB[log.active_ingredient]?.[commodity] || 0.01; // default
    const phiCompliant = days >= log.pre_harvest_interval_days;
    const estimatedResidue = estimateResidue(log.dosage_per_hectare, log.active_ingredient, days);
    const breachRatio = estimatedResidue / mrlRecord;

    let riskLevel = 'LOW';
    if (mrlRecord === 0.01 || !phiCompliant || breachRatio > 1.5) riskLevel = 'CRITICAL';
    else if (breachRatio > 0.8) riskLevel = 'HIGH';
    else if (breachRatio > 0.5) riskLevel = 'MEDIUM';

    risks.push({ ingredient: log.active_ingredient, riskLevel, breachRatio });
  }
  const overall = risks.length ? Math.max(...risks.map(r => r.riskLevel)) : 'LOW';
  return { shipment_risk_level: overall, chemical_breakdown: risks };
}

module.exports = { calculateMRLRisk };

