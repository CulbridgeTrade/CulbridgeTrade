/**
 * TRACES NT - Certificate & Traceability Validation Service
 * 
 * Purpose: Validate:
 * - Phytosanitary certificates
 * - Traceability chain
 * - Batch legitimacy
 * 
 * Note: TRACES is not fully open API. This service implements:
 * - Manual ingestion (exported certs / CSV / PDF parsing)
 * - Certificate validation logic
 * 
 * Integration: deterministic_engine.traceability_check()
 * 
 * Data Source: TRACES NT (EU Trade Control and Expert System)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ==================== CONFIGURATION ====================

const config = {
  // Storage path
  dataPath: path.join(__dirname, '..', 'data', 'traces_certificates.json'),
  
  // Certificate status options
  validStatuses: ['VALID', 'CONFIRMED', 'VERIFIED'],
  invalidStatuses: ['INVALID', 'REVOKED', 'EXPIRED', 'SUSPENDED'],
  
  // Validation rules
  requireFields: [
    'certificate_id',
    'exporter',
    'origin_country',
    'product',
    'batch_id',
    'issue_date'
  ]
};

// ==================== IN-MEMORY STORAGE ====================

let certificates = {
  lastUpdated: null,
  certs: []
};

// ==================== CORE FUNCTIONS ====================

/**
 * Initialize TRACES service
 */
async function initialize() {
  console.log('TRACES NT Service initializing...');
  await loadCertificates();
  console.log(`TRACES NT: ${certificates.certs.length} certificates loaded`);
  return true;
}

/**
 * Load certificates from storage
 */
async function loadCertificates() {
  try {
    if (fs.existsSync(config.dataPath)) {
      const data = fs.readFileSync(config.dataPath, 'utf8');
      certificates = JSON.parse(data);
    }
  } catch (error) {
    console.log('No existing certificates found');
  }
}

/**
 * Save certificates to storage
 */
async function saveCertificates() {
  try {
    const dataDir = path.dirname(config.dataPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(config.dataPath, JSON.stringify(certificates, null, 2));
  } catch (error) {
    console.error('Failed to save certificates:', error.message);
  }
}

/**
 * Parse certificate (simulated - accepts JSON for MVP)
 * In production, would parse PDF/XML from TRACES
 */
function parseCertificate(input) {
  // If input is already parsed JSON
  if (typeof input === 'object') {
    return {
      certificate_id: input.certificate_id || input.certificateId || generateCertificateId(),
      exporter: input.exporter || input.exporterName,
      origin_country: input.origin_country || input.originCountry || input.countryOfOrigin,
      product: input.product || input.productDescription,
      hs_code: input.hs_code || input.hsCode,
      batch_id: input.batch_id || input.batchId || input.lotNumber,
      issue_date: input.issue_date || input.issueDate,
      expiry_date: input.expiry_date || input.expiryDate,
      status: input.status || 'VALID',
      issuing_authority: input.issuing_authority || input.issuingAuthority || 'NVWA',
      raw_data: input
    };
  }
  
  // If input is CSV line
  if (typeof input === 'string' && input.includes(',')) {
    const fields = input.split(',');
    return {
      certificate_id: fields[0]?.trim(),
      exporter: fields[1]?.trim(),
      origin_country: fields[2]?.trim(),
      product: fields[3]?.trim(),
      hs_code: fields[4]?.trim(),
      batch_id: fields[5]?.trim(),
      issue_date: fields[6]?.trim(),
      status: fields[7]?.trim() || 'VALID',
      issuing_authority: fields[8]?.trim() || 'NVWA'
    };
  }
  
  return null;
}

/**
 * Generate certificate ID
 */
function generateCertificateId() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `TRACES-${timestamp}-${random}`;
}

/**
 * Import certificate(s)
 * Accepts: single object, array, or CSV string
 */
async function importCertificate(input) {
  const imported = [];
  
  if (Array.isArray(input)) {
    for (const item of input) {
      const cert = parseCertificate(item);
      if (cert) {
        const saved = await storeCertificate(cert);
        imported.push(saved);
      }
    }
  } else if (typeof input === 'string' && input.includes(',')) {
    // CSV - parse line by line
    const lines = input.split('\n').filter(l => l.trim());
    for (const line of lines) {
      const cert = parseCertificate(line);
      if (cert) {
        const saved = await storeCertificate(cert);
        imported.push(saved);
      }
    }
  } else {
    const cert = parseCertificate(input);
    if (cert) {
      const saved = await storeCertificate(cert);
      imported.push(saved);
    }
  }
  
  certificates.lastUpdated = new Date().toISOString();
  await saveCertificates();
  
  return imported;
}

/**
 * Store certificate
 */
async function storeCertificate(certData) {
  const certificate = {
    ...certData,
    id: certData.certificate_id,
    status: certData.status || 'VALID',
    created_at: new Date().toISOString(),
    validated_at: null
  };
  
  // Check for existing
  const existingIndex = certificates.certs.findIndex(c => c.certificate_id === certificate.certificate_id);
  
  if (existingIndex >= 0) {
    certificates.certs[existingIndex] = certificate;
  } else {
    certificates.certs.push(certificate);
  }
  
  return certificate;
}

/**
 * Validate certificate
 * Integration point: deterministic_engine.traceability_check()
 */
function validate(certificateIdOrData) {
  // If full shipment data, extract certificate ID
  let certificateId = certificateIdOrData;
  let shipmentData = null;
  
  if (typeof certificateIdOrData === 'object') {
    shipmentData = certificateIdOrData;
    certificateId = certificateIdOrData.certificate_id || certificateIdOrData.certificateId;
  }
  
  const validationResult = {
    valid: false,
    certificate: null,
    violations: [],
    warnings: [],
    traceabilityScore: 0
  };
  
  // If no certificate ID provided, check by batch
  if (!certificateId && shipmentData?.batch_id) {
    const batchCerts = certificates.certs.filter(c => 
      c.batch_id === shipmentData.batch_id
    );
    
    if (batchCerts.length === 0) {
      validationResult.violations.push({
        type: 'NO_BATCH_CERTIFICATE',
        batch_id: shipmentData.batch_id,
        severity: 'HARD'
      });
      return validationResult;
    }
    
    // Use most recent certificate for batch
    certificateId = batchCerts[0].certificate_id;
  }
  
  // Find certificate
  const certificate = certificates.certs.find(c => 
    c.certificate_id === certificateId
  );
  
  if (!certificate) {
    validationResult.violations.push({
      type: 'CERTIFICATE_NOT_FOUND',
      certificate_id: certificateId,
      severity: 'HARD'
    });
    return validationResult;
  }
  
  validationResult.certificate = certificate;
  
  // Check status
  if (config.invalidStatuses.includes(certificate.status)) {
    validationResult.violations.push({
      type: 'INVALID_CERTIFICATE_STATUS',
      status: certificate.status,
      severity: 'HARD'
    });
    return validationResult;
  }
  
  // Check expiry
  if (certificate.expiry_date) {
    const expiryDate = new Date(certificate.expiry_date);
    const now = new Date();
    if (expiryDate < now) {
      validationResult.violations.push({
        type: 'CERTIFICATE_EXPIRED',
        expiry_date: certificate.expiry_date,
        severity: 'HARD'
      });
      return validationResult;
    }
  }
  
  // Check required fields
  for (const field of config.requireFields) {
    if (!certificate[field]) {
      validationResult.warnings.push({
        type: 'MISSING_FIELD',
        field,
        severity: 'SOFT'
      });
    }
  }
  
  // Validate against shipment data if provided
  if (shipmentData) {
    if (shipmentData.exporter && certificate.exporter) {
      if (!shipmentData.exporter.toLowerCase().includes(certificate.exporter.toLowerCase())) {
        validationResult.warnings.push({
          type: 'EXPORTER_MISMATCH',
          shipment_exporter: shipmentData.exporter,
          cert_exporter: certificate.exporter
        });
      }
    }
    
    if (shipmentData.batch_id && certificate.batch_id) {
      if (shipmentData.batch_id !== certificate.batch_id) {
        validationResult.violations.push({
          type: 'BATCH_MISMATCH',
          shipment_batch: shipmentData.batch_id,
          cert_batch: certificate.batch_id,
          severity: 'HARD'
        });
      }
    }
    
    if (shipmentData.origin_country && certificate.origin_country) {
      if (shipmentData.origin_country !== certificate.origin_country) {
        validationResult.warnings.push({
          type: 'ORIGIN_MISMATCH',
          shipment_origin: shipmentData.origin_country,
          cert_origin: certificate.origin_country
        });
      }
    }
  }
  
  // Calculate traceability score
  let score = 100;
  score -= validationResult.violations.length * 30;
  score -= validationResult.warnings.length * 10;
  validationResult.traceabilityScore = Math.max(0, score);
  
  // Set valid if no hard violations
  validationResult.valid = validationResult.violations.length === 0;
  
  return validationResult;
}

/**
 * Get certificate by ID
 */
function getCertificate(certificateId) {
  return certificates.certs.find(c => c.certificate_id === certificateId) || null;
}

/**
 * Get certificates by batch
 */
function getCertificatesByBatch(batchId) {
  return certificates.certs.filter(c => c.batch_id === batchId);
}

/**
 * Get certificates by exporter
 */
function getCertificatesByExporter(exporter) {
  return certificates.certs.filter(c => 
    c.exporter?.toLowerCase().includes(exporter.toLowerCase())
  );
}

/**
 * Get all certificates
 */
function getAllCertificates(limit = 100) {
  return certificates.certs.slice(-limit);
}

/**
 * Check batch exists in TRACES
 */
function batchExists(batchId) {
  return certificates.certs.some(c => c.batch_id === batchId);
}

/**
 * Get configuration
 */
function getConfig() {
  return {
    validStatuses: config.validStatuses,
    invalidStatuses: config.invalidStatuses,
    requireFields: config.requireFields,
    totalCertificates: certificates.certs.length,
    lastUpdated: certificates.lastUpdated
  };
}

// Initialize on load
initialize().catch(console.error);

module.exports = {
  initialize,
  importCertificate,
  parseCertificate,
  validate,
  getCertificate,
  getCertificatesByBatch,
  getCertificatesByExporter,
  getAllCertificates,
  batchExists,
  getConfig
};
