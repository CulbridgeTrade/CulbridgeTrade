/**
 * Shipment Risk Scoring & Financial Exposure Service
 * 
 * Implements risk scoring engine, financial exposure calculator,
 * corrective action engine, and exporter compliance scoring.
 */

const { run, get, all } = require('../utils/db');
const crypto = require('crypto');

const RISK_LEVELS = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
};

const WEIGHTS = {
  mrl_risk: 0.30,
  rasff_alert: 0.25,
  lab_test: 0.20,
  documentation: 0.15,
  traceability: 0.10
};

const DEMURRAGE_RATES = {
  'Rotterdam': { '20GP': 95, '40GP': 130, '40HC': 140 },
  'Hamburg': { '20GP': 85, '40GP': 120, '40HC': 130 },
  'Antwerp': { '20GP': 90, '40GP': 125, '40HC': 135 },
  'Felixstowe': { '20GP': 100, '40GP': 140, '40HC': 150 }
};

const RISK_COMPONENTS = {
  MRL_RISK: 'mrl_risk',
  RASFF_ALERT: 'rasff_alert',
  LAB_TEST: 'lab_test',
  DOCUMENTATION: 'documentation',
  TRACEABILITY: 'traceability'
};

function scoreMRLRisk(mrlAssessment) {
  const levelScores = { LOW: 10, MEDIUM: 40, HIGH: 75, CRITICAL: 100 };
  return levelScores[mmlAssessment?.shipment_risk_level] || 25;
}

function scoreRASFFAlert(rasffGate) {
  if (rasffGate?.gate_status === 'HALTED') return 100;
  if (rasffGate?.gate_status === 'FLAGGED') return 75;
  if (rasffGate?.gate_status === 'ADVISORY') return 40;
  
  const commodityBaseline = { CRITICAL: 30, HIGH: 20, MEDIUM: 10, LOW: 0 };
  return commodityBaseline[rasffGate?.commodity_risk_level] || 0;
}

function scoreLabTest(labStatus) {
  if (!labStatus || labStatus.status === 'NOT_REQUESTED') return 90;
  if (labStatus.status === 'REQUESTED') return 70;
  if (labStatus.status === 'IN_PROGRESS') return 50;
  if (labStatus.status === 'RESULT_FAILED') return 100;
  if (labStatus.status === 'RESULT_CLEARED') return 0;
  return 80;
}

function scoreDocumentation(docValidation) {
  if (!docValidation?.can_submit) {
    const missing = docValidation?.validation_results?.flatMap(r => r.missing_mandatory_fields || []) || [];
    return Math.min(40 + (missing.length * 15), 100);
  }
  return Math.max(0, 100 - (docValidation.completion_percent || 100));
}

function scoreTraceability(chain) {
  const totalStages = 8;
  const confirmed = chain?.stages?.filter(s => s.is_locked).length || 0;
  return Math.round((1 - (confirmed / totalStages)) * 100);
}

function scoreToRiskLevel(score) {
  if (score >= 75) return RISK_LEVELS.CRITICAL;
  if (score >= 50) return RISK_LEVELS.HIGH;
  if (score >= 25) return RISK_LEVELS.MEDIUM;
  return RISK_LEVELS.LOW;
}

async function calculateShipmentRiskScore(shipmentId, additionalData = {}) {
  const { mrlAssessment, rasffGate, labStatus, docValidation, traceability } = additionalData;
  
  const components = {
    mrl_risk_score: scoreMRLRisk(mrlAssessment),
    rasff_alert_score: scoreRASFFAlert(rasffGate),
    lab_test_score: scoreLabTest(labStatus),
    documentation_score: scoreDocumentation(docValidation),
    traceability_score: scoreTraceability(traceability)
  };

  const weighted = Math.round(
    (components.mrl_risk_score * WEIGHTS.mrl_risk) +
    (components.rasff_alert_score * WEIGHTS.rasff_alert) +
    (components.lab_test_score * WEIGHTS.lab_test) +
    (components.documentation_score * WEIGHTS.documentation) +
    (components.traceability_score * WEIGHTS.traceability)
  );

  const riskLevel = scoreToRiskLevel(weighted);

  const isBlocked = 
    riskLevel === 'HIGH' || 
    riskLevel === 'CRITICAL' ||
    rasffGate?.gate_status === 'HALTED' ||
    labStatus?.status === 'RESULT_FAILED';

  const blockingReasons = buildBlockingReasons(components, rasffGate, labStatus);

  const result = {
    shipment_id: shipmentId,
    calculated_at: new Date().toISOString(),
    component_scores: components,
    weighted_score: weighted,
    risk_level: riskLevel,
    is_blocked: isBlocked,
    blocking_reasons: blockingReasons,
    can_be_unblocked_by_exporter: canExporterUnblock(riskLevel, rasffGate),
    requires_culbridge_review: riskLevel === 'CRITICAL',
    score_version: '1.0'
  };

  await saveRiskScore(shipmentId, result);

  return result;
}

function buildBlockingReasons(components, rasffGate, labStatus) {
  const reasons = [];
  if (components.mrl_risk_score >= 75) reasons.push('MRL risk CRITICAL - pesticide residue concerns');
  if (components.rasff_alert_score >= 75) reasons.push('Active RASFF alert for commodity');
  if (components.lab_test_score >= 75) reasons.push('Lab test failed or not submitted');
  if (components.documentation_score >= 50) reasons.push('Incomplete documentation');
  if (components.traceability_score >= 50) reasons.push('Incomplete traceability chain');
  if (rasffGate?.gate_status === 'HALTED') reasons.push('Shipment halted due to RASFF alert');
  if (labStatus?.status === 'RESULT_FAILED') reasons.push('Lab test result failed EU requirements');
  return reasons;
}

function canExporterUnblock(riskLevel, rasffGate) {
  if (rasffGate?.gate_status === 'HALTED') return false;
  if (riskLevel === 'CRITICAL') return false;
  return true;
}

async function saveRiskScore(shipmentId, score) {
  await run(`
    INSERT OR REPLACE INTO shipment_risk_scores (
      shipment_id, component_scores, weighted_score, risk_level,
      is_blocked, blocking_reasons, can_be_unblocked_by_exporter,
      requires_culbridge_review, score_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    shipmentId,
    JSON.stringify(score.component_scores),
    score.weighted_score,
    score.risk_level,
    score.is_blocked ? 1 : 0,
    JSON.stringify(score.blocking_reasons),
    score.can_be_unblocked_by_exporter ? 1 : 0,
    score.requires_culbridge_review ? 1 : 0,
    score.score_version
  ]);
}

async function getShipmentRiskScore(shipmentId) {
  return await get('SELECT * FROM shipment_risk_scores WHERE shipment_id = ?', [shipmentId]);
}

async function calculateFinancialExposure(shipmentId, shipment = null) {
  const s = shipment || await get('SELECT * FROM shipments WHERE id = ?', [shipmentId]);
  if (!s) throw new Error('Shipment not found');

  const riskScore = await getShipmentRiskScore(shipmentId);
  const demurrageRate = DEMURRAGE_RATES[s.destination_port]?.[s.container_type] || 100;
  const estimatedHoldingDays = estimateHoldingDays(riskScore?.risk_level, s.destination_country);
  
  const commodityValue = s.commodity_value_usd || s.value_usd || 0;
  const freightCost = s.freight_cost_usd || 0;
  const insurance = s.insurance_premium_usd || 0;
  const portHandling = s.port_handling_usd || 0;
  const inspectionFee = s.inspection_fee_usd || 0;

  const totalCommitted = commodityValue + freightCost + insurance + portHandling + inspectionFee;
  const demurrageExposure = demurrageRate * estimatedHoldingDays;
  const totalRejectionLoss = totalCommitted + demurrageExposure;

  const costToFixNow = await estimateRemediationCost(shipmentId, riskScore);
  const fixNowSaves = totalRejectionLoss - costToFixNow;

  const recommendation = deriveRecommendation(costToFixNow, totalRejectionLoss, riskScore);

  const exposure = {
    shipment_id: shipmentId,
    calculated_at: new Date().toISOString(),
    currency: 'USD',
    commodity_value_usd: commodityValue,
    freight_cost_usd: freightCost,
    insurance_premium_usd: insurance,
    port_handling_usd: portHandling,
    inspection_fee_usd: inspectionFee,
    total_committed_usd: totalCommitted,
    rejection_scenario: {
      demurrage_rate_per_day_usd: demurrageRate,
      estimated_holding_days: estimatedHoldingDays,
      demurrage_exposure_usd: demurrageExposure,
      total_rejection_loss_usd: totalRejectionLoss
    },
    remediation_vs_loss: {
      cost_to_fix_now_usd: costToFixNow,
      cost_of_rejection_usd: totalRejectionLoss,
      fix_now_saves_usd: fixNowSaves,
      recommendation
    },
    buyer_relationship_impact: buildBuyerImpactStatement(riskScore)
  };

  await run(`
    INSERT INTO financial_exposure_records (
      shipment_id, commodity_value_usd, freight_cost_usd, insurance_premium_usd,
      port_handling_usd, inspection_fee_usd, total_committed_usd, rejection_scenario,
      remediation_vs_loss
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    shipmentId, commodityValue, freightCost, insurance, portHandling, inspectionFee,
    totalCommitted, JSON.stringify(exposure.rejection_scenario),
    JSON.stringify(exposure.remediation_vs_loss)
  ]);

  return exposure;
}

function estimateHoldingDays(riskLevel, destination) {
  const baseDays = { CRITICAL: 14, HIGH: 10, MEDIUM: 5, LOW: 2 };
  const base = baseDays[riskLevel] || 5;
  if (destination === 'NL') return base;
  if (destination === 'DE') return base + 2;
  return base;
}

async function estimateRemediationCost(shipmentId, riskScore) {
  let cost = 0;
  if (riskScore?.component_scores?.lab_test_score >= 70) cost += 180;
  if (riskScore?.component_scores?.documentation_score >= 40) cost += 50;
  if (riskScore?.component_scores?.mrl_risk_score >= 75) cost += 150;
  return cost || 25;
}

function deriveRecommendation(costToFix, rejectionLoss, riskScore) {
  if (costToFix >= rejectionLoss * 0.5) return 'ABORT_SHIPMENT';
  if (costToFix < rejectionLoss * 0.1) return 'FIX_NOW';
  return 'PROCEED_AT_RISK';
}

function buildBuyerImpactStatement(riskScore) {
  if (riskScore?.risk_level === 'CRITICAL') {
    return 'HIGH RISK of EU rejection. Buyer relationship will likely be damaged if shipment is rejected.';
  }
  if (riskScore?.risk_level === 'HIGH') {
    return 'Moderate risk. Ensure buyer is aware of potential delays for enhanced checks.';
  }
  return 'Standard risk. Normal EU import procedures apply.';
}

async function generateCorrectiveActionPlan(shipmentId, riskScore) {
  const actions = [];
  let sequence = 1;

  if (riskScore?.component_scores?.mrl_risk_score >= 75) {
    actions.push({
      sequence: sequence++,
      priority: 'CRITICAL',
      category: 'SUBMIT_LAB_TEST',
      title: 'Submit immediate lab test for pesticide residues',
      description: 'MRL scan flagged high-risk chemicals. Lab test required.',
      specific_steps: ['Request express MRL test', 'Ensure samples collected within 24h', 'Do not load until cleared'],
      contact_type: 'LAB',
      estimated_cost_usd: 180,
      estimated_days_to_complete: 4,
      fixes_risk_component: 'mrl_risk',
      score_reduction_if_completed: 35,
      status: 'PENDING'
    });
  }

  if (riskScore?.component_scores?.rasff_alert_score >= 75) {
    actions.push({
      sequence: sequence++,
      priority: 'CRITICAL',
      category: 'AWAIT_ALERT_RESOLUTION',
      title: 'Active EU-RASFF alert — do not load',
      description: 'Active alert for this commodity. Proceeding risks rejection.',
      specific_steps: ['Review RASFF alerts in dashboard', 'Contact EU buyer', 'Monitor for alert changes'],
      contact_type: 'CULBRIDGE',
      estimated_cost_usd: 0,
      estimated_days_to_complete: 7,
      fixes_risk_component: 'rasff_alert',
      score_reduction_if_completed: 50,
      status: 'PENDING'
    });
  }

  if (riskScore?.component_scores?.documentation_score >= 40) {
    actions.push({
      sequence: sequence++,
      priority: 'HIGH',
      category: 'COMPLETE_DOCUMENTATION',
      title: 'Complete missing documentation',
      description: 'Some mandatory fields are incomplete.',
      specific_steps: ['Review missing fields in dashboard', 'Upload required documents'],
      contact_type: 'CULBRIDGE',
      estimated_cost_usd: 0,
      estimated_days_to_complete: 1,
      fixes_risk_component: 'documentation',
      score_reduction_if_completed: 15,
      status: 'PENDING'
    });
  }

  const totalCost = actions.reduce((sum, a) => sum + a.estimated_cost_usd, 0);
  const totalDays = Math.max(...actions.map(a => a.estimated_days_to_complete), 1);
  const projectedScore = Math.max(0, (riskScore?.weighted_score || 50) - actions.reduce((sum, a) => sum + a.score_reduction_if_completed, 0));

  const plan = {
    plan_id: `PLAN-${Date.now()}`,
    shipment_id: shipmentId,
    created_at: new Date().toISOString(),
    current_risk_score: riskScore?.weighted_score || 50,
    projected_risk_score_after_actions: projectedScore,
    actions,
    total_estimated_cost_usd: totalCost,
    total_estimated_days: totalDays,
    critical_path_action: actions.find(a => a.priority === 'CRITICAL')?.title || actions[0]?.title || 'None'
  };

  await saveCorrectiveActionPlan(plan);

  return plan;
}

async function saveCorrectiveActionPlan(plan) {
  await run(`
    INSERT INTO corrective_action_plans (
      shipment_id, current_risk_score, projected_risk_score_after_actions,
      total_estimated_cost_usd, total_estimated_days, critical_path_action
    ) VALUES (?, ?, ?, ?, ?, ?)
  `, [
    plan.shipment_id, plan.current_risk_score, plan.projected_risk_score_after_actions,
    plan.total_estimated_cost_usd, plan.total_estimated_days, plan.critical_path_action
  ]);

  const planId = await get('SELECT last_insert_rowid() as id');
  for (const action of plan.actions) {
    await run(`
      INSERT INTO corrective_actions (
        plan_id, action_id, sequence, priority, category, title, description,
        specific_steps, contact_type, estimated_cost_usd, estimated_days_to_complete,
        fixes_risk_component, score_reduction_if_completed, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      planId.id, `ACT-${action.sequence}`, action.sequence, action.priority, action.category,
      action.title, action.description, JSON.stringify(action.specific_steps),
      action.contact_type, action.estimated_cost_usd, action.estimated_days_to_complete,
      action.fixes_risk_component, action.score_reduction_if_completed, action.status
    ]);
  }
}

async function calculateExporterComplianceScore(exporterId) {
  const shipments = await all('SELECT * FROM shipments WHERE exporter_id = ?', [exporterId]);
  const total = shipments.length;
  
  if (total === 0) {
    return buildEmptyExporterScore(exporterId);
  }

  const cleared = shipments.filter(s => s.status === 'CLEARED' || s.final_outcome === 'PASS').length;
  const rejected = shipments.filter(s => s.status === 'REJECTED' || s.final_outcome === 'BLOCKED').length;
  const labResults = await all('SELECT * FROM lab_test_results WHERE shipment_id IN (SELECT id FROM shipments WHERE exporter_id = ?)', [exporterId]);
  const labPassed = labResults.filter(l => l.overall_passed).length;

  const components = {
    shipment_success_rate: Math.round((cleared / total) * 100),
    mrl_compliance_rate: labResults.length > 0 ? Math.round((labPassed / labResults.length) * 100) : 50,
    documentation_completion_rate: 75,
    lab_testing_compliance_rate: Math.round((labResults.length / total) * 100),
    traceability_completion_rate: 60,
    rasff_alert_rate: 85
  };

  const overall = Math.round(
    (components.shipment_success_rate * 0.35) +
    (components.mrl_compliance_rate * 0.25) +
    (components.documentation_completion_rate * 0.15) +
    (components.lab_testing_compliance_rate * 0.10) +
    (components.traceability_completion_rate * 0.10) +
    (components.rasff_alert_rate * 0.05)
  );

  const grade = scoreToGrade(overall);

  return {
    exporter_id: exporterId,
    score_id: `SCORE-${Date.now()}`,
    calculated_at: new Date().toISOString(),
    overall_score: overall,
    compliance_grade: grade,
    components,
    stats: {
      total_shipments: total,
      shipments_cleared: cleared,
      shipments_rejected_eu: rejected,
      lab_tests_passed: labPassed,
      lab_tests_failed: labResults.length - labPassed
    },
    trend: calculateExporterTrend(exporterId, shipments),
    shareable_summary: buildCredentialSummary(exporterId, overall, grade, components)
  };
}

function buildEmptyExporterScore(exporterId) {
  return {
    exporter_id: exporterId,
    overall_score: 0,
    compliance_grade: 'F',
    components: {},
    stats: { total_shipments: 0 },
    trend: 'STABLE'
  };
}

function scoreToGrade(score) {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

function calculateExporterTrend(exporterId, shipments) {
  return 'STABLE';
}

function buildCredentialSummary(exporterId, overall, grade, components) {
  return {
    exporter_id: exporterId,
    overall_compliance_grade: grade,
    shipment_success_rate_percent: components?.shipment_success_rate || 0,
    total_shipments_verified: components?.total_shipments || 0,
    culbridge_verified_since: new Date().toISOString(),
    compliance_summary: `Compliance grade ${grade}: ${components?.shipment_success_rate || 0}% shipment success rate`
  };
}

module.exports = {
  calculateShipmentRiskScore,
  getShipmentRiskScore,
  calculateFinancialExposure,
  generateCorrectiveActionPlan,
  calculateExporterComplianceScore,
  RISK_LEVELS,
  WEIGHTS,
  DEMURRAGE_RATES
};
