/**
 * Regulatory Intelligence Service
 * 
 * Implements regulatory monitoring, change detection, gap index, and alerts.
 */

const { run, get, all } = require('../utils/db');
const crypto = require('crypto');

const CHANGE_TYPES = {
  MRL_REDUCTION: 'MRL_REDUCTION',
  MRL_INCREASE: 'MRL_INCREASE',
  MRL_NEW: 'MRL_NEW',
  MRL_REMOVED: 'MRL_REMOVED',
  PESTICIDE_BAN: 'PESTICIDE_BAN',
  ENHANCED_MONITORING_ADDED: 'ENHANCED_MONITORING_ADDED',
  ENHANCED_MONITORING_REMOVED: 'ENHANCED_MONITORING_REMOVED',
  IMPORT_FREQUENCY_CHANGED: 'IMPORT_FREQUENCY_CHANGED',
  NEW_CERTIFICATION_REQUIRED: 'NEW_CERTIFICATION_REQUIRED',
  CONTAMINANT_LIMIT_CHANGED: 'CONTAMINANT_LIMIT_CHANGED',
  REGULATION_AMENDMENT: 'REGULATION_AMENDMENT',
  NEW_REGULATION: 'NEW_REGULATION'
};

const CHANGE_SEVERITY = {
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  INFORMATIONAL: 'INFORMATIONAL'
};

const GAP_DIMENSIONS = {
  PESTICIDE_MRL: 'PESTICIDE_MRL',
  BANNED_PESTICIDE_USAGE: 'BANNED_PESTICIDE_USAGE',
  MYCOTOXIN_LIMIT: 'MYCOTOXIN_LIMIT',
  HEAVY_METAL_LIMIT: 'HEAVY_METAL_LIMIT',
  LABORATORY_STANDARD: 'LABORATORY_STANDARD',
  TRACEABILITY_REQUIREMENT: 'TRACEABILITY_REQUIREMENT',
  DOCUMENTATION_FORMAT: 'DOCUMENTATION_FORMAT',
  CERTIFICATION_RECOGNITION: 'CERTIFICATION_RECOGNITION'
};

const INITIAL_GAP_INDEX = [
  {
    commodity: 'Sesame Seeds',
    dimension: 'PESTICIDE_MRL',
    nigerian_standard: 'Chlorpyrifos registered and widely used in Nigeria for sesame',
    eu_standard: 'EU MRL for Chlorpyrifos on sesame: 0.01 mg/kg (default — effectively banned)',
    gap_description: 'Nigeria permits Chlorpyrifos use on sesame. The EU has set the MRL at 0.01 mg/kg — detection limit — making any Chlorpyrifos use on EU-bound sesame a breach.',
    gap_severity: 'CRITICAL',
    practical_impact: 'Any sesame farmer using Chlorpyrifos will likely cause an EU rejection. This is the single largest cause of Nigerian sesame rejections.',
    historical_rejection_contribution: 54,
    gap_closure_action: 'Replace Chlorpyrifos with EU-compliant alternatives: Lambda-cyhalothrin (within MRL) or biological controls. Enforce minimum 60-day PHI.',
    gap_closure_difficulty: 'MODERATE',
    eu_regulation_reference: 'EU Reg 2023/915'
  },
  {
    commodity: 'Sesame Seeds',
    dimension: 'BANNED_PESTICIDE_USAGE',
    nigerian_standard: 'Endosulfan available in some Nigerian markets despite national ban',
    eu_standard: 'Endosulfan is completely banned in the EU with zero tolerance',
    gap_description: 'Endosulfan was banned in Nigeria in 2011 but remains available. Any trace = automatic rejection.',
    gap_severity: 'CRITICAL',
    historical_rejection_contribution: 18,
    gap_closure_action: 'Farm-level verification that Endosulfan is not in use. Lab test specifically for Endosulfan.',
    gap_closure_difficulty: 'HARD',
    eu_regulation_reference: 'EU Reg 2023/915'
  },
  {
    commodity: 'Cocoa Beans',
    dimension: 'MYCOTOXIN_LIMIT',
    nigerian_standard: 'No mandatory pre-export ochratoxin testing in Nigeria',
    eu_standard: 'EU limit for Ochratoxin A in cocoa: 30 ppb roasted, 10 ppb processed',
    gap_description: 'Nigeria has no mandatory ochratoxin testing. EU enforces strict limits. Nigerian cocoa stored in humid conditions commonly breaches EU thresholds.',
    gap_severity: 'HIGH',
    practical_impact: 'Cocoa stored in inadequate warehouses develops ochratoxin. Without testing, exporters ship blind.',
    historical_rejection_contribution: 31,
    gap_closure_action: 'Mandatory ochratoxin lab test for all cocoa shipments. Proper warehouse management: moisture below 7.5%.',
    gap_closure_difficulty: 'MODERATE',
    eu_regulation_reference: 'EU Reg 2023/915'
  },
  {
    commodity: 'Ginger',
    dimension: 'PESTICIDE_MRL',
    nigerian_standard: 'Profenofos widely used on ginger in Kaduna and Nasarawa',
    eu_standard: 'EU MRL for Profenofos on ginger: 0.01 mg/kg (default)',
    gap_description: 'Profenofos is the most common pesticide on ginger. EU MRL is effectively zero. Primary cause of Nigerian ginger rejections.',
    gap_severity: 'CRITICAL',
    historical_rejection_contribution: 44,
    gap_closure_action: 'Eliminate Profenofos from ginger production. Replace with approved alternatives. Minimum 45-day PHI.',
    gap_closure_difficulty: 'HARD',
    eu_regulation_reference: 'EU Reg 2023/915'
  },
  {
    commodity: 'All Commodities',
    dimension: 'LABORATORY_STANDARD',
    nigerian_standard: 'NAFDAC-registered labs accepted for Nigerian compliance',
    eu_standard: 'EU requires ISO 17025-accredited labs for admissible test results',
    gap_description: 'Most Nigerian exporters use local NAFDAC-registered but not ISO 17025 labs. Results inadmissible at EU customs.',
    gap_severity: 'HIGH',
    practical_impact: 'Exporter pays for test, ships confidently, EU rejects certificate as inadmissible. Shipment held for re-testing.',
    historical_rejection_contribution: 22,
    gap_closure_action: 'Use only Culbridge-approved labs (all ISO 17025 certified).',
    gap_closure_difficulty: 'EASY',
    eu_regulation_reference: 'ISO/IEC 17025:2017'
  }
];

async function getActiveRegulatoryChanges() {
  return await all(`
    SELECT * FROM regulatory_changes 
    WHERE is_confirmed = 1 AND is_actioned = 0
    ORDER BY detected_at DESC
  `);
}

async function getChangesByCommodity(commodity) {
  return await all(`
    SELECT * FROM regulatory_changes 
    WHERE is_confirmed = 1 AND affects_commodities LIKE ?
    ORDER BY detected_at DESC
  `, [`%${commodity}%`]);
}

async function getGapIndex(commodity = null) {
  if (commodity) {
    return await all(`
      SELECT * FROM regulatory_gap_index 
      WHERE is_active = 1 AND commodity LIKE ?
    `, [`%${commodity}%`]);
  }
  return await all(`
    SELECT * FROM regulatory_gap_index 
    WHERE is_active = 1
    ORDER BY gap_severity DESC, commodity
  `);
}

function classifyChangeSeverity(change) {
  if (change.change_type === CHANGE_TYPES.PESTICIDE_BAN && change.days_until_effective < 60) {
    return CHANGE_SEVERITY.CRITICAL;
  }
  
  if (change.change_type === CHANGE_TYPES.MRL_REDUCTION) {
    const maxReduction = Math.max(...(change.mrl_changes || [{ change_multiplier: 1 }]).map(m => m.change_multiplier || 1));
    if (maxReduction >= 5) return CHANGE_SEVERITY.CRITICAL;
    if (maxReduction >= 2) return CHANGE_SEVERITY.HIGH;
  }
  
  if (change.change_type === CHANGE_TYPES.ENHANCED_MONITORING_ADDED) {
    return CHANGE_SEVERITY.CRITICAL;
  }
  
  if (change.change_type === CHANGE_TYPES.NEW_CERTIFICATION_REQUIRED) {
    return CHANGE_SEVERITY.HIGH;
  }
  
  if (change.change_type === CHANGE_TYPES.MRL_REMOVED) {
    return CHANGE_SEVERITY.HIGH;
  }
  
  return CHANGE_SEVERITY.MEDIUM;
}

async function mapExporterImpacts(changeId) {
  const change = await get('SELECT * FROM regulatory_changes WHERE change_id = ?', [changeId]);
  if (!change) return null;
  
  const affectsCommodities = JSON.parse(change.affects_commodities || '[]');
  
  const exporters = await all(`
    SELECT DISTINCT exporter_id FROM shipments 
    WHERE commodity IN (${affectsCommodities.map(() => '?').join(',')})
    AND status NOT IN ('CLEARED', 'REJECTED')
  `, affectsCommodities);
  
  return {
    change_id: changeId,
    total_affected: exporters.length,
    exporters: exporters.map(e => e.exporter_id)
  };
}

async function generateRegulatoryAlert(change, exporterId) {
  const alert_id = `REG-ALERT-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
  
  let headline = '';
  let what_changed = '';
  let what_you_must_do = [];
  let consequence = '';
  
  if (change.change_type === CHANGE_TYPES.MRL_REDUCTION) {
    const mrl = change.mrl_changes?.[0] || {};
    headline = `EU has tightened the pesticide limit for ${mrl.commodity} — action required`;
    what_changed = `The EU reduced the maximum allowed ${mrl.active_ingredient} in ${mrl.commodity} from ${mrl.previous_mrl_mg_kg} to ${mrl.new_mrl_mg_kg} mg/kg (${mrl.change_multiplier}x more restrictive).`;
    what_you_must_do = [
      `Stop using ${mrl.active_ingredient} on ${mrl.commodity} farms immediately`,
      `All shipments after ${change.effective_date} must have lab test confirming < ${mrl.new_mrl_mg_kg} mg/kg`,
      `Request lab test immediately if shipment in preparation`
    ];
    consequence = `Shipments arriving after ${change.effective_date} with residue above limit will be rejected.`;
  } else if (change.change_type === CHANGE_TYPES.PESTICIDE_BAN) {
    const chemicals = JSON.parse(change.affects_chemicals || '[]');
    headline = `EU has banned ${chemicals[0]} — stop using immediately`;
    what_changed = `The EU has prohibited ${chemicals[0]} in all food products sold into the EU. Any detectable residue triggers rejection.`;
    what_you_must_do = [
      `Remove ${chemicals[0]} from all farm programmes immediately`,
      `Inform all farms in your supply chain today`,
      `Do not ship any commodity treated with ${chemicals[0]} after ${change.effective_date}`
    ];
    consequence = `Any residue detected at EU border will destroy shipment and create permanent record.`;
  } else if (change.change_type === CHANGE_TYPES.ENHANCED_MONITORING_ADDED) {
    const commodities = JSON.parse(change.affects_commodities || '[]');
    headline = `${commodities[0]} from Nigeria added to EU enhanced monitoring`;
    what_changed = `EU added Nigerian-origin ${commodities[0]} to enhanced monitoring. Shipments face ~${change.estimated_inspection_rate || 50}% physical inspection.`;
    what_you_must_do = [
      `All shipments must include lab test results for specified parameters`,
      `Documentation must be complete and 100% accurate`,
      `Build extra time (3-7 days) for EU border checks`
    ];
    consequence = `Shipments without required docs will be rejected under enhanced monitoring.`;
  }
  
  const alert = {
    alert_id,
    change_id: change.change_id,
    exporter_id: exporterId,
    generated_at: new Date().toISOString(),
    headline,
    what_changed,
    what_you_must_do,
    deadline: change.effective_date,
    consequence_if_ignored: consequence,
    severity: change.severity,
    source_url: change.source_url
  };
  
  await run(`
    INSERT INTO regulatory_alerts (
      alert_id, change_id, exporter_id, headline, what_changed, 
      what_you_must_do, deadline, consequence_if_ignored, severity, generated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    alert.alert_id, alert.change_id, alert.exporter_id, alert.headline, alert.what_changed,
    JSON.stringify(alert.what_you_must_do), alert.deadline, alert.consequence_if_ignored,
    alert.severity, alert.generated_at
  ]);
  
  return alert;
}

async function acknowledgeAlert(alertId, exporterId) {
  await run(`
    UPDATE regulatory_alerts SET acknowledged_at = ?
    WHERE alert_id = ? AND exporter_id = ?
  `, [new Date().toISOString(), alertId, exporterId]);
}

async function getExporterAlerts(exporterId, includeAcknowledged = false) {
  const where = includeAcknowledged ? '' : 'AND acknowledged_at IS NULL';
  return await all(`
    SELECT * FROM regulatory_alerts 
    WHERE exporter_id = ? ${where}
    ORDER BY generated_at DESC
  `, [exporterId]);
}

module.exports = {
  getActiveRegulatoryChanges,
  getChangesByCommodity,
  getGapIndex,
  mapExporterImpacts,
  generateRegulatoryAlert,
  acknowledgeAlert,
  getExporterAlerts,
  classifyChangeSeverity,
  CHANGE_TYPES,
  CHANGE_SEVERITY,
  GAP_DIMENSIONS,
  INITIAL_GAP_INDEX
};
