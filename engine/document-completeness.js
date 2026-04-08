/**
 * Culbridge Document Completeness Engine
 * 
 * CRITICAL INFRASTRUCTURE - Ensures nothing required is missing or invalid
 * 
 * Core responsibility:
 * - Determine required documents based on product + destination
 * - Verify all required documents are present and valid
 * - Block pipeline if anything is missing
 */

const { db } = require('../utils/db');

class DocumentCompletenessEngine {
  
  /**
   * Get required documents for a shipment
   * Based on product type, destination, and commodity regulations
   * 
   * @param {string} product - Product/category
   * @param {string} destination - Destination country
   * @returns {Array} - Required document types
   */
  getRequiredDocuments(product, destination) {
    const productLower = (product || '').toLowerCase();
    const destUpper = (destination || '').toUpperCase();
    
    // Base documents required for all exports
    const baseDocs = [
      { type: 'invoice', required: true, description: 'Commercial Invoice' },
      { type: 'packing_list', required: true, description: 'Packing List' },
      { type: 'certificate_of_origin', required: true, description: 'Certificate of Origin' }
    ];
    
    // Product-specific requirements
    const productDocs = {
      'cocoa': [
        { type: 'phytosanitary', required: true, description: 'NAQS Phytosanitary Certificate' },
        { type: 'lab_report', required: true, description: 'Laboratory Test Report (Aflatoxin)' },
        { type: 'nafdac', required: true, description: 'NAFDAC Certificate' },
        { type: 'soncap', required: false, description: 'SONCAP Certificate (if required)' }
      ],
      'sesame': [
        { type: 'phytosanitary', required: true, description: 'NAQS Phytosanitary Certificate' },
        { type: 'lab_report', required: true, description: 'Laboratory Test Report' },
        { type: 'nafdac', required: true, description: 'NAFDAC Certificate' }
      ],
      'cashew': [
        { type: 'phytosanitary', required: true, description: 'NAQS Phytosanitary Certificate' },
        { type: 'lab_report', required: true, description: 'Laboratory Test Report' },
        { type: 'nafdac', required: true, description: 'NAFDAC Certificate' }
      ],
      'ginger': [
        { type: 'phytosanitary', required: true, description: 'NAQS Phytosanitary Certificate' },
        { type: 'lab_report', required: true, description: 'Laboratory Test Report' },
        { type: 'nafdac', required: true, description: 'NAFDAC Certificate' }
      ],
      'groundnuts': [
        { type: 'phytosanitary', required: true, description: 'NAQS Phytosanitary Certificate' },
        { type: 'lab_report', required: true, description: 'Laboratory Test Report (Aflatoxin)' },
        { type: 'nafdac', required: true, description: 'NAFDAC Certificate' }
      ]
    };
    
    // Destination-specific additions
    const destinationDocs = {
      'EU': [
        // EU requires additional documentation
      ],
      'NL': [
        { type: 'eudr', required: false, description: 'EUDR Compliance Declaration' }
      ],
      'DE': [
        { type: 'eudr', required: false, description: 'EUDR Compliance Declaration' }
      ]
    };
    
    // Combine requirements
    let requiredDocs = [...baseDocs];
    
    // Add product-specific docs
    const productSpecific = productDocs[productLower] || [];
    requiredDocs = [...requiredDocs, ...productSpecific];
    
    // Add destination-specific docs
    const destSpecific = destinationDocs[destUpper] || [];
    requiredDocs = [...requiredDocs, ...destSpecific];
    
    return requiredDocs;
  }
  
  /**
   * Check document completeness for a shipment
   * 
   * @param {string} shipmentId - Shipment ID
   * @returns {Object} - Completeness check result
   */
  async checkCompleteness(shipmentId) {
    // Get shipment details
    const shipment = await db.get(
      'SELECT product, destination, category FROM Shipments WHERE id = ?',
      [shipmentId]
    );
    
    if (!shipment) {
      throw new Error(`Shipment ${shipmentId} not found`);
    }
    
    const product = shipment.product || shipment.category;
    const destination = shipment.destination;
    
    // Get required documents
    const requiredDocs = this.getRequiredDocuments(product, destination);
    
    // Get uploaded documents
    const uploadedDocs = await db.all(
      `SELECT doc_type, status, file_hash, expiry_date, verified_at 
       FROM ShipmentDocuments 
       WHERE shipment_id = ?`,
      [shipmentId]
    );
    
    // Check what's missing
    const uploadedTypes = uploadedDocs.map(d => d.doc_type);
    const missingDocs = requiredDocs.filter(req => 
      req.required && !uploadedTypes.includes(req.type)
    );
    
    // Check what's invalid
    const invalidDocs = uploadedDocs.filter(doc => 
      doc.status === 'rejected' || 
      (doc.expiry_date && new Date(doc.expiry_date) < new Date())
    );
    
    // Check what's verified
    const verifiedDocs = uploadedDocs.filter(doc => doc.status === 'verified');
    
    // Determine completeness
    const isComplete = missingDocs.length === 0 && invalidDocs.length === 0;
    
    return {
      shipment_id: shipmentId,
      is_complete: isComplete,
      required_count: requiredDocs.filter(r => r.required).length,
      uploaded_count: uploadedDocs.length,
      verified_count: verifiedDocs.length,
      missing: missingDocs.map(d => ({
        type: d.type,
        description: d.description,
        required: d.required
      })),
      invalid: invalidDocs.map(d => ({
        type: d.doc_type,
        reason: d.status === 'rejected' ? 'Rejected' : 'Expired'
      })),
      verified: verifiedDocs.map(d => d.doc_type),
      all_verified: verifiedDocs.length === requiredDocs.filter(r => r.required).length
    };
  }
  
  /**
   * Validate a specific document
   * 
   * @param {string} shipmentId - Shipment ID
   * @param {string} docType - Document type
   * @returns {Object} - Validation result
   */
  async validateDocument(shipmentId, docType) {
    const doc = await db.get(
      `SELECT * FROM ShipmentDocuments 
       WHERE shipment_id = ? AND doc_type = ?`,
      [shipmentId, docType]
    );
    
    if (!doc) {
      return {
        valid: false,
        reason: 'Document not uploaded'
      };
    }
    
    // Check expiry
    if (doc.expiry_date && new Date(doc.expiry_date) < new Date()) {
      return {
        valid: false,
        reason: 'Document expired',
        expired_at: doc.expiry_date
      };
    }
    
    // Check status
    if (doc.status === 'rejected') {
      return {
        valid: false,
        reason: 'Document was rejected',
        rejection_reason: doc.rejection_reason
      };
    }
    
    // Check file hash exists
    if (!doc.file_hash) {
      return {
        valid: false,
        reason: 'Document has no file hash'
      };
    }
    
    return {
      valid: true,
      verified_at: doc.verified_at,
      file_hash: doc.file_hash
    };
  }
  
  /**
   * Block document validation - returns blocking errors
   * Used by invariant engine
   * 
   * @param {string} shipmentId - Shipment ID
   * @returns {Object} - Block check result
   */
  async checkBlocks(shipmentId) {
    const result = await this.checkCompleteness(shipmentId);
    
    const blocks = [];
    
    if (result.missing.length > 0) {
      blocks.push({
        type: 'MISSING_DOCUMENTS',
        details: result.missing.map(d => d.type),
        message: `Missing required documents: ${result.missing.map(d => d.description).join(', ')}`
      });
    }
    
    if (result.invalid.length > 0) {
      blocks.push({
        type: 'INVALID_DOCUMENTS',
        details: result.invalid.map(d => d.type),
        message: `Invalid documents: ${result.invalid.map(d => d.type).join(', ')}`
      });
    }
    
    return {
      blocked: blocks.length > 0,
      blocks
    };
  }
}

/**
 * API Handlers
 */

// POST /v1/shipments/:shipment_id/documents/check
// Check document completeness
async function checkDocuments(req, res) {
  try {
    const { shipment_id } = req.params;
    const engine = new DocumentCompletenessEngine();
    
    const result = await engine.checkCompleteness(shipment_id);
    
    res.json(result);
  } catch (error) {
    console.error('Document completeness check error:', error);
    res.status(500).json({ error: error.message });
  }
}

// POST /v1/shipments/:shipment_id/documents/validate
// Validate specific document
async function validateDocument(req, res) {
  try {
    const { shipment_id } = req.params;
    const { doc_type } = req.body;
    
    const engine = new DocumentCompletenessEngine();
    const result = await engine.validateDocument(shipment_id, doc_type);
    
    res.json({
      shipment_id,
      doc_type,
      ...result
    });
  } catch (error) {
    console.error('Document validation error:', error);
    res.status(500).json({ error: error.message });
  }
}

// GET /v1/shipments/:shipment_id/documents/required
// Get required documents for shipment
async function getRequiredDocuments(req, res) {
  try {
    const { shipment_id } = req.params;
    
    const db = require('../utils/db');
    const shipment = await db.get(
      'SELECT product, destination, category FROM Shipments WHERE id = ?',
      [shipment_id]
    );
    
    if (!shipment) {
      return res.status(404).json({ error: 'Shipment not found' });
    }
    
    const engine = new DocumentCompletenessEngine();
    const required = engine.getRequiredDocuments(
      shipment.product || shipment.category,
      shipment.destination
    );
    
    // Get uploaded status for each
    const uploaded = await db.all(
      `SELECT doc_type, status FROM ShipmentDocuments WHERE shipment_id = ?`,
      [shipment_id]
    );
    
    const uploadedMap = {};
    uploaded.forEach(d => uploadedMap[d.doc_type] = d.status);
    
    const documents = required.map(req => ({
      type: req.type,
      description: req.description,
      required: req.required,
      uploaded: uploadedMap[req.type] || 'missing',
      status: uploadedMap[req.type] || null
    }));
    
    res.json({
      shipment_id,
      documents,
      total_required: documents.filter(d => d.required).length,
      total_uploaded: documents.filter(d => d.uploaded !== 'missing').length
    });
  } catch (error) {
    console.error('Get required documents error:', error);
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  DocumentCompletenessEngine,
  checkDocuments,
  validateDocument,
  getRequiredDocuments
};

if (require.main === module) {
  console.log('Document Completeness Engine loaded');
  const engine = new DocumentCompletenessEngine();
  console.log('Required docs for cocoa to NL:', JSON.stringify(engine.getRequiredDocuments('cocoa', 'NL'), null, 2));
}