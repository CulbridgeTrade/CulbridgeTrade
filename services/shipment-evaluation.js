/**
 * Culbridge Shipment Evaluation Service
 * 
 * Core evaluation engine that recomputes EVERYTHING on each call.
 * This is the single source of truth for shipment state.
 */

const crypto = require('crypto');
const { db } = require('../utils/db');

// ============================================
// SHIPMENT STATUS DEFINITIONS
// ============================================

const ShipmentStatus = {
  DRAFT: 'DRAFT',
  PARTIAL: 'PARTIAL',
  VALIDATING: 'VALIDATING',
  READY: 'READY',
  SUBMITTED: 'SUBMITTED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED'
};

// ============================================
// REQUIRED DOCUMENTS BY COMMODITY
// ============================================

const REQUIRED_DOCUMENTS = {
  cocoa: ['COO', 'PHYTO', 'LAB', 'NAFDAC'],
  sesame: ['COO', 'PHYTO', 'LAB', 'NAFDAC'],
  cashew: ['COO', 'PHYTO', 'LAB', 'NAFDAC'],
  ginger: ['COO', 'PHYTO', 'LAB', 'NAFDAC'],
  groundnuts: ['COO', 'PHYTO', 'LAB', 'NAFDAC'],
  default: ['COO', 'INVOICE', 'PACKING']
};

// ============================================
// EVALUATION ENGINE
// ============================================

class ShipmentEvaluator {
  
  /**
   * Evaluate shipment - recomputes EVERYTHING
   * @param {string} shipmentId - Shipment ID
   * @returns {Object} - Full Shipment object
   */
  async evaluate(shipmentId) {
    // Get current shipment
    const shipment = await this.getShipment(shipmentId);
    if (!shipment) {
      throw new Error(`Shipment ${shipmentId} not found`);
    }

    // Set validating state
    await this.updateStatus(shipmentId, ShipmentStatus.VALIDATING);

    // Run all evaluations
    const commodityResult = this.evaluateCommodity(shipment);
    const documentsResult = await this.evaluateDocuments(shipmentId, shipment);
    const complianceResult = await this.evaluateCompliance(shipment);
    const feesResult = await this.calculateFees(shipment);
    const submissionResult = this.computeSubmissionReadiness(shipment, commodityResult, documentsResult, complianceResult);

    // Build full shipment object
    const fullShipment = this.buildShipmentObject(shipment, {
      commodity: commodityResult,
      documents: documentsResult,
      compliance: complianceResult,
      fees: feesResult,
      submission: submissionResult
    });

    // Determine final status
    const finalStatus = this.deriveFinalStatus(fullShipment);

    // Update shipment in DB
    await this.persistEvaluation(shipmentId, fullShipment, finalStatus);

    return fullShipment;
  }

  /**
   * Get current shipment data
   */
  async getShipment(shipmentId) {
    const shipment = await db.get(`
      SELECT s.*, e.name as exporter_name, e.verified as exporter_verified
      FROM Shipments s
      LEFT JOIN Entities e ON s.exporter_id = e.id
      WHERE s.id = ?
    `, [shipmentId]);

    if (!shipment) return null;

    // Parse JSON fields
    return {
      ...shipment,
      commodity: shipment.commodity_data ? JSON.parse(shipment.commodity_data) : {},
      destination: shipment.destination_data ? JSON.parse(shipment.destination_data) : {}
    };
  }

  /**
   * Evaluate commodity (HS Code)
   */
  evaluateCommodity(shipment) {
    const result = {
      description: shipment.commodity?.description || '',
      hsCode: shipment.commodity?.hsCode || null,
      confidence: null,
      alternatives: []
    };

    // Check if description exists
    if (!result.description || result.description.length < 10) {
      result.hsCode = null;
      return result;
    }

    // If HS Code provided, validate it
    if (result.hsCode) {
      const validation = this.validateHSCode(result.hsCode, result.description);
      result.hsCode = validation.valid ? result.hsCode : null;
      result.confidence = validation.confidence;
      result.alternatives = validation.alternatives;
    }

    return result;
  }

  /**
   * Validate HS Code
   */
  validateHSCode(hsCode, description) {
    // Simple validation - in production, use real HS database
    const validPrefixes = {
      '18': 'cocoa',
      '12': ['sesame', 'groundnuts', 'sunflower'],
      '08': 'cashew',
      '09': 'ginger'
    };

    const prefix = hsCode.substring(0, 2);
    const validCommodities = validPrefixes[prefix];

    if (!validCommodities) {
      return { valid: false, confidence: 0, alternatives: [] };
    }

    return {
      valid: true,
      confidence: 0.85,
      alternatives: []
    };
  }

  /**
   * Evaluate documents
   */
  async evaluateDocuments(shipmentId, shipment) {
    const commodityType = (shipment.category || 'default').toLowerCase();
    const requiredDocs = REQUIRED_DOCUMENTS[commodityType] || REQUIRED_DOCUMENTS.default;

    // Get uploaded documents
    const uploadedDocs = await db.all(`
      SELECT id, doc_type, status, file_hash 
      FROM ShipmentDocuments 
      WHERE shipment_id = ?
    `, [shipmentId]);

    const uploaded = uploadedDocs.map(doc => ({
      id: doc.id,
      type: doc.doc_type,
      status: doc.status, // UPLOADED, VALID, INVALID
      hash: doc.file_hash
    }));

    const uploadedTypes = uploaded.map(d => d.type);
    const missing = requiredDocs.filter(req => !uploadedTypes.includes(req));
    const valid = uploaded.filter(d => d.status === 'VALID').length;
    const invalid = uploaded.filter(d => d.status === 'INVALID').length;

    return {
      required: requiredDocs,
      uploaded,
      missing,
      validCount: valid,
      invalidCount: invalid,
      isComplete: missing.length === 0 && invalid === 0
    };
  }

  /**
   * Evaluate compliance
   */
  async evaluateCompliance(shipment) {
    const flags = [];
    let status = 'PASS';

    // Check HS Code
    if (!shipment.commodity?.hsCode) {
      flags.push({
        code: 'HS_CODE_MISSING',
        severity: 'BLOCKER',
        message: 'HS Code is required',
        actionRequired: true
      });
      status = 'BLOCKER';
    }

    // Check documents (will be added from documents evaluation)
    // Check entity
    if (!shipment.exporter_id) {
      flags.push({
        code: 'EXPORTER_MISSING',
        severity: 'BLOCKER',
        message: 'Exporter is required',
        actionRequired: true
      });
      if (status !== 'BLOCKER') status = 'BLOCKER';
    }

    // Check destination
    if (!shipment.destination?.country) {
      flags.push({
        code: 'DESTINATION_MISSING',
        severity: 'BLOCKER',
        message: 'Destination country is required',
        actionRequired: true
      });
      if (status !== 'BLOCKER') status = 'BLOCKER';
    }

    // Check EUDR for EU destinations
    if (shipment.destination?.country === 'EU' || shipment.destination?.country === 'NL') {
      if (!shipment.eudr_compliant) {
        flags.push({
          code: 'EUDR_TRACEABILITY_MISSING',
          severity: 'BLOCKER',
          message: 'EUDR traceability data required for EU exports',
          actionRequired: true
        });
        if (status !== 'BLOCKER') status = 'BLOCKER';
      }
    }

    // Add WARNING for incomplete commodity description
    if (shipment.commodity?.description && shipment.commodity.description.length < 20) {
      flags.push({
        code: 'DESCRIPTION_TOO_SHORT',
        severity: 'WARNING',
        message: 'Product description should be more detailed',
        actionRequired: false
      });
      if (status === 'PASS') status = 'WARNING';
    }

    return {
      status,
      flags
    };
  }

  /**
   * Calculate fees
   */
  async calculateFees(shipment) {
    // Base fees by commodity
    const baseFees = {
      cocoa: 45000,
      sesame: 35000,
      cashew: 40000,
      ginger: 30000,
      groundnuts: 35000,
      default: 25000
    };

    const commodityType = (shipment.category || 'default').toLowerCase();
    const total = baseFees[commodityType] || baseFees.default;

    // Add document fees
    const breakdown = [
      { name: 'Processing Fee', amount: total * 0.6, currency: 'NGN', processingDays: 3 },
      { name: 'NAQS Fee', amount: total * 0.2, currency: 'NGN', processingDays: 5 },
      { name: 'NAFDAC Fee', amount: total * 0.2, currency: 'NGN', processingDays: 7 }
    ];

    return {
      total,
      breakdown
    };
  }

  /**
   * Compute submission readiness
   */
  computeSubmissionReadiness(shipment, commodityResult, documentsResult, complianceResult) {
    const errors = [];
    let ready = true;

    // Check compliance
    if (complianceResult.status === 'BLOCKER') {
      errors.push('Compliance check failed - fix BLOCKER issues');
      ready = false;
    }

    // Check documents
    if (documentsResult.missing.length > 0) {
      errors.push(`Missing documents: ${documentsResult.missing.join(', ')}`);
      ready = false;
    }

    if (documentsResult.invalidCount > 0) {
      errors.push('Some documents are invalid');
      ready = false;
    }

    // Check HS Code
    if (!commodityResult.hsCode) {
      errors.push('HS Code is required');
      ready = false;
    }

    // Check exporter
    if (!shipment.exporter_id) {
      errors.push('Exporter is required');
      ready = false;
    }

    // Check destination
    if (!shipment.destination?.country) {
      errors.push('Destination is required');
      ready = false;
    }

    return {
      ready,
      errors
    };
  }

  /**
   * Build full shipment object
   */
  buildShipmentObject(shipment, results) {
    return {
      id: shipment.id,
      status: shipment.status,
      createdAt: shipment.created_at,
      updatedAt: shipment.updated_at,

      commodity: {
        description: results.commodity.description,
        hsCode: results.commodity.hsCode,
        confidence: results.commodity.confidence,
        alternatives: results.commodity.alternatives
      },

      entity: {
        exporterId: shipment.exporter_id,
        exporterName: shipment.exporter_name,
        verified: shipment.exporter_verified === 1
      },

      destination: {
        country: shipment.destination?.country || null
      },

      documents: {
        required: results.documents.required,
        uploaded: results.documents.uploaded,
        missing: results.documents.missing
      },

      compliance: {
        status: results.compliance.status,
        flags: results.compliance.flags
      },

      fees: {
        total: results.fees.total,
        breakdown: results.fees.breakdown
      },

      submission: {
        ready: results.submission.ready,
        errors: results.submission.errors
      }
    };
  }

  /**
   * Derive final status
   */
  deriveFinalStatus(fullShipment) {
    // If already submitted/reviewed/approved/rejected, keep that status
    if ([ShipmentStatus.SUBMITTED, ShipmentStatus.UNDER_REVIEW, ShipmentStatus.APPROVED, ShipmentStatus.REJECTED].includes(fullShipment.status)) {
      return fullShipment.status;
    }

    // Check submission readiness
    if (fullShipment.submission.ready) {
      return ShipmentStatus.READY;
    }

    // Check if partially complete
    const hasCommodity = !!fullShipment.commodity.description;
    const hasEntity = !!fullShipment.entity.exporterId;
    const hasDestination = !!fullShipment.destination.country;
    const hasDocs = fullShipment.documents.uploaded.length > 0;

    if (hasCommodity || hasEntity || hasDestination || hasDocs) {
      return ShipmentStatus.PARTIAL;
    }

    return ShipmentStatus.DRAFT;
  }

  /**
   * Update shipment status in DB
   */
  async updateStatus(shipmentId, status) {
    await db.run(
      `UPDATE Shipments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [status, shipmentId]
    );
  }

  /**
   * Persist evaluation results
   */
  async persistEvaluation(shipmentId, fullShipment, finalStatus) {
    await db.run(`
      UPDATE Shipments SET 
        status = ?,
        commodity_data = ?,
        destination_data = ?,
        compliance_status = ?,
        compliance_flags = ?,
        submission_ready = ?,
        evaluation_errors = ?,
        last_evaluated_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      finalStatus,
      JSON.stringify(fullShipment.commodity),
      JSON.stringify(fullShipment.destination),
      fullShipment.compliance.status,
      JSON.stringify(fullShipment.compliance.flags),
      fullShipment.submission.ready ? 1 : 0,
      JSON.stringify(fullShipment.submission.errors),
      shipmentId
    ]);
  }
}

/**
 * Create new shipment
 */
async function createShipment(data = {}) {
  const id = `shp_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  
  await db.run(`
    INSERT INTO Shipments (
      id, status, commodity_data, destination_data, 
      exporter_id, category, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `, [
    id,
    ShipmentStatus.DRAFT,
    JSON.stringify(data.commodity || {}),
    JSON.stringify(data.destination || {}),
    data.exporterId || null,
    data.category || null
  ]);

  return { id, status: ShipmentStatus.DRAFT };
}

/**
 * Patch shipment (partial update)
 */
async function patchShipment(shipmentId, data) {
  const updates = [];
  const values = [];

  if (data.commodity) {
    const current = await db.get('SELECT commodity_data FROM Shipments WHERE id = ?', [shipmentId]);
    const currentCommodity = current?.commodity_data ? JSON.parse(current.commodity_data) : {};
    const merged = { ...currentCommodity, ...data.commodity };
    updates.push('commodity_data = ?');
    values.push(JSON.stringify(merged));
  }

  if (data.entity) {
    updates.push('exporter_id = ?');
    values.push(data.entity.exporterId);
  }

  if (data.destination) {
    const current = await db.get('SELECT destination_data FROM Shipments WHERE id = ?', [shipmentId]);
    const currentDest = current?.destination_data ? JSON.parse(current.destination_data) : {};
    const merged = { ...currentDest, ...data.destination };
    updates.push('destination_data = ?');
    values.push(JSON.stringify(merged));
  }

  if (data.category) {
    updates.push('category = ?');
    values.push(data.category);
  }

  if (updates.length === 0) {
    throw new Error('No valid fields to update');
  }

  updates.push('updated_at = datetime(\'now\')');
  values.push(shipmentId);

  await db.run(`UPDATE Shipments SET ${updates.join(', ')} WHERE id = ?`, values);

  // Return updated shipment
  const evaluator = new ShipmentEvaluator();
  return evaluator.evaluate(shipmentId);
}

/**
 * Submit shipment (with idempotency)
 */
async function submitShipment(shipmentId, submissionToken) {
  const evaluator = new ShipmentEvaluator();
  const shipment = await evaluator.evaluate(shipmentId);

  if (!shipment.submission.ready) {
    throw new Error(`Shipment not ready: ${shipment.submission.errors.join(', ')}`);
  }

  // Check idempotency
  const existing = await db.get(
    'SELECT id, sgd_number FROM Submissions WHERE shipment_id = ? AND token = ?',
    [shipmentId, submissionToken]
  );

  if (existing) {
    return {
      status: ShipmentStatus.SUBMITTED,
      sgdNumber: existing.sgd_number,
      idempotent: true
    };
  }

  // Create submission (mock NSW API)
  const sgdNumber = `SGD-${Date.now()}`;
  
  await db.run(`
    INSERT INTO Submissions (id, shipment_id, token, sgd_number, status, submitted_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `, [
    `sub_${Date.now()}`,
    shipmentId,
    submissionToken,
    sgdNumber,
    'SUBMITTED'
  ]);

  // Update shipment status
  await db.run(
    `UPDATE Shipments SET status = ?, submitted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
    [ShipmentStatus.SUBMITTED, shipmentId]
  );

  return {
    status: ShipmentStatus.SUBMITTED,
    sgdNumber,
    idempotent: false
  };
}

/**
 * Upload document
 */
async function uploadDocument(file, shipmentId) {
  const documentId = `doc_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const hash = crypto.createHash('sha256').update(file.buffer || 'mock').digest('hex');

  await db.run(`
    INSERT INTO ShipmentDocuments (id, shipment_id, doc_type, file_hash, status, created_at)
    VALUES (?, ?, ?, ?, 'UPLOADED', datetime('now'))
  `, [documentId, shipmentId, file.type || 'OTHER', hash]);

  return { document_id: documentId, hash };
}

/**
 * Attach document to shipment
 */
async function attachDocument(shipmentId, documentId, docType) {
  await db.run(
    `UPDATE ShipmentDocuments SET doc_type = ? WHERE id = ? AND shipment_id = ?`,
    [docType, documentId, shipmentId]
  );

  // Re-evaluate shipment
  const evaluator = new ShipmentEvaluator();
  return evaluator.evaluate(shipmentId);
}

/**
 * Get shipment
 */
async function getShipment(shipmentId) {
  const evaluator = new ShipmentEvaluator();
  return evaluator.evaluate(shipmentId);
}

module.exports = {
  ShipmentEvaluator,
  ShipmentStatus,
  createShipment,
  patchShipment,
  submitShipment,
  uploadDocument,
  attachDocument,
  getShipment
};

// CLI test
if (require.main === module) {
  console.log('Shipment Evaluation Service loaded');
  console.log('Usage:');
  console.log('  createShipment({ commodity: {}, destination: {} })');
  console.log('  patchShipment(id, { commodity: {} })');
  console.log('  submitShipment(id, token)');
  console.log('  evaluate(shipmentId)');
}