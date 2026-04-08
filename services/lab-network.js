/**
 * Lab Testing Service
 * 
 * Implements Lab Network Registry, Routing Engine, and Result Ingestion
 * per the technical brief.
 */

const { run, get, all } = require('../utils/db');
const crypto = require('crypto');

const TEST_TYPES = {
  MRL_PESTICIDE_RESIDUE: 'MRL_PESTICIDE_RESIDUE',
  MYCOTOXIN_AFLATOXIN: 'MYCOTOXIN_AFLATOXIN',
  MYCOTOXIN_OCHRATOXIN: 'MYCOTOXIN_OCHRATOXIN',
  HEAVY_METALS: 'HEAVY_METALS',
  MICROBIOLOGICAL: 'MICROBIOLOGICAL',
  MOISTURE_CONTENT: 'MOISTURE_CONTENT',
  FOREIGN_MATTER: 'FOREIGN_MATTER',
  SALMONELLA: 'SALMONELLA',
  FUMIGATION_RESIDUE: 'FUMIGATION_RESIDUE'
};

const REQUEST_STATUS = {
  CREATED: 'CREATED',
  DISPATCHED_TO_LAB: 'DISPATCHED_TO_LAB',
  SAMPLE_COLLECTION_SCHEDULED: 'SAMPLE_COLLECTION_SCHEDULED',
  SAMPLE_RECEIVED_AT_LAB: 'SAMPLE_RECEIVED_AT_LAB',
  TESTING_IN_PROGRESS: 'TESTING_IN_PROGRESS',
  RESULT_READY: 'RESULT_READY',
  RESULT_INGESTED: 'RESULT_INGESTED',
  CANCELLED: 'CANCELLED'
};

const REQUIRED_TEST_SUITES = {
  'Sesame Seeds': {
    'NL': ['MRL_PESTICIDE_RESIDUE', 'SALMONELLA', 'HEAVY_METALS', 'MOISTURE_CONTENT'],
    'DE': ['MRL_PESTICIDE_RESIDUE', 'SALMONELLA', 'HEAVY_METALS'],
    'BE': ['MRL_PESTICIDE_RESIDUE', 'SALMONELLA']
  },
  'Cocoa Beans': {
    'NL': ['MYCOTOXIN_OCHRATOXIN', 'HEAVY_METALS', 'MRL_PESTICIDE_RESIDUE', 'MOISTURE_CONTENT'],
    'DE': ['MYCOTOXIN_OCHRATOXIN', 'HEAVY_METALS', 'MRL_PESTICIDE_RESIDUE']
  },
  'Ginger': {
    'NL': ['MRL_PESTICIDE_RESIDUE', 'HEAVY_METALS', 'SALMONELLA', 'MYCOTOXIN_AFLATOXIN'],
    'DE': ['MRL_PESTICIDE_RESIDUE', 'HEAVY_METALS', 'SALMONELLA']
  },
  'Shea Butter': {
    'NL': ['MRL_PESTICIDE_RESIDUE', 'HEAVY_METALS'],
    'DE': ['MRL_PESTICIDE_RESIDUE', 'HEAVY_METALS']
  },
  'Beans': {
    'NL': ['MYCOTOXIN_AFLATOXIN', 'SALMONELLA'],
    'DE': ['MYCOTOXIN_AFLATOXIN', 'SALMONELLA']
  }
};

async function getActiveLabs() {
  return await all(`
    SELECT * FROM accredited_labs WHERE active = 1
  `);
}

async function getLabById(labId) {
  return await get('SELECT * FROM accredited_labs WHERE lab_id = ?', [labId]);
}

async function checkLabAccreditationExpiry() {
  const today = new Date().toISOString().split('T')[0];
  
  const expiredLabs = await all(`
    SELECT * FROM accredited_labs 
    WHERE active = 1 AND valid_until < ?
  `, [today]);

  for (const lab of expiredLabs) {
    await run(`
      UPDATE accredited_labs SET active = 0 WHERE lab_id = ?
    `, [lab.lab_id]);
    console.log(`Lab ${lab.lab_name} accreditation expired - deactivated`);
  }

  return expiredLabs;
}

function getRequiredTestSuite(commodity, destinationCountry, riskLevel = 'MEDIUM') {
  const commodityKey = commodity.replace(/_/g, ' ');
  const tests = REQUIRED_TEST_SUITES[commodityKey]?.[destinationCountry] 
    || REQUIRED_TEST_SUITES[commodityKey]?.['NL']
    || [TEST_TYPES.MRL_PESTICIDE_RESIDUE, TEST_TYPES.SALMONELLA];

  if (riskLevel === 'HIGH' || riskLevel === 'CRITICAL') {
    if (!tests.includes(TEST_TYPES.MYCOTOXIN_AFLATOXIN)) {
      tests.push(TEST_TYPES.MYCOTOXIN_AFLATOXIN);
    }
  }

  return tests;
}

async function routeToLab(request) {
  const { commodity, destination_country, risk_level, required_by_date, exporter_tier } = request;
  
  const requiredTests = getRequiredTestSuite(commodity, destination_country, risk_level);
  
  const eligibleLabs = await all(`
    SELECT * FROM accredited_labs 
    WHERE active = 1 
    AND (products_covered LIKE ? OR products_covered LIKE ? OR products_covered LIKE ?)
  `, [
    `%${commodity}%`, 
    `%${commodity.replace(/_/g, ' ')}%`,
    '%"all"%'
  ]);

  if (eligibleLabs.length === 0) {
    throw new Error(`No eligible lab found for ${commodity} → ${destination_country}`);
  }

  const daysUntilRequired = required_by_date 
    ? Math.ceil((new Date(required_by_date) - new Date()) / (1000 * 60 * 60 * 24))
    : 30;

  const ranked = eligibleLabs.sort((a, b) => {
    const scoreA = (a.performance_score || 80) * 0.5 + 
                   ((10 - (a.average_turnaround_days || 7)) * 3) +
                   (a.is_preferred ? 20 : 0);
    const scoreB = (b.performance_score || 80) * 0.5 + 
                   ((10 - (b.average_turnaround_days || 7)) * 3) +
                   (b.is_preferred ? 20 : 0);
    return scoreB - scoreA;
  });

  const selected = ranked[0];
  
  return {
    selected_lab: selected,
    test_suite: requiredTests,
    estimated_result_date: new Date(Date.now() + (selected.average_turnaround_days || 7) * 24 * 60 * 60 * 1000),
    routing_reason: `Selected ${selected.lab_name} for ${commodity} tests to ${destination_country}`,
    alternative_labs: ranked.slice(1, 3),
    estimated_cost_usd: requiredTests.length * (selected.price_per_test_usd || 150),
    urgent: daysUntilRequired <= (selected.average_turnaround_days || 7) + 2
  };
}

async function createLabTestRequest(request) {
  const request_id = `CUL-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
  
  await run(`
    INSERT INTO lab_test_requests (
      request_id, shipment_id, lab_id, exporter_id, commodity, 
      test_suite, status, sample_due_at_lab_by, results_required_by,
      culbridge_reference_number, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    request_id,
    request.shipment_id,
    request.lab_id,
    request.exporter_id,
    request.commodity,
    JSON.stringify(request.test_suite),
    REQUEST_STATUS.CREATED,
    request.sample_due_at_lab_by || null,
    request.results_required_by || null,
    request_id,
    new Date().toISOString()
  ]);

  return { request_id, status: REQUEST_STATUS.CREATED };
}

async function dispatchLabRequest(requestId) {
  const request = await get('SELECT * FROM lab_test_requests WHERE request_id = ?', [requestId]);
  if (!request) throw new Error('Request not found');

  const lab = await getLabById(request.lab_id);
  
  await run(`
    UPDATE lab_test_requests SET status = ?, sample_collection_method = ?
    WHERE request_id = ?
  `, [
    REQUEST_STATUS.DISPATCHED_TO_LAB,
    lab?.integration_type || 'MANUAL',
    requestId
  ]);

  return { request_id: requestId, dispatched: true, lab };
}

async function ingestLabResult(payload) {
  const { request_id, shipment_id, lab_id, test_results, overall_passed, failed_parameters, certificate_number, raw_pdf_url } = payload;
  
  const result_id = `LR-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
  
  await run(`
    INSERT INTO lab_test_results (
      id, shipment_id, lab_id, mrl_results, mycotoxin_results, heavy_metal_results,
      moisture_content_percent, overall_passed, failed_parameters,
      certificate_number, raw_pdf_url, test_date, result_date, ingestion_method
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    result_id,
    shipment_id,
    lab_id,
    JSON.stringify(test_results?.mrl || []),
    JSON.stringify(test_results?.mycotoxin || []),
    JSON.stringify(test_results?.heavy_metals || []),
    test_results?.moisture_content || null,
    overall_passed ? 1 : 0,
    JSON.stringify(failed_parameters || []),
    certificate_number || null,
    raw_pdf_url || null,
    test_results?.test_date || new Date().toISOString(),
    new Date().toISOString(),
    payload.ingestion_method || 'API'
  ]);

  await run(`
    UPDATE lab_test_requests SET status = ?, result_received_at = ?
    WHERE request_id = ?
  `, [REQUEST_STATUS.RESULT_INGESTED, new Date().toISOString(), request_id]);

  return { result_id, overall_passed };
}

async function processLabResult(result) {
  const shipment = await get('SELECT * FROM shipments WHERE id = ?', [result.shipment_id]);
  
  if (result.overall_passed) {
    await run(`
      UPDATE shipments SET status = 'LAB_TEST_CLEARED', updated_at = ?
      WHERE id = ?
    `, [new Date().toISOString(), result.shipment_id]);
    
    return { action: 'ADVANCED', new_status: 'LAB_TEST_CLEARED' };
  } else {
    await run(`
      UPDATE shipments SET status = 'LAB_TEST_FAILED', updated_at = ?
      WHERE id = ?
    `, [new Date().toISOString(), result.shipment_id]);
    
    await run(`
      INSERT INTO compliance_flags (id, shipment_id, code, severity, message, module, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      crypto.randomUUID(),
      result.shipment_id,
      'LAB_TEST_FAILED',
      'CRITICAL',
      `Lab test failed: ${result.failed_parameters?.map(p => p.parameter).join(', ') || 'unknown'}`,
      'lab-testing',
      new Date().toISOString()
    ]);

    return { action: 'BLOCKED', new_status: 'LAB_TEST_FAILED' };
  }
}

async function getLabRequestStatus(shipmentId) {
  const requests = await all(`
    SELECT ltr.*, al.lab_name 
    FROM lab_test_requests ltr
    LEFT JOIN accredited_labs al ON ltr.lab_id = al.lab_id
    WHERE ltr.shipment_id = ?
    ORDER BY ltr.created_at DESC
  `, [shipmentId]);

  return requests;
}

module.exports = {
  getActiveLabs,
  getLabById,
  checkLabAccreditationExpiry,
  getRequiredTestSuite,
  routeToLab,
  createLabTestRequest,
  dispatchLabRequest,
  ingestLabResult,
  processLabResult,
  getLabRequestStatus,
  TEST_TYPES,
  REQUEST_STATUS,
  REQUIRED_TEST_SUITES
};
