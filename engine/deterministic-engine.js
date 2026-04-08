/**
 * Deterministic Engine - Pre-ML Enforcement Layer
 * 
 * Purpose: Hard compliance checks BEFORE ML:
 * 1. Access2Markets rules (MRLs, documents)
 * 2. TRACES validation (certificates)
 * 3. NVWA simulation (enforcement logic)
 * 4. Dynamic threshold evaluation (risk-adjusted)
 * 
 * This is the first gate - if this blocks, ML never runs
 * 
 * System Flow:
 * 1. Shipment Input
 * 2. Dynamic threshold adjustment (RISK-AWARE)
 * 3. Access2Markets validation (MRLs, docs)
 * 4. TRACES validation (certificates)
 * 5. NVWA simulation (enforcement)
 * 6. → XGBoost (if passed)
 * 7. → Decision Engine
 */

const access2Markets = require('../services/access2markets');
const tracesParser = require('../services/traces-parser');
const rasffIngestion = require('../services/rasff-ingestion');
const eudrCompliance = require('../services/eudr-compliance');
const nvwaSimulator = require('./nvwa-simulator');
const dynamicThresholds = require('./dynamic-threshold-engine');
const fs = require('fs');
const path = require('path');

// ==================== CORE FUNCTIONS ====================

/**
 * Full deterministic validation
 * Integration: Main entry point before ML
 */
async function validate(shipmentData) {
  console.log('\n=== DETERMINISTIC VALIDATION START ===');
  console.log(`Shipment: ${shipmentData.id || shipmentData.shipment_id}`);
  
  const results = {
    shipmentId: shipmentData.id || shipmentData.shipment_id,
    timestamp: new Date().toISOString(),
    stages: {},
    complianceFlags: {},
    blocked: false,
    blockReasons: [],
    warnings: [],
    finalDecision: 'PENDING',
    auditLogId: null
  };
  
  // Stage 0: EUDR / GeoCledian Compliance (NEW - First check!)
  console.log('\n[0/4] Running EUDR compliance check...');
  try {
    const eudrResult = await eudrCompliance.checkEUDR(shipmentData);
    results.stages.eudr = eudrResult;
    results.complianceFlags.eudr = eudrResult.eudrStatus;
    
    if (!eudrResult.compliant) {
      results.blocked = true;
      results.blockReasons.push({
        stage: 'EUDR',
        type: 'EUDR_NON_COMPLIANT',
        status: eudrResult.eudrStatus,
        riskScore: eudrResult.riskScore,
        reason: eudrResult.denialReason || 'Deforestation risk too high',
        severity: 'HARD'
      });
    }
    
    console.log(`  → ${eudrResult.compliant ? 'COMPLIANT' : 'NON_COMPLIANT'}`);
    console.log(`  Risk Score: ${eudrResult.riskScore}, Level: ${eudrResult.riskLevel}`);
  } catch (error) {
    console.error('  Error:', error.message);
    results.stages.eudr = { error: error.message };
  }
  
  // If blocked by EUDR, stop here
  if (results.blocked) {
    results.finalDecision = 'BLOCKED';
    console.log('\n=== BLOCKED AT EUDR ===\n');
    await logAudit(results, shipmentData);
    return results;
  }
  
  // Stage 0.5: Dynamic Threshold Adjustment (RISK-AWARE)
  console.log('\n[0.5/5] Running dynamic threshold adjustment...');
  try {
    const thresholdResult = dynamicThresholds.adjustThresholdsForShipment(shipmentData);
    results.stages.dynamicThresholds = thresholdResult;
    results.complianceFlags.thresholdVersion = thresholdResult.version;
    results.complianceFlags.riskScore = thresholdResult.riskProfile.computedRiskScore;
    
    // Evaluate lab results against adjusted thresholds
    if (shipmentData.labResults) {
      const labViolations = [];
      for (const [hazard, value] of Object.entries(shipmentData.labResults)) {
        if (thresholdResult.adjustedThresholds[hazard]) {
          const evaluation = dynamicThresholds.evaluateLabResult(
            { value },
            thresholdResult.adjustedThresholds[hazard],
            hazard
          );
          
          // Log to threshold audit
          dynamicThresholds.logThresholdAudit(
            results.shipmentId,
            `THRESHOLD_${hazard}`,
            evaluation
          );
          
          if (!evaluation.passed) {
            labViolations.push({
              hazard,
              ...evaluation
            });
          }
        }
      }
      
      if (labViolations.length > 0) {
        results.blocked = true;
        results.blockReasons.push(...labViolations.map(v => ({
          stage: 'DYNAMIC_THRESHOLD',
          type: 'LAB_VIOLATION',
          hazard: v.hazard,
          message: v.message,
          details: v.details,
          severity: 'HARD'
        })));
      }
    }
    
    console.log(`  → Risk-adjusted thresholds computed`);
    console.log(`  Risk Score: ${thresholdResult.riskProfile.computedRiskScore}`);
    console.log(`  Thresholds adjusted: ${Object.keys(thresholdResult.adjustedThresholds).length}`);
  } catch (error) {
    console.error('  Error:', error.message);
    results.stages.dynamicThresholds = { error: error.message };
  }

  // If blocked by dynamic thresholds, stop here
  if (results.blocked) {
    results.finalDecision = 'BLOCKED';
    console.log('\n=== BLOCKED AT DYNAMIC THRESHOLDS ===\n');
    await logAudit(results, shipmentData);
    return results;
  }

  // Stage 1: Access2Markets (MRLs, documents, special conditions)
  console.log('\n[1/5] Running Access2Markets validation...');
  try {
    const a2mResult = access2Markets.validate(shipmentData);
    results.stages.access2Markets = a2mResult;
    
    if (!a2mResult.passed) {
      results.blocked = true;
      results.blockReasons.push(...a2mResult.violations.map(v => ({
        stage: 'Access2Markets',
        ...v
      })));
    }
    results.warnings.push(...a2mResult.warnings.map(w => ({
      stage: 'Access2Markets',
      ...w
    })));
    
    console.log(`  → ${a2mResult.passed ? 'PASSED' : 'FAILED'}`);
    if (a2mResult.violations.length > 0) {
      console.log(`  Violations: ${a2mResult.violations.length}`);
    }
  } catch (error) {
    console.error('  Error:', error.message);
    results.stages.access2Markets = { error: error.message };
  }
  
  // If blocked, stop here
  if (results.blocked) {
    results.finalDecision = 'BLOCKED';
    console.log('\n=== BLOCKED AT ACCESS2MARKETS ===\n');
    return results;
  }
  
  // Stage 2: TRACES (certificate validation)
  console.log('\n[2/3] Running TRACES validation...');
  try {
    const tracesResult = tracesParser.validate(shipmentData);
    results.stages.traces = tracesResult;
    
    if (!tracesResult.valid) {
      results.blocked = true;
      results.blockReasons.push(...tracesResult.violations.map(v => ({
        stage: 'TRACES',
        ...v
      })));
    }
    results.warnings.push(...tracesResult.warnings.map(w => ({
      stage: 'TRACES',
      ...w
    })));
    
    console.log(`  → ${tracesResult.valid ? 'PASSED' : 'FAILED'}`);
    console.log(`  Traceability Score: ${tracesResult.traceabilityScore}%`);
  } catch (error) {
    console.error('  Error:', error.message);
    results.stages.traces = { error: error.message };
  }
  
  // If blocked, stop here
  if (results.blocked) {
    results.finalDecision = 'BLOCKED';
    console.log('\n=== BLOCKED AT TRACES ===\n');
    return results;
  }
  
  // Stage 3: NVWA Simulator (enforcement logic)
  console.log('\n[3/3] Running NVWA simulation...');
  try {
    const nvwaResult = nvwaSimulator.evaluate(shipmentData);
    results.stages.nvwa = nvwaResult;
    
    if (nvwaResult.blocked) {
      results.blocked = true;
      results.blockReasons.push(...nvwaResult.blocks.map(b => ({
        stage: 'NVWA',
        ...b
      })));
    }
    results.warnings.push(...nvwaResult.warnings.map(w => ({
      stage: 'NVWA',
      ...w
    })));
    
    console.log(`  → Decision: ${nvwaResult.finalDecision}`);
    console.log(`  Rules Triggered: ${nvwaResult.rulesTriggered.length}`);
    if (nvwaResult.blocks.length > 0) {
      console.log(`  BLOCKS: ${nvwaResult.blocks.map(b => b.ruleId).join(', ')}`);
    }
  } catch (error) {
    console.error('  Error:', error.message);
    results.stages.nvwa = { error: error.message };
  }
  
  // Determine final decision
  if (results.blocked) {
    results.finalDecision = 'BLOCKED';
    console.log('\n=== BLOCKED AT NVWA ===\n');
  } else if (results.stages.nvwa?.inspectionRequired) {
    results.finalDecision = 'REQUIRE_INSPECTION';
    console.log('\n=== REQUIRES INSPECTION ===\n');
  } else if (results.warnings.length > 0) {
    results.finalDecision = 'CONDITIONAL_CLEAR';
    console.log('\n=== CONDITIONAL CLEAR ===\n');
  } else {
    results.finalDecision = 'CLEAR';
    console.log('\n=== CLEAR FOR ML ===\n');
  }
  
  // Get RASFF features for ML (regardless of deterministic outcome)
  const rasffFeatures = rasffIngestion.getDerivedFeatures(shipmentData);
  results.stages.rasff = rasffFeatures;
  
  console.log('=== DETERMINISTIC VALIDATION END ===\n');
  
  return results;
}

/**
 * Quick validation (just NVWA rules)
 */
function quickValidate(shipmentData) {
  return nvwaSimulator.evaluate(shipmentData);
}

/**
 * Validate documents only
 */
function validateDocuments(shipmentData) {
  const { hsCode, documents } = shipmentData;
  const requiredDocs = access2Markets.getRequiredDocuments(hsCode);
  
  const missing = requiredDocs.filter(doc => !documents?.includes(doc));
  
  return {
    valid: missing.length === 0,
    required: requiredDocs,
    missing,
    provided: documents || []
  };
}

/**
 * Validate MRL compliance
 */
function validateMRLs(shipmentData) {
  const { hsCode, labResults } = shipmentData;
  const violations = [];
  
  if (labResults?.pesticides) {
    for (const [pesticide, value] of Object.entries(labResults.pesticides)) {
      const mrl = access2Markets.getMRL(hsCode, pesticide);
      if (mrl && value > mrl.mrlLimit) {
        violations.push({
          pesticide,
          found: value,
          limit: mrl.mrlLimit,
          unit: mrl.unit
        });
      }
    }
  }
  
  return {
    compliant: violations.length === 0,
    violations
  };
}

/**
 * Validate certificate
 */
function validateCertificate(certificateId) {
  return tracesParser.validate(certificateId);
}

/**
 * Get enforcement intensity from RASFF
 */
function getEnforcementIntensity(shipmentData) {
  return rasffIngestion.getDerivedFeatures(shipmentData);
}

/**
 * Get configuration
 */
function getConfig() {
  return {
    access2Markets: access2Markets.getConfig(),
    traces: tracesParser.getConfig(),
    nvwa: nvwaSimulator.getConfig(),
    eudr: eudrCompliance.getConfig(),
    dynamicThresholds: dynamicThresholds.getThresholdVersion()
  };
}

// ==================== AUDIT LOGGING ====================

const auditLogPath = path.join(__dirname, '..', 'data', 'audit_logs.json');

/**
 * Log deterministic decision to audit table
 */
async function logAudit(validationResults, shipmentData) {
  const auditEntry = {
    audit_id: `AUDIT-${Date.now()}`,
    shipment_id: validationResults.shipmentId,
    timestamp: validationResults.timestamp,
    
    // EUDR
    eudr_status: validationResults.stages.eudr?.eudrStatus || 'NOT_CHECKED',
    eudr_risk_score: validationResults.stages.eudr?.riskScore || 0,
    eudr_certificate: validationResults.stages.eudr?.certificate || null,
    
    // Access2Markets
    a2m_compliant: validationResults.stages.access2Markets?.passed || false,
    a2m_violations: validationResults.stages.access2Markets?.violations || [],
    
    // TRACES
    traces_status: validationResults.stages.traces?.valid ? 'VALID' : 'INVALID',
    traces_cert_id: validationResults.stages.traces?.certificate?.certificate_id || null,
    
    // NVWA
    nvwa_decision: validationResults.stages.nvwa?.finalDecision || 'UNKNOWN',
    nvwa_blocks: validationResults.stages.nvwa?.blocks || [],
    
    // Decision
    decision: validationResults.finalDecision,
    blocked: validationResults.blocked,
    block_reasons: validationResults.blockReasons,
    warnings: validationResults.warnings.length,
    
    // RASFF features
    rasff_rejection_rate: validationResults.stages.rasff?.productRejectionRate || 0,
    
    // Dynamic thresholds
    threshold_version: validationResults.stages.dynamicThresholds?.version || null,
    risk_score: validationResults.complianceFlags.riskScore || 0,
    
    // Metadata
    compliance_flags: validationResults.complianceFlags
  };
  
  // Save to file
  try {
    let logs = [];
    if (fs.existsSync(auditLogPath)) {
      logs = JSON.parse(fs.readFileSync(auditLogPath, 'utf8'));
    }
    logs.unshift(auditEntry);
    logs = logs.slice(0, 1000); // Keep last 1000
    fs.writeFileSync(auditLogPath, JSON.stringify(logs, null, 2));
    
    console.log(`  → Audit logged: ${auditEntry.audit_id}`);
  } catch (error) {
    console.error('  → Failed to log audit:', error.message);
  }
  
  validationResults.auditLogId = auditEntry.audit_id;
  
  return auditEntry.audit_id;
}

/**
 * Get audit log for shipment
 */
function getAuditLog(shipmentId) {
  try {
    if (!fs.existsSync(auditLogPath)) return null;
    const logs = JSON.parse(fs.readFileSync(auditLogPath, 'utf8'));
    return logs.filter(l => l.shipment_id === shipmentId);
  } catch (error) {
    return null;
  }
}

/**
 * Get all audit logs
 */
function getAllAuditLogs(limit = 100) {
  try {
    if (!fs.existsSync(auditLogPath)) return [];
    const logs = JSON.parse(fs.readFileSync(auditLogPath, 'utf8'));
    return logs.slice(0, limit);
  } catch (error) {
    return [];
  }
}

module.exports = {
  validate,
  quickValidate,
  validateDocuments,
  validateMRLs,
  validateCertificate,
  getEnforcementIntensity,
  getConfig,
  logAudit,
  getAuditLog,
  getAllAuditLogs
};
