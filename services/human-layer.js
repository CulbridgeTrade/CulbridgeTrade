/**
 * Human Layer Service
 * 
 * Purpose: Legal, Financial, Social & Environmental Preconditions
 * Every shipment must pass Human Layer checks before deterministic engine.
 * 
 * Schema:
 * - NEPC Certificate (legal)
 * - Form NXP (financial repatriation)
 * - SPS/Quality Certificates (NAFDAC, SON, NAQS)
 * - EEG / Pioneer Status / Duty Waivers (financial incentives)
 * - LkSG Compliance (social/environmental)
 * - Verified Buyers (EUNAP/GSP Hub)
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(process.env.RENDER_DISK_PATH || '/tmp', 'culbridge', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ==================== IN-MEMORY STORAGE ====================

let exporters = [];

// ==================== SAMPLE DATA ====================

const sampleExporters = [
  {
    exporter_id: 'EXP-NG-001',
    legal: {
      nepc_certificate: { id: 'NEPC-2024-001', expiry: '2026-09-30', valid: true },
      form_nxp: { bank: 'First Bank', amount_usd: 50000, date_issued: '2026-01-15', valid: true },
      sps_certificates: [
        { agency: 'NAFDAC', id: 'SPS-NG-001', expiry: '2026-06-30', valid: true },
        { agency: 'SON', id: 'SON-001', expiry: '2026-12-31', valid: true }
      ]
    },
    financial_incentives: {
      eeg: { approved: true, value_usd: 7500, date_awarded: '2026-01-20' },
      pioneer_status: { approved: true },
      import_duty_waivers: [{ item: 'Processing Equipment', approved: true }]
    },
    social_environmental_compliance: {
      child_labor_policy: true,
      worker_safety_audit: true,
      environmental_audit: 'passed',
      compliance_score: 0.92
    },
    verified_buyers: [
      { buyer_id: 'EU-BUYER-001', requires_lksg_proof: true, priority: 1 },
      { buyer_id: 'EU-BUYER-002', requires_lksg_proof: false, priority: 2 }
    ]
  },
  {
    exporter_id: 'EXP-NG-002',
    legal: {
      nepc_certificate: { id: 'NEPC-2024-002', expiry: '2026-08-31', valid: true },
      form_nxp: { bank: 'Zenith Bank', amount_usd: 30000, date_issued: '2026-02-01', valid: true },
      sps_certificates: [
        { agency: 'NAFDAC', id: 'SPS-NG-002', expiry: '2026-05-31', valid: true }
      ]
    },
    financial_incentives: {
      eeg: { approved: false },
      pioneer_status: { approved: false },
      import_duty_waivers: []
    },
    social_environmental_compliance: {
      child_labor_policy: true,
      worker_safety_audit: true,
      environmental_audit: 'passed',
      compliance_score: 0.88
    },
    verified_buyers: [
      { buyer_id: 'EU-BUYER-003', requires_lksg_proof: true, priority: 1 }
    ]
  },
  {
    exporter_id: 'EXP-BR-001',
    legal: {
      nepc_certificate: null,
      form_nxp: { bank: 'Itau', amount_usd: 100000, date_issued: '2026-01-10', valid: true },
      sps_certificates: [
        { agency: 'MAPA', id: 'SPS-BR-001', expiry: '2026-11-30', valid: true }
      ]
    },
    financial_incentives: {
      eeg: { approved: true, value_usd: 15000, date_awarded: '2026-01-05' },
      pioneer_status: { approved: true },
      import_duty_waivers: []
    },
    social_environmental_compliance: {
      child_labor_policy: false,
      worker_safety_audit: true,
      environmental_audit: 'pending',
      compliance_score: 0.65
    },
    verified_buyers: []
  }
];

// ==================== CORE FUNCTIONS ====================

/**
 * Initialize service
 */
function initialize() {
  console.log('Human Layer Service initializing...');
  loadExporters();
  console.log(`Human Layer: ${exporters.length} exporters loaded`);
  return true;
}

/**
 * Load exporters
 */
function loadExporters() {
  const dataPath = path.join(DATA_DIR, 'human_layer.json');
  try {
    if (fs.existsSync(dataPath)) {
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      exporters = data.exporters || [];
    } else {
      exporters = sampleExporters;
      saveExporters();
    }
  } catch (error) {
    exporters = sampleExporters;
    saveExporters();
  }
}

/**
 * Save exporters
 */
function saveExporters() {
  const dataPath = path.join(DATA_DIR, 'human_layer.json');
  fs.writeFileSync(dataPath, JSON.stringify({ exporters }, null, 2));
}

/**
 * Validate Human Layer for exporter
 */
function validateExporter(exporterId) {
  const exporter = exporters.find(e => e.exporter_id === exporterId);
  
  if (!exporter) {
    return {
      valid: false,
      reason: 'Exporter not found',
      legal_valid: false,
      financial_valid: false,
      social_env_valid: false
    };
  }
  
  // Legal validation
  const legal = exporter.legal || {};
  const legalValid = 
    (legal.nepc_certificate && legal.nepc_certificate.valid) &&
    (legal.form_nxp && legal.form_nxp.valid) &&
    (legal.sps_certificates && legal.sps_certificates.some(c => c.valid));
  
  // Financial validation (EEG/Pioneer)
  const financial = exporter.financial_incentives || {};
  const financialValid = true; // Optional but beneficial
  
  // Social/Environmental validation
  const socialEnv = exporter.social_environmental_compliance || {};
  const socialEnvValid = 
    socialEnv.child_labor_policy === true &&
    socialEnv.worker_safety_audit === true &&
    (socialEnv.compliance_score || 0) >= 0.7;
  
  return {
    valid: legalValid && socialEnvValid,
    exporter_id: exporterId,
    legal_valid: legalValid,
    legal_details: legal,
    financial_valid: financialValid,
    financial_incentives: financial,
    social_env_valid: socialEnvValid,
    social_env_details: socialEnv,
    verified_buyers: exporter.verified_buyers || [],
    incentive_value: (financial.eeg?.value_usd || 0)
  };
}

/**
 * Apply Human Layer to shipment decision
 */
function applyToDecision(exporterId, baseDecision) {
  const validation = validateExporter(exporterId);
  
  if (!validation.valid) {
    return {
      ...baseDecision,
      approval_status: 'BLOCKED',
      block_reason: !validation.legal_valid ? 'Missing legal prerequisites' : 'Social/environmental compliance failed',
      human_layer_valid: false
    };
  }
  
  // Apply financial incentives to expected loss
  const incentiveValue = validation.incentive_value || 0;
  const adjustedLoss = Math.max(0, (baseDecision.expected_loss_usd || 0) - incentiveValue);
  
  // Apply social/environmental compliance to risk score
  const complianceScore = validation.social_env_details?.compliance_score || 1;
  const adjustedRisk = (baseDecision.risk_score || 0) * (1 - (1 - complianceScore) * 0.2); // Up to 20% reduction
  
  return {
    ...baseDecision,
    human_layer_valid: true,
    expected_loss_usd: adjustedLoss,
    risk_score: adjustedRisk,
    eeg_applied: incentiveValue > 0,
    lksg_compliance: validation.social_env_valid,
    compliance_score: complianceScore,
    verified_buyers: validation.verified_buyers
  };
}

/**
 * Get exporter data
 */
function getExporter(exporterId) {
  return exporters.find(e => e.exporter_id === exporterId) || null;
}

/**
 * Get all exporters
 */
function getAllExporters() {
  return exporters.map(e => ({
    exporter_id: e.exporter_id,
    legal_valid: !!(e.legal?.nepc_certificate?.valid && e.legal?.form_nxp?.valid),
    financial_incentives: !!e.financial_incentives?.eeg?.approved,
    compliance_score: e.social_environmental_compliance?.compliance_score || 0
  }));
}

/**
 * Add/update exporter
 */
function upsertExporter(exporterData) {
  const index = exporters.findIndex(e => e.exporter_id === exporterData.exporter_id);
  if (index >= 0) {
    exporters[index] = { ...exporters[index], ...exporterData };
  } else {
    exporters.push(exporterData);
  }
  saveExporters();
  return exporters.find(e => e.exporter_id === exporterData.exporter_id);
}

/**
 * Get configuration
 */
function getConfig() {
  return {
    exporters_count: exporters.length,
    validators: ['NEPC', 'Form NXP', 'SPS Certificates', 'EEG', 'LkSG']
  };
}

// ==================== EXPORTS ====================

module.exports = {
  initialize,
  validateExporter,
  applyToDecision,
  getExporter,
  getAllExporters,
  upsertExporter,
  getConfig
};
