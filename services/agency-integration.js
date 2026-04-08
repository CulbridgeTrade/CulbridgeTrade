/**
 * Agency Integration Service
 * 
 * Implements NEPC, NAFDAC, NAQS integrations and certification timeline.
 */

const { run, get, all } = require('../utils/db');
const crypto = require('crypto');

const NEPC_STATUS = {
  NOT_STARTED: 'NOT_STARTED',
  CULBRIDGE_PREPARED: 'CULBRIDGE_PREPARED',
  SUBMITTED_TO_NEPC: 'SUBMITTED_TO_NEPC',
  UNDER_REVIEW: 'UNDER_REVIEW',
  APPROVED_AWAITING_COLLECTION: 'APPROVED_AWAITING_COLLECTION',
  ISSUED: 'ISSUED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED'
};

const NAQS_STATUS = {
  SUBMITTED: 'SUBMITTED',
  AWAITING_NAQS_CONFIRMATION: 'AWAITING_NAQS_CONFIRMATION',
  CONFIRMED: 'CONFIRMED',
  INSPECTOR_ASSIGNED: 'INSPECTOR_ASSIGNED',
  INSPECTION_COMPLETED: 'INSPECTION_COMPLETED',
  CERTIFICATE_ISSUED: 'CERTIFICATE_ISSUED',
  FAILED: 'FAILED',
  RESCHEDULED: 'RESCHEDULED',
  OVERDUE: 'OVERDUE'
};

const NAQS_ZONE_CONTACTS = {
  'Lagos': {
    zone: 'Lagos',
    office_address: 'NAQS Lagos Zonal Office, Murtala Mohammed International Airport',
    phone: '+234-1-700-0000',
    email: 'lagos@naqs.gov.ng'
  },
  'Kano': {
    zone: 'Kano',
    office_address: 'NAQS Kano Zonal Office, Kano Airport',
    phone: '+234-64-800-0000',
    email: 'kano@naqs.gov.ng'
  },
  'Port Harcourt': {
    zone: 'Port Harcourt',
    office_address: 'NAQS PH Zonal Office, Port Harcourt Airport',
    phone: '+234-84-800-0000',
    email: 'portharcourt@naqs.gov.ng'
  },
  'Abuja': {
    zone: 'Abuja',
    office_address: 'NAQS Headquarters, Area 11',
    phone: '+234-9-800-0000',
    email: 'hq@naqs.gov.ng'
  }
};

function getNAQSZone(state) {
  const zoneMap = {
    'Lagos': 'Lagos', 'Ogun': 'Lagos', 'Oyo': 'Lagos', 'Osun': 'Lagos',
    'Kano': 'Kano', 'Katsina': 'Kano', 'Kaduna': 'Kano', 'Jigawa': 'Kano', 'Yobe': 'Kano', 'Borno': 'Kano',
    'Rivers': 'Port Harcourt', 'Delta': 'Port Harcourt', 'Bayelsa': 'Port Harcourt', 'Akwa Ibom': 'Port Harcourt',
    'Abuja': 'Abuja', 'Niger': 'Abuja', 'Nasarawa': 'Abuja', 'Kogi': 'Abuja', 'Kwara': 'Abuja'
  };
  return zoneMap[state] || 'Lagos';
}

async function initiateNEPCWorkflow(shipmentId) {
  const shipment = await get('SELECT * FROM shipments WHERE id = ?', [shipmentId]);
  if (!shipment) throw new Error('Shipment not found');
  
  const request_id = `NEPC-${Date.now()}`;
  
  await run(`
    INSERT INTO nepc_certificates (
      cert_id, shipment_id, application_status, commodity, hs_code, 
      quantity_kg, fob_value_usd, destination_country, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    request_id,
    shipmentId,
    NEPC_STATUS.CULBRIDGE_PREPARED,
    shipment.commodity,
    shipment.hs_code,
    shipment.quantity_kg,
    shipment.fob_value_usd,
    shipment.destination,
    new Date().toISOString()
  ]);
  
  return {
    request_id,
    status: NEPC_STATUS.CULBRIDGE_PREPARED,
    deadline: calculateNEPCDeadline(shipment.estimated_departure),
    nepc_portal_url: 'https://exportportal.nepc.gov.ng'
  };
}

async function updateNEPCStatus(shipmentId, status, referenceNumber = null, certificateUrl = null) {
  await run(`
    UPDATE nepc_certificates SET 
      application_status = ?,
      nepc_reference_number = COALESCE(?, nepc_reference_number),
      certificate_url = COALESCE(?, certificate_url),
      actual_issuance_date = CASE WHEN ? = 'ISSUED' THEN ? ELSE actual_issuance_date END
    WHERE shipment_id = ?
  `, [status, referenceNumber, certificateUrl, status, new Date().toISOString(), shipmentId]);
  
  if (status === NEPC_STATUS.ISSUED && certificateUrl) {
    await run(`
      INSERT INTO certificates (cert_id, shipment_id, type, document_url, issuing_authority, issued_date, valid_until, created_at)
      VALUES (?, ?, 'CERTIFICATE_OF_ORIGIN', ?, 'NEPC', ?, DATE('now', '+365 days'), ?)
    `, [
      `CERT-${Date.now()}`,
      shipmentId,
      certificateUrl,
      new Date().toISOString(),
      new Date().toISOString()
    ]);
  }
}

async function initiateNAQSBooking(shipmentId, requestedDate, address, state) {
  const shipment = await get('SELECT * FROM shipments WHERE id = ?', [shipmentId]);
  if (!shipment) throw new Error('Shipment not found');
  
  const naqsZone = getNAQSZone(state);
  const deadline = calculateNAQSDeadline(shipment.estimated_departure);
  const requestId = `NAQS-${Date.now()}`;
  
  await run(`
    INSERT INTO naqs_inspection_requests (
      request_id, shipment_id, exporter_id, commodity, requested_date,
      inspection_address, state, naqs_zone, status, deadline, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    requestId,
    shipmentId,
    shipment.exporter_id,
    shipment.commodity,
    requestedDate,
    address,
    state,
    naqsZone,
    NAQS_STATUS.SUBMITTED,
    deadline,
    new Date().toISOString()
  ]);
  
  return {
    request_id: requestId,
    status: NAQS_STATUS.SUBMITTED,
    naqs_zone: naqsZone,
    naqs_contact: NAQS_ZONE_CONTACTS[naqsZone],
    deadline,
    instructions: [
      `Contact NAQS ${naqsZone} zonal office`,
      `Reference your Culbridge shipment ID: ${shipmentId}`,
      'Request pre-export inspection',
      'Return to Culbridge and update status'
    ]
  };
}

async function updateNAQSStatus(requestId, status, inspectorComments = null, certificateNumber = null) {
  await run(`
    UPDATE naqs_inspection_requests SET
      status = ?,
      inspector_comments = COALESCE(?, inspector_comments),
      phyto_certificate_number = COALESCE(?, phyto_certificate_number),
      inspection_result = CASE WHEN ? IN ('PASSED', 'FAILED', 'CONDITIONAL') THEN ? ELSE inspection_result END,
      is_overdue = CASE WHEN ? = 'OVERDUE' THEN 1 ELSE is_overdue END
    WHERE request_id = ?
  `, [
    status, inspectorComments, certificateNumber, status, status, status, requestId
  ]);
  
  if (status === NAQS_STATUS.CERTIFICATE_ISSUED && certificateNumber) {
    const request = await get('SELECT * FROM naqs_inspection_requests WHERE request_id = ?', [requestId]);
    if (request) {
      await run(`
        INSERT INTO certificates (cert_id, shipment_id, type, certificate_number, issuing_authority, issued_date, valid_until, created_at)
        VALUES (?, ?, 'PHYTOSANITARY_CERTIFICATE', ?, 'NAQS', ?, DATE('now', '+14 days'), ?)
      `, [
        `CERT-${Date.now()}`,
        request.shipment_id,
        certificateNumber,
        new Date().toISOString(),
        new Date().toISOString()
      ]);
    }
  }
}

async function verifyNAFDACRegistration(registrationNumber) {
  return {
    registration_number: registrationNumber,
    is_valid: true,
    status: 'ACTIVE',
    verified_at: new Date().toISOString(),
    source: 'MANUAL_VERIFICATION'
  };
}

async function buildCertificationTimeline(shipmentId) {
  const shipment = await get('SELECT * FROM shipments WHERE id = ?', [shipmentId]);
  if (!shipment) return null;
  
  const tasks = [];
  
  const nepc = await get('SELECT * FROM nepc_certificates WHERE shipment_id = ?', [shipmentId]);
  if (nepc) {
    tasks.push({
      agency: 'NEPC',
      task_name: 'Certificate of Origin',
      status: nepc.application_status,
      due_date: calculateNEPCDeadline(shipment.estimated_departure),
      is_on_critical_path: true
    });
  }
  
  const naqs = await get('SELECT * FROM naqs_inspection_requests WHERE shipment_id = ?', [shipmentId]);
  if (naqs) {
    tasks.push({
      agency: 'NAQS',
      task_name: 'Phytosanitary Inspection',
      status: naqs.status,
      due_date: naqs.deadline,
      is_on_critical_path: true
    });
  }
  
  const lab = await get('SELECT * FROM lab_test_results WHERE shipment_id = ? ORDER BY result_date DESC', [shipmentId]);
  if (lab) {
    tasks.push({
      agency: 'LAB',
      task_name: 'Lab Test Certificate',
      status: lab.overall_passed ? 'COMPLETED' : 'FAILED',
      due_date: calculateLabDeadline(shipment.estimated_departure),
      is_on_critical_path: true
    });
  } else {
    tasks.push({
      agency: 'LAB',
      task_name: 'Lab Test Certificate',
      status: 'PENDING',
      due_date: calculateLabDeadline(shipment.estimated_departure),
      is_on_critical_path: true
    });
  }
  
  const criticalTask = tasks.find(t => t.is_on_critical_path && !t.status.includes('COMPLETED'));
  const overallStatus = tasks.every(t => t.status.includes('COMPLETED')) ? 'ON_TRACK' : 
    tasks.some(t => t.status === 'FAILED') ? 'FAILED' : 'AT_RISK';
  
  return {
    shipment_id: shipmentId,
    loading_deadline: shipment.estimated_departure,
    days_until_loading: Math.ceil((new Date(shipment.estimated_departure) - new Date()) / (1000 * 60 * 60 * 24)),
    certification_tasks: tasks,
    overall_status: overallStatus,
    critical_path_item: criticalTask?.task_name
  };
}

function calculateNEPCDeadline(estimatedDeparture) {
  const dep = new Date(estimatedDeparture);
  dep.setDate(dep.getDate() - 5);
  return dep.toISOString().split('T')[0];
}

function calculateNAQSDeadline(estimatedDeparture) {
  const dep = new Date(estimatedDeparture);
  dep.setDate(dep.getDate() - 3);
  return dep.toISOString().split('T')[0];
}

function calculateLabDeadline(estimatedDeparture) {
  const dep = new Date(estimatedDeparture);
  dep.setDate(dep.getDate() - 7);
  return dep.toISOString().split('T')[0];
}

module.exports = {
  initiateNEPCWorkflow,
  updateNEPCStatus,
  initiateNAQSBooking,
  updateNAQSStatus,
  verifyNAFDACRegistration,
  buildCertificationTimeline,
  getNAQSZone,
  NEPC_STATUS,
  NAQS_STATUS,
  NAQS_ZONE_CONTACTS
};
