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
const uuidv4 = require('uuid').v4;

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
  
  // Add to audit log
  addAuditLog('TRACEABILITY_CREATED', {
    trace_id: traceId,
    shipment_id: record.shipment_id
  });
  
  return record;
}

/**
 * Add field mapping data for EUDR compliance
 * @param {string} traceId - Traceability record ID
 * @param {Array} fieldMappings - Array of field mapping objects
 * @returns {Object} Updated record
 */
async function addFieldMappings(traceId, fieldMappings) {
  const record = traceabilityStore.shipments.get(traceId);
  if (!record) {
    throw new Error(`Traceability record not found: ${traceId}`);
  }
  
  const timestamp = new Date().toISOString();
  
  // Validate and process field mappings
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
  
  // Check if all fields are verified
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

/**
 * Add certification data (e.g., deforestation-free certificates)
 * @param {string} traceId - Traceability record ID
 * @param {Object} certification - Certification data
 * @returns {Object} Updated record
 */
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
  
  // Update EUDR compliance status
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

/**
 * Get traceability record by trace ID or shipment ID
 * @param {string} id - Trace ID or Shipment ID
 * @returns {Object} Traceability record
 */
async function getTraceabilityRecord(id) {
  // First try to find by trace ID
  let record = traceabilityStore.shipments.get(id);
  
  // If not found, search by shipment ID
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

/**
 * Perform EUDR risk assessment
 * @param {string} traceId - Traceability record ID
 * @returns {Object} Risk assessment result
 */
async function performRiskAssessment(traceId) {
  const record = await getTraceabilityRecord(traceId);
  if (!record) {
    throw new Error(`Traceability record not found: ${traceId}`);
  }
  
  const timestamp = new Date().toISOString();
  let riskScore = 0;
  const riskFactors = [];
  
  // Check field mappings
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
  
  // Check certifications
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
  
  // Check deforestation-free status
  if (record.eudr_compliance.deforestation_free === null) {
    riskFactors.push('Deforestation-free status not confirmed');
    riskScore += 20;
  } else if (!record.eudr_compliance.deforestation_free) {
    riskFactors.push('Cannot confirm deforestation-free');
    riskScore += 30;
  }
  
  // Determine risk level
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
  
  // Update record
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

/**
 * Generate EUDR compliance report
 * @param {string} traceId - Traceability record ID
 * @returns {Object} Compliance report
 */
async function generateComplianceReport(traceId) {
  const record = await getTraceabilityRecord(traceId);
  if (!record) {
    throw new Error(`Traceability record not found: ${traceId}`);
  }
  
  const timestamp = new Date().toISOString();
  
  // Calculate total area
  const totalArea = record.field_mappings.reduce((sum, fm) => 
    sum + (fm.area_hectares || 0), 0
  );
  
  const report = {
    report_id: generateTraceId('RPT'),
    trace_id: traceId,
    shipment_id: record.shipment_id,
    product: record.product,
    generated_at: timestamp,
    eudr_compliance: {
      deforestation_free: record.eudr_compliance.deforestation_free,
      geolocation_verified: record.eudr_compliance.geolocation_verified,
      certification_status: record.eudr_compliance.certification_status,
      risk_assessment: record.eudr_compliance.risk_assessment
    },
    field_summary: {
      total_fields: record.field_mappings.length,
      verified_fields: record.field_mappings.filter(fm => fm.verification_status === 'verified').length,
      total_area_hectares: totalArea
    },
    certification_summary: {
      total_certifications: (record.certifications || []).length,
      valid_certifications: (record.certifications || []).filter(c => c.status === 'valid').length
    },
    audit_trail_length: record.audit_trail.length
  };
  
  addAuditLog('COMPLIANCE_REPORT_GENERATED', {
    trace_id: traceId,
    report_id: report.report_id
  });
  
  return report;
}

/**
 * Add entry to audit log
 * @param {string} action - Action type
 * @param {Object} details - Action details
 */
function addAuditLog(action, details) {
  const logEntry = {
    id: generateTraceId('LOG'),
    action,
    details,
    timestamp: new Date().toISOString()
  };
  traceabilityStore.auditLogs.push(logEntry);
}

/**
 * Get audit trail for a traceability record
 * @param {string} traceId - Traceability record ID
 * @returns {Array} Audit trail
 */
async function getAuditTrail(traceId) {
  const record = await getTraceabilityRecord(traceId);
  if (!record) {
    throw new Error(`Traceability record not found: ${traceId}`);
  }
  return record.audit_trail;
}

/**
 * Get all traceability records
 * @returns {Array} All traceability records
 */
async function getAllTraceabilityRecords() {
  return Array.from(traceabilityStore.shipments.values());
}

/**
 * Update traceability status
 * @param {string} traceId - Traceability record ID
 * @param {string} status - New status
 * @returns {Object} Updated record
 */
async function updateStatus(traceId, status) {
  const record = await getTraceabilityRecord(traceId);
  if (!record) {
    throw new Error(`Traceability record not found: ${traceId}`);
  }
  
  const timestamp = new Date().toISOString();
  record.status = status;
  record.updated_at = timestamp;
  record.audit_trail.push({
    action: 'status_updated',
    timestamp: timestamp,
    details: `Status changed to ${status}`
  });
  
  traceabilityStore.shipments.set(traceId, record);
  
  addAuditLog('STATUS_UPDATED', {
    trace_id: traceId,
    new_status: status
  });
  
  return record;
}

/**
 * Get global audit logs
 * @param {number} limit - Number of entries to return
 * @returns {Array} Audit logs
 */
function getAuditLogs(limit = 100) {
  return traceabilityStore.auditLogs.slice(-limit);
}

module.exports = {
  createTraceabilityRecord,
  addFieldMappings,
  addCertification,
  getTraceabilityRecord,
  performRiskAssessment,
  generateComplianceReport,
  getAuditTrail,
  getAllTraceabilityRecords,
  updateStatus,
  getAuditLogs,
  generateTraceId
};
