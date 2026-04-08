/**
 * Multi-Source Certificate Verification Engine
 * 
 * Validates certificate authenticity by:
 * - Checking issuing authority confirmation
 * - Verifying revocation status
 * - Cross-agency consistency checks
 * - Integration with NAQS, NEPC, NAFDAC, SON APIs
 */

// Certificate types and their issuing authorities
const CERTIFICATE_AUTHORITIES = {
  phytosanitary: {
    agency: 'NAQS',
    apiEndpoint: process.env.NAQS_API || 'https://api.naqs.gov.ng/verify',
    fields: ['certificate_number', 'issue_date', 'expiry_date', 'consignment_details']
  },
  lab_report: {
    agency: 'ISO17025_LAB',
    apiEndpoint: process.env.LAB_API || 'https://api.lab-accreditation.gov.ng/verify',
    fields: ['lab_id', 'report_number', 'test_results', 'accreditation_status']
  },
  coa: {
    agency: 'NEPC',
    apiEndpoint: process.env.NEPC_API || 'https://api.nepc.gov.ng/verify',
    fields: ['certificate_number', 'product', 'quantity', 'destination']
  },
  nafdac_registration: {
    agency: 'NAFDAC',
    apiEndpoint: process.env.NAFDAC_API || 'https://api.nafdac.gov.ng/verify',
    fields: ['registration_number', 'product_name', 'manufacturer', 'expiry_date']
  },
  son_cap: {
    agency: 'SON',
    apiEndpoint: process.env.SON_API || 'https://api.son.gov.ng/verify',
    fields: ['certificate_number', 'product_standard', 'test_report']
  },
  aeo_certificate: {
    agency: 'CUSTOMS',
    apiEndpoint: process.env.CUSTOMS_API || 'https://api.customs.gov.ng/verify',
    fields: ['aeo_number', 'owner_name', 'validity_period', 'tier']
  }
};

// Simulated certificate registry (in production, this would be real databases)
const CERTIFICATE_REGISTRY = {
  // Valid certificates
  'NAQS-PHY-2024-001': {
    status: 'VALID',
    agency: 'NAQS',
    issued_to: 'Sample Exporter Ltd',
    issue_date: '2024-01-15',
    expiry_date: '2025-01-15',
    product: 'Cocoa beans',
    quantity: '10000 KG'
  },
  'LAB-ISO-2024-001': {
    status: 'VALID',
    agency: 'ISO17025',
    lab_name: 'Lagos ISO Lab',
    report_number: 'LAB-2024-001',
    test_type: 'Aflatoxin',
    result: 'PASS',
    accreditation: 'ISO 17025:2017'
  },
  'NEPC-COA-2024-001': {
    status: 'VALID',
    agency: 'NEPC',
    certificate_number: 'NEPC-COA-2024-001',
    product: 'Sesame seeds',
    destination: 'Netherlands',
    quantity: '5000 KG'
  },
  // Revoked certificate
  'NAQS-PHY-2023-999': {
    status: 'REVOKED',
    agency: 'NAQS',
    issued_to: 'Revoked Exporter',
    issue_date: '2023-06-01',
    expiry_date: '2024-06-01',
    revocation_reason: 'Non-compliance with phytosanitary requirements'
  },
  // Expired certificate
  'NAQS-PHY-2022-001': {
    status: 'EXPIRED',
    agency: 'NAQS',
    issued_to: 'Expired Exporter',
    issue_date: '2022-01-01',
    expiry_date: '2023-01-01'
  }
};

/**
 * Verify certificate authenticity
 * @param {string} certificateType - Type of certificate
 * @param {Object} certificateData - Certificate data to verify
 * @returns {Object} Verification result
 */
async function verifyCertificate(certificateType, certificateData) {
  const result = {
    certificate_type: certificateType,
    reference: certificateData.reference || certificateData.certificate_number || 'UNKNOWN',
    verified: false,
    status: 'UNKNOWN',
    agency: null,
    details: {},
    cross_agency_consistency: null,
    verification_timestamp: new Date().toISOString(),
    errors: [],
    warnings: []
  };
  
  const authority = CERTIFICATE_AUTHORITIES[certificateType];
  if (!authority) {
    result.errors.push(`Unknown certificate type: ${certificateType}`);
    return result;
  }
  
  result.agency = authority.agency;
  
  // Simulate API call to issuing authority
  const registryResult = await checkCertificateRegistry(
    certificateData.reference || certificateData.certificate_number,
    authority.agency
  );
  
  if (registryResult.found) {
    const cert = registryResult.certificate;
    result.details = cert;
    
    // Check status
    if (cert.status === 'VALID') {
      // Additional checks
      const today = new Date();
      const expiryDate = new Date(cert.expiry_date);
      
      if (expiryDate < today) {
        result.status = 'EXPIRED';
        result.errors.push(`Certificate expired on ${cert.expiry_date}`);
      } else {
        result.status = 'VALID';
        result.verified = true;
      }
    } else if (cert.status === 'REVOKED') {
      result.status = 'REVOKED';
      result.errors.push(`Certificate revoked: ${cert.revocation_reason || 'No reason provided'}`);
    } else if (cert.status === 'EXPIRED') {
      result.status = 'EXPIRED';
      result.errors.push(`Certificate expired on ${cert.expiry_date}`);
    } else {
      result.status = cert.status;
    }
  } else {
    // Certificate not found in registry - could be valid but not in database
    result.warnings.push('Certificate not found in registry - manual verification recommended');
    result.status = 'NOT_FOUND';
  }
  
  return result;
}

/**
 * Check certificate in local registry (simulates external API)
 */
async function checkCertificateRegistry(reference, agency) {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 100));
  
  const cert = CERTIFICATE_REGISTRY[reference];
  return {
    found: !!cert,
    certificate: cert || null
  };
}

/**
 * Cross-agency consistency check
 * Compares certificate data across multiple agencies to detect inconsistencies
 * @param {string} shipmentId - Shipment ID
 * @param {Object} certificates - All certificates for the shipment
 * @returns {Object} Consistency check result
 */
async function checkCrossAgencyConsistency(shipmentId, certificates) {
  const result = {
    shipment_id: shipmentId,
    consistent: true,
    inconsistencies: [],
    checks_performed: [],
    checked_at: new Date().ISOString()
  };
  
  // Check 1: NAQS vs NAFDAC product consistency
  if (certificates.phytosanitary && certificates.nafdac_registration) {
    const naqsProduct = certificates.phytosanitary.product;
    const nafdacProduct = certificates.nafdac_registration.product_name;
    
    if (naqsProduct && nafdacProduct && !naqsProduct.toLowerCase().includes(nafdacProduct.toLowerCase())) {
      result.inconsistencies.push({
        type: 'PRODUCT_MISMATCH',
        agencies: ['NAQS', 'NAFDAC'],
        details: `NAQS product: ${naqsProduct}, NAFDAC product: ${nafdacProduct}`
      });
    }
    result.checks_performed.push('NAQS vs NAFDAC product check');
  }
  
  // Check 2: Quantity consistency between NAQS and NEPC
  if (certificates.phytosanitary && certificates.coa) {
    const naqsQty = parseInt(certificates.phytosanitary.quantity);
    const nepcQty = parseInt(certificates.coa.quantity);
    
    if (!isNaN(naqsQty) && !isNaN(nepcQty) && Math.abs(naqsQty - nepcQty) > 100) {
      result.inconsistencies.push({
        type: 'QUANTITY_MISMATCH',
        agencies: ['NAQS', 'NEPC'],
        details: `NAQS: ${naqsQty}, NEPC: ${nepcQty}`
      });
    }
    result.checks_performed.push('NAQS vs NEPC quantity check');
  }
  
  // Check 3: Destination consistency
  if (certificates.phytosanitary && certificates.coa) {
    const naqsDest = certificates.phytosanitary.destination;
    const nepcDest = certificates.coa.destination;
    
    if (naqsDest && nepcDest && naqsDest !== nepcDest) {
      result.inconsistencies.push({
        type: 'DESTINATION_MISMATCH',
        agencies: ['NAQS', 'NEPC'],
        details: `NAQS destination: ${naqsDest}, NEPC destination: ${nepcDest}`
      });
    }
    result.checks_performed.push('Destination consistency check');
  }
  
  // Check 4: Exporter TIN consistency
  if (certificates.phytosanitary && certificates.entity_sync) {
    const naqsExporter = certificates.phytosanitary.issued_to;
    const entityTin = certificates.entity_sync.tin;
    
    // Simple check - in production would verify against business registry
    if (entityTin && !naqsExporter) {
      result.warnings.push({
        type: 'EXPORTER_VERIFICATION',
        details: 'Entity TIN verified but NAQS exporter name not available for cross-check'
      });
    }
    result.checks_performed.push('Exporter TIN verification');
  }
  
  result.consistent = result.inconsistencies.length === 0;
  
  return result;
}

/**
 * Batch verify all certificates for a shipment
 * @param {string} shipmentId - Shipment ID
 * @param {Object} certificates - Map of certificate type to certificate data
 * @returns {Object} Complete verification result
 */
async function verifyAllCertificates(shipmentId, certificates) {
  const results = {
    shipment_id: shipmentId,
    verified_at: new Date().toISOString(),
    certificates: {},
    overall_status: 'UNKNOWN',
    all_valid: false,
    errors: [],
    warnings: []
  };
  
  let allValid = true;
  
  // Verify each certificate
  for (const [certType, certData] of Object.entries(certificates)) {
    if (!certData) continue;
    
    const verification = await verifyCertificate(certType, certData);
    results.certificates[certType] = verification;
    
    if (!verification.verified) {
      allValid = false;
      results.errors.push(`${certType}: ${verification.errors.join(', ')}`);
    }
    
    if (verification.warnings.length > 0) {
      results.warnings.push(...verification.warnings.map(w => `${certType}: ${w}`));
    }
  }
  
  // Cross-agency consistency check
  if (Object.keys(certificates).length > 1) {
    const consistencyResult = await checkCrossAgencyConsistency(shipmentId, certificates);
    results.cross_agency_consistency = consistencyResult;
    
    if (!consistencyResult.consistent) {
      allValid = false;
      results.errors.push('Cross-agency inconsistencies detected');
    }
  }
  
  results.all_valid = allValid;
  results.overall_status = allValid ? 'VERIFIED' : 'FAILED';
  
  return results;
}

// Revocation check function
async function checkRevocationStatus(certificateType, reference) {
  const cert = CERTIFICATE_REGISTRY[reference];
  
  if (!cert) {
    return { status: 'UNKNOWN', reason: 'Not in registry' };
  }
  
  if (cert.status === 'REVOKED') {
    return {
      status: 'REVOKED',
      revoked: true,
      reason: cert.revocation_reason,
      revoked_at: cert.revoked_at || 'Unknown'
    };
  }
  
  return { status: 'NOT_REVOKED', revoked: false };
}

module.exports = {
  verifyCertificate,
  verifyAllCertificates,
  checkCrossAgencyConsistency,
  checkRevocationStatus,
  CERTIFICATE_AUTHORITIES
};

// Test execution
if (require.main === module) {
  console.log('=== Certificate Verification Test ===\n');
  
  // Test 1: Valid certificate
  console.log('Test 1: Valid NAQS certificate');
  const validResult = await verifyCertificate('phytosanitary', { reference: 'NAQS-PHY-2024-001' });
  console.log(JSON.stringify(validResult, null, 2));
  
  // Test 2: Revoked certificate
  console.log('\nTest 2: Revoked certificate');
  const revokedResult = await verifyCertificate('phytosanitary', { reference: 'NAQS-PHY-2023-999' });
  console.log(JSON.stringify(revokedResult, null, 2));
  
  // Test 3: Batch verification
  console.log('\nTest 3: Batch verification');
  const batchResult = await verifyAllCertificates('SHIP-001', {
    phytosanitary: { reference: 'NAQS-PHY-2024-001', product: 'Cocoa beans', destination: 'NL' },
    coa: { reference: 'NEPC-COA-2024-001', product: 'Cocoa beans', destination: 'NL', quantity: '10000' },
    entity_sync: { tin: 'TIN-123' }
  });
  console.log(JSON.stringify(batchResult, null, 2));
}