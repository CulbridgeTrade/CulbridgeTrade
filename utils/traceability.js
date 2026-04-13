/**
 * INAtrace - Supply Chain Traceability Module for EUDR Compliance
 * 
 * This module provides traceability features for the Culbridge rule engine,
 * helping exporters comply with EU Deforestation Regulation (EUDR) requirements.
 * 
 * Features:
 * - Field mapping for EUDR compliance
 * - Shipment traceability tracking
 * - Production origin verification
 * - Deforestation-free certification tracking
 * - Audit trail for compliance
 */

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

// In-memory traceability store (in production, this would be a database)
const traceabilityStore = {
  shipments: new Map(),
  origins: new Map(),
  certifications: new Map(),
  fieldMappings: new Map(),
  auditLogs: []
};

/**
 * Generate a unique trace ID
 */
function generateTraceId(prefix = 'TRACE') {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(4).toString('hex');
  return `${prefix}-${timestamp}-${random}`.toUpperCase();
}

/**
 * Create a new traceability record for a shipment
 * @param {Object} shipmentData - Shipment information
 * @returns {Object} Traceability record
 */
async function createTraceabilityRecord(shipmentData) {
  const traceId = generateTraceId();
  const timestamp = new Date().toISOString();
  
  const record = {
    trace_id: traceId,
    shipment_id: shipmentData.id || shipmentData.shipment_id,
    product: shipmentData.product,
    category: shipmentData.category,
    exporter_id: shipmentData.exporter_id,
    destination: shipmentData.destination,
    batch_number: shipmentData.batch_number,
    production_date: shipmentData.production_date,
    created_at: timestamp,
    updated_at: timestamp,
    status: 'pending',
    eudr_compliance: {
      deforestation_free: null,
      geolocation_verified: false,
      certification_status: 'not_verified',
      risk_assessment: null
    },
    field_mappings: [],
    audit_trail: [{
      action: 'traceability_record_created',
      timestamp: timestamp,
      details: 'Initial traceability record created'
    }]
  };
  
  traceabilityStore.shipments.set(traceId, record);
  
  addAuditLog('TRACEABILITY_CREATED', {
    trace_id: traceId,
    shipment_id: record.shipment_id
  });
  
  return record;
}

async function addFieldMappings(traceId, fieldMappings) {
  const record = traceabilityStore.shipments.get(traceId);
  if (!record) {
    throw new Error(`Traceability record not found: ${traceId}`);
  }
  
  const timestamp = new Date().toISOString();
  
  const validatedMappings = fieldMappings.map(fm => ({
    field_id: fm.field_id || generateTraceId('FIELD'),
    field_name: fm.field_name,
    location: fm.location || {
      latitude: fm.latitude,
      longitude: fm.longitude,
      address: fm.address,
      country: fm.country,
      region: fm.region
    },
    area_hectares: fm.area_hectares,
    plantation_type: fm.plantation_type || 'unknown',
    deforestation_free_date: fm.deforestation_free_date,
    verification_status: fm.verification_status || 'pending',
    added_at: timestamp
  }));
  
  record.field_mappings = [...record.field_mappings, ...validatedMappings];
  record.updated_at = timestamp;
  
  const allVerified = validatedMappings.every(fm => fm.verification_status === 'verified');
  if (allVerified) {
    record.eudr_compliance.geolocation_verified = true;
  }
  
  record.audit_trail.push({
    action: 'field_mappings_added',
    timestamp: timestamp,
    details: `Added ${validatedMappings.length} field mapping(s)`
  });
  
  traceabilityStore.shipments.set(traceId, record);
  
  addAuditLog('FIELD_MAPPINGS_ADDED', {
    trace_id: traceId,
    field_count: validatedMappings.length
  });
  
  return record;
}

async function addCertification(traceId, certification) {
  const record = traceabilityStore.shipments.get(traceId);
  if (!record) {
    throw new Error(`Traceability record not found: ${traceId}`);
  }
  
  const timestamp = new Date().toISOString();
  const certId = generateTraceId('CERT');
  
  const certRecord = {
    cert_id: certId,
    cert_type: certification.cert_type || 'deforestation_free',
    issuing_authority: certification.issuing_authority,
    certificate_number: certification.certificate_number,
    issue_date: certification.issue_date,
    expiry_date: certification.expiry_date,
    scope: certification.scope,
    verification_url: certification.verification_url,
    status: certification.status || 'valid',
    added_at: timestamp
  };
  
  record.certifications = record.certifications || [];
  record.certifications.push(certRecord);
  record.updated_at = timestamp;
  
  if (certRecord.status === 'valid') {
    record.eudr_compliance.certification_status = 'certified';
    record.eudr_compliance.deforestation_free = true;
  }
  
  record.audit_trail.push({
    action: 'certification_added',
    timestamp: timestamp,
    details: `Added ${certRecord.cert_type} certification`
  });
  
  traceabilityStore.shipments.set(traceId, record);
  
  addAuditLog('CERTIFICATION_ADDED', {
    trace_id: traceId,
    cert_id: certId,
    cert_type: certRecord.cert_type
  });
  
  return record;
}

async function getTraceabilityRecord(id) {
  let record = traceabilityStore.shipments.get(id);
  
  if (!record) {
    for (const [traceId, rec] of traceabilityStore.shipments) {
      if (rec.shipment_id === id) {
        record = rec;
        break;
      }
    }
  }
  
  return record || null;
}

async function performRiskAssessment(traceId) {
  const record = await getTraceabilityRecord(traceId);
  if (!record) {
    throw new Error(`Traceability record not found: ${traceId}`);
  }
  
  const timestamp = new Date().toISOString();
  let riskScore = 0;
  const riskFactors = [];
  
  if (record.field_mappings.length === 0) {
    riskFactors.push('No field mappings provided');
    riskScore += 40;
  } else {
    const unverifiedFields = record.field_mappings.filter(fm => 
      fm.verification_status !== 'verified'
    );
    if (unverifiedFields.length > 0) {
      riskFactors.push(`${unverifiedFields.length} field(s) not verified`);
      riskScore += 20;
    }
  }
  
  if (!record.certifications || record.certifications.length === 0) {
    riskFactors.push('No certifications provided');
    riskScore += 30;
  } else {
    const invalidCerts = record.certifications.filter(c => c.status !== 'valid');
    if (invalidCerts.length > 0) {
      riskFactors.push(`${invalidCerts.length} invalid certification(s)`);
      riskScore += 25;
    }
  }
  
  if (record.eudr_compliance.deforestation_free === null) {
    riskFactors.push('Deforestation-free status not confirmed');
    riskScore += 20;
  } else if (!record.eudr_compliance.deforestation_free) {
    riskFactors.push('Cannot confirm deforestation-free');
    riskScore += 30;
  }
  
  let riskLevel = 'low';
  if (riskScore >= 70) {
    riskLevel = 'high';
  } else if (riskScore >= 40) {
    riskLevel = 'medium';
  }
  
  const assessment = {
    trace_id: traceId,
    shipment_id: record.shipment_id,
    risk_score: riskScore,
    risk_level: riskLevel,
    risk_factors: riskFactors,
    compliance_status: riskScore < 40 ? 'compliant' : 'non_compliant',
    eudr_requirements_met: riskScore < 40,
    assessed_at: timestamp
  };
  
  record.eudr_compliance.risk_assessment = assessment;
  record.updated_at = timestamp;
  record.audit_trail.push({
    action: 'risk_assessment_performed',
    timestamp: timestamp,
    details: `Risk level: ${riskLevel}, Score: ${riskScore}`
  });
  
  traceabilityStore.shipments.set(traceId, record);
  
  addAuditLog('RISK_ASSESSMENT_PERFORMED', {
    trace_id: traceId,
    risk_level: riskLevel,
    risk_score: riskScore
  });
  
  return assessment;
}

function addAuditLog(action, details) {
  const logEntry = {
    id: generateTraceId('LOG'),
    action,
    details,
    timestamp: new Date().toISOString()
  };
  traceabilityStore.auditLogs.push(logEntry);
}

async function getAuditTrail(traceId) {
  const record = await getTraceabilityRecord(traceId);
  if (!record) {
    throw new Error(`Traceability record not found: ${traceId}`);
  }
  return record.audit_trail;
}

async function getAllTraceabilityRecords() {
  return Array.from(traceabilityStore.shipments.values());
}

function getAuditLogs(limit = 100) {
  return traceabilityStore.auditLogs.slice(-limit);
}

/**
 * Generate comprehensive compliance report from traceability data
 * Aggregates shipments, risk assessments, audit logs into HTML report
 * 
 * @returns {Object} Report with HTML, summary data, timestamp
 */
function generateComplianceReport() {
  const records = Array.from(traceabilityStore.shipments.values());
  const auditLogs = traceabilityStore.auditLogs.slice(-50); // Last 50 logs
  
  const totalShipments = records.length;
  const compliant = records.filter(r => r.eudr_compliance?.compliance_status === 'compliant').length;
  const complianceRate = totalShipments > 0 ? ((compliant / totalShipments) * 100).toFixed(1) : 0;
  
  const riskScores = records.map(r => r.eudr_compliance?.risk_assessment?.risk_score || 100).filter(Boolean);
  const avgRisk = riskScores.length > 0 ? riskScores.reduce((a, b) => a + b, 0) / riskScores.length : 100;
  
  const summary = {
    generatedAt: new Date().toISOString(),
    totalShipments,
    compliantShipments: compliant,
    complianceRate: `${complianceRate}%`,
    avgRiskScore: avgRisk.toFixed(1),
    highRisk: records.filter(r => (r.eudr_compliance?.risk_assessment?.risk_level || 'high') === 'high').length,
    totalFields: records.reduce((sum, r) => sum + (r.field_mappings?.length || 0), 0),
    totalCerts: records.reduce((sum, r) => sum + (r.certifications?.length || 0), 0),
    auditLogCount: auditLogs.length
  };
  
  // Generate HTML report
  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Culbridge Compliance Report - ${summary.generatedAt}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    .header { background: #2c3e50; color: white; padding: 20px; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 20px 0; }
    .stat { background: #ecf0f1; padding: 15px; border-radius: 8px; text-align: center; }
    .stat h3 { margin: 0; color: #2c3e50; }
    .stat-value { font-size: 2em; font-weight: bold; }
    .good { color: #27ae60; } .warn { color: #f39c12; } .bad { color: #e74c3c; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background: #34495e; color: white; }
    .risk-high { background: #ffebee; } .risk-medium { background: #fff3e0; } .risk-low { background: #e8f5e8; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🌉 Culbridge EUDR Compliance Report</h1>
    <p>Generated: ${new Date().toLocaleString()}</p>
  </div>
  
  <div class="summary">
    <div class="stat"><h3>Total Shipments</h3><div class="stat-value">${summary.totalShipments}</div></div>
    <div class="stat"><h3>Compliance Rate</h3><div class="stat-value ${complianceRate > 80 ? 'good' : complianceRate > 50 ? 'warn' : 'bad'}">${summary.complianceRate}</div></div>
    <div class="stat"><h3>Avg Risk Score</h3><div class="stat-value">${summary.avgRiskScore}</div></div>
    <div class="stat"><h3>High Risk</h3><div class="stat-value">${summary.highRisk}</div></div>
  </div>
  
  <h2>Recent Shipments</h2>
  <table>
    <tr><th>Trace ID</th><th>Shipment ID</th><th>Product</th><th>Risk Level</th><th>Status</th></tr>
    ${records.slice(-10).map(r => `
      <tr class="risk-${(r.eudr_compliance?.risk_assessment?.risk_level || 'high').toLowerCase()}">
        <td>${r.trace_id.slice(-8)}</td>
        <td>${r.shipment_id}</td>
        <td>${r.product || 'Unknown'}</td>
        <td>${r.eudr_compliance?.risk_assessment?.risk_level || 'Unknown'}</td>
        <td>${r.eudr_compliance?.compliance_status || 'Pending'}</td>
      </tr>
    `).join('')}
  </table>
  
  <h2>Recent Audit Logs</h2>
  <ul>
    ${auditLogs.slice(-5).map(log => `<li>[${log.timestamp}] ${log.action}: ${JSON.stringify(log.details)}</li>`).join('')}
  </ul>
</body>
</html>`;
  
  console.log('Generated compliance report:', summary);
  return { html, summary, recordsCount: totalShipments };
}


module.exports = {
  createTraceabilityRecord,
  addFieldMappings,
  addCertification,
  getTraceabilityRecord,
  performRiskAssessment,
  getAuditTrail,
  getAllTraceabilityRecords,
  getAuditLogs,
  generateTraceId,
  generateComplianceReport  // Export stub
};
