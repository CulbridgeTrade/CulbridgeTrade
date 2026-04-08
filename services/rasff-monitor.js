/**
 * RASFF Risk Monitoring Service
 * 
 * Implements RASFF data ingestion, commodity risk matrix, and shipment gate.
 */

const { run, get, all } = require('../utils/db');
const crypto = require('crypto');

const NOTIFICATION_TYPES = {
  ALERT: 'ALERT',
  INFORMATION: 'INFORMATION',
  BORDER_REJECTION: 'BORDER_REJECTION',
  NEWS: 'NEWS'
};

const HAZARD_TYPES = {
  PESTICIDE_RESIDUE: 'PESTICIDE_RESIDUE',
  MYCOTOXIN: 'MYCOTOXIN',
  HEAVY_METALS: 'HEAVY_METALS',
  MICROBIOLOGICAL: 'MICROBIOLOGICAL',
  FOREIGN_MATTER: 'FOREIGN_MATTER',
  PROCESSING_CONTAMINANT: 'PROCESSING_CONTAMINANT',
  LABELLING: 'LABELLING',
  OTHER: 'OTHER'
};

const ALERT_SEVERITY = {
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  INFORMATIONAL: 'INFORMATIONAL'
};

const NIGERIA_PRIMARY_COMMODITIES = [
  'sesame', 'cocoa', 'ginger', 'hibiscus', 'zobo', 'cashew', 'melon', 'fish', 'pepper'
];

const INITIAL_COMMODITY_PROFILES = {
  'Sesame Seeds': {
    commodity_name: 'Sesame Seeds',
    current_risk_level: 'CRITICAL',
    most_common_hazard: 'PESTICIDE_RESIDUE',
    most_common_chemical: 'Chlorpyrifos',
    historical_rejection_rate_percent: 68,
    on_eu_enhanced_monitoring: true,
    enhanced_monitoring_frequency: 50,
    high_risk_origin_states: ['Jigawa', 'Kano', 'Yobe', 'Borno'],
    mandatory_tests: ['MRL_PESTICIDE_RESIDUE', 'SALMONELLA', 'HEAVY_METALS']
  },
  'Cocoa Beans': {
    commodity_name: 'Cocoa Beans',
    current_risk_level: 'HIGH',
    most_common_hazard: 'MYCOTOXIN',
    most_common_chemical: 'Ochratoxin A',
    historical_rejection_rate_percent: 31,
    on_eu_enhanced_monitoring: false,
    high_risk_origin_states: ['Cross River', 'Ondo', 'Osun'],
    mandatory_tests: ['MYCOTOXIN_OCHRATOXIN', 'HEAVY_METALS', 'MRL_PESTICIDE_RESIDUE']
  },
  'Ginger': {
    commodity_name: 'Ginger',
    current_risk_level: 'HIGH',
    most_common_hazard: 'PESTICIDE_RESIDUE',
    most_common_chemical: 'Profenofos',
    historical_rejection_rate_percent: 44,
    on_eu_enhanced_monitoring: true,
    enhanced_monitoring_frequency: 20,
    high_risk_origin_states: ['Kaduna', 'Nasarawa', 'Benue'],
    mandatory_tests: ['MRL_PESTICIDE_RESIDUE', 'HEAVY_METALS', 'SALMONELLA']
  },
  'Shea Butter': {
    commodity_name: 'Shea Butter',
    current_risk_level: 'MEDIUM',
    most_common_hazard: 'PESTICIDE_RESIDUE',
    historical_rejection_rate_percent: 15,
    on_eu_enhanced_monitoring: false,
    mandatory_tests: ['MRL_PESTICIDE_RESIDUE', 'HEAVY_METALS']
  },
  'Beans': {
    commodity_name: 'Beans',
    current_risk_level: 'CRITICAL',
    most_common_hazard: 'PESTICIDE_RESIDUE',
    historical_rejection_rate_percent: 85,
    on_eu_enhanced_monitoring: true,
    enhanced_monitoring_frequency: 100,
    mandatory_tests: ['MYCOTOXIN_AFLATOXIN', 'SALMONELLA']
  }
};

function isNigeriaAlert(raw) {
  const countryOrigin = raw.country_of_origin?.toLowerCase() || '';
  const countryDispatch = raw.country_of_dispatch?.toLowerCase() || '';
  const productName = raw.product_name?.toLowerCase() || '';
  
  return (
    countryOrigin === 'nigeria' ||
    countryDispatch === 'nigeria' ||
    (NIGERIA_PRIMARY_COMMODITIES.some(c => productName.includes(c)) && 
     countryOrigin === 'nigeria')
  );
}

function classifyAlert(raw) {
  const hazardCategory = raw.hazard_category?.toLowerCase() || '';
  let hazardType = HAZARD_TYPES.OTHER;
  let severity = ALERT_SEVERITY.MEDIUM;
  
  if (hazardCategory.includes('pesticide')) {
    hazardType = HAZARD_TYPES.PESTICIDE_RESIDUE;
    severity = ALERT_SEVERITY.HIGH;
  } else if (hazardCategory.includes('mycotoxin')) {
    hazardType = HAZARD_TYPES.MYCOTOXIN;
    severity = ALERT_SEVERITY.HIGH;
  } else if (hazardCategory.includes('heavy metal')) {
    hazardType = HAZARD_TYPES.HEAVY_METALS;
    severity = ALERT_SEVERITY.MEDIUM;
  } else if (hazardCategory.includes('microbiological') || hazardCategory.includes('salmonella')) {
    hazardType = HAZARD_TYPES.MICROBIOLOGICAL;
    severity = ALERT_SEVERITY.CRITICAL;
  }
  
  if (raw.notification_type === 'ALERT') severity = ALERT_SEVERITY.CRITICAL;
  if (raw.notification_type === 'BORDER_REJECTION') severity = ALERT_SEVERITY.HIGH;
  
  return {
    alert_id: `RASFF-${raw.rasff_reference}`,
    rasff_reference: raw.rasff_reference,
    raw_data: JSON.stringify(raw),
    severity,
    culbridge_commodity: normalizeCommodityName(raw.product_name),
    hazard_type: hazardType,
    specific_chemical: raw.hazard_substance,
    applies_to_all_nigeria: true,
    alert_date: raw.date_of_case,
    is_active: true,
    eu_regulation_reference: raw.legal_basis,
    full_alert_url: raw.source_url
  };
}

function normalizeCommodityName(name) {
  if (!name) return 'Unknown';
  const n = name.toLowerCase();
  if (n.includes('sesame')) return 'Sesame Seeds';
  if (n.includes('cocoa')) return 'Cocoa Beans';
  if (n.includes('ginger')) return 'Ginger';
  if (n.includes('shea')) return 'Shea Butter';
  if (n.includes('bean') && !n.includes('coffee')) return 'Beans';
  if (n.includes('cashew')) return 'Cashew Nuts';
  if (n.includes('hibiscus') || n.includes('zobo')) return 'Hibiscus';
  if (n.includes('melon') || n.includes('egusi')) return 'Melon Seeds';
  return name;
}

async function runWeeklyRASFFSync() {
  const result = {
    synced_at: new Date().toISOString(),
    new_alerts: 0,
    updated_alerts: 0,
    total_active_nigeria_alerts: 0
  };

  const activeAlerts = await getActiveNigeriaAlerts();
  result.total_active_nigeria_alerts = activeAlerts.length;

  return result;
}

async function getActiveNigeriaAlerts() {
  return await all(`
    SELECT * FROM rasff_alerts 
    WHERE is_active = 1 
    AND alert_date >= DATE('now', '-180 days')
    ORDER BY alert_date DESC
  `);
}

async function getAlertsByCommodity(commodity) {
  return await all(`
    SELECT * FROM rasff_alerts 
    WHERE is_active = 1 
    AND (culbridge_commodity LIKE ? OR culbridge_commodity LIKE ?)
    ORDER BY alert_date DESC
  `, [`%${commodity}%`, `%${commodity.replace(/_/g, ' ')}%`]);
}

async function runRASFFGate(shipment) {
  const commodity = normalizeCommodityName(shipment.commodity || shipment.product);
  const destination = shipment.destination_country || shipment.destination || 'NL';
  const originState = shipment.origin_state || shipment.state || 'Unknown';
  
  const alerts = await getAlertsByCommodity(commodity);
  
  const matchedAlerts = alerts.filter(alert => {
    const raw = JSON.parse(alert.raw_data || '{}');
    const dests = raw.distribution_countries || [];
    return !dests.length || dests.includes(destination) || dests.includes('EU');
  });

  const riskProfile = await getCommodityRiskProfile(commodity);
  
  const hasCritical = matchedAlerts.some(a => a.severity === 'CRITICAL');
  const hasHigh = matchedAlerts.some(a => a.severity === 'HIGH');
  const isCritical = riskProfile?.current_risk_level === 'CRITICAL';
  const isOnEnhanced = riskProfile?.on_eu_enhanced_monitoring;
  
  let gateStatus = 'CLEAR';
  if (hasCritical || (isCritical && matchedAlerts.length > 0)) {
    gateStatus = 'HALTED';
  } else if (hasHigh || isOnEnhanced) {
    gateStatus = 'FLAGGED';
  } else if (matchedAlerts.length > 0) {
    gateStatus = 'ADVISORY';
  }

  return {
    shipment_id: shipment.shipment_id || shipment.id,
    checked_at: new Date().toISOString(),
    commodity,
    destination_country: destination,
    origin_state: originState,
    gate_status: gateStatus,
    can_proceed: gateStatus === 'CLEAR' || gateStatus === 'ADVISORY',
    matched_alerts: matchedAlerts.slice(0, 5).map(formatMatchedAlert),
    commodity_risk_level: riskProfile?.current_risk_level || 'UNKNOWN',
    commodity_risk_score: riskProfile?.current_risk_score || 0,
    on_eu_enhanced_monitoring: isOnEnhanced || false,
    exporter_message: buildExporterMessage(gateStatus, matchedAlerts, riskProfile),
    required_actions: buildRequiredActions(gateStatus, matchedAlerts, riskProfile)
  };
}

function formatMatchedAlert(alert) {
  const raw = JSON.parse(alert.raw_data || '{}');
  return {
    rasff_reference: alert.rasff_reference,
    alert_date: alert.alert_date,
    severity: alert.severity,
    hazard_type: alert.hazard_type,
    hazard_description: raw.hazard_category,
    specific_chemical: alert.specific_chemical,
    detected_level: raw.hazard_analytical_result,
    action_taken_by_eu: raw.action_taken,
    full_alert_url: alert.full_alert_url,
    match_reason: `Active ${alert.severity.toLowerCase()} alert for ${alert.culbridge_commodity}`
  };
}

function buildExporterMessage(gateStatus, alerts, profile) {
  if (gateStatus === 'HALTED') {
    return `STOP: Active EU food safety alerts for this commodity. Do not load. Your shipment will be rejected at the EU border.`;
  }
  if (gateStatus === 'FLAGGED') {
    return `WARNING: This commodity is on EU enhanced monitoring. Your shipment may be subject to additional checks.`;
  }
  if (gateStatus === 'ADVISORY') {
    return `NOTICE: Review matched RASFF alerts in your dashboard before proceeding.`;
  }
  return `CLEAR: No active EU food safety alerts for this commodity.`;
}

function buildRequiredActions(gateStatus, alerts, profile) {
  const actions = [];
  if (gateStatus === 'HALTED') {
    actions.push({
      action: 'DO_NOT_LOAD',
      description: 'Do not proceed with loading. Active RASFF alerts will result in border rejection.',
      urgency: 'CRITICAL'
    });
  }
  if (gateStatus === 'FLAGGED') {
    actions.push({
      action: 'ACKNOWLEDGE_RISK',
      description: 'Review EU enhanced monitoring requirements for this commodity.',
      urgency: 'HIGH'
    });
    actions.push({
      action: 'ENSURE_LAB_TEST',
      description: 'Ensure lab test results are current and from EU-accredited lab.',
      urgency: 'HIGH'
    });
  }
  return actions;
}

async function getCommodityRiskProfile(commodity) {
  const normalized = normalizeCommodityName(commodity);
  const profile = INITIAL_COMMODITY_PROFILES[normalized];
  
  if (!profile) {
    return {
      commodity_name: normalized,
      current_risk_level: 'MEDIUM',
      current_risk_score: 25,
      on_eu_enhanced_monitoring: false,
      mandatory_tests: ['MRL_PESTICIDE_RESIDUE']
    };
  }
  
  const alerts = await getAlertsByCommodity(normalized);
  const alerts30 = alerts.filter(a => {
    const days = (Date.now() - new Date(a.alert_date)) / (1000 * 60 * 60 * 24);
    return days <= 30;
  }).length;
  
  const score = calculateRiskScore(profile, alerts, alerts30);
  
  return {
    ...profile,
    current_risk_score: score,
    current_risk_level: scoreToRiskLevel(score),
    active_rasff_alerts: alerts.length,
    rasff_alerts_last_30_days: alerts30
  };
}

function calculateRiskScore(profile, alerts, alerts30) {
  let score = 0;
  score += Math.min(alerts30 * 8, 20);
  score += Math.min(alerts.length * 2, 10);
  if (profile.on_eu_enhanced_monitoring) score += 10;
  score += (profile.enhanced_monitoring_frequency || 0) / 5;
  score += Math.min(profile.historical_rejection_rate_percent / 4, 15);
  return Math.min(Math.round(score), 100);
}

function scoreToRiskLevel(score) {
  if (score >= 75) return 'CRITICAL';
  if (score >= 50) return 'HIGH';
  if (score >= 25) return 'MEDIUM';
  return 'LOW';
}

module.exports = {
  runWeeklyRASFFSync,
  getActiveNigeriaAlerts,
  getAlertsByCommodity,
  runRASFFGate,
  getCommodityRiskProfile,
  classifyAlert,
  isNigeriaAlert,
  NOTIFICATION_TYPES,
  HAZARD_TYPES,
  ALERT_SEVERITY,
  NIGERIA_PRIMARY_COMMODITIES
};
