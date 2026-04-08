/**
 * Culbridge Shipment API Endpoints
 * 
 * RESTful API for shipment operations:
 * - POST /shipments - Create shipment
 * - GET /shipments/:id - Get shipment (full object)
 * - PATCH /shipments/:id - Partial update
 * - POST /shipments/:id/evaluate - Evaluate (recompute everything)
 * - POST /shipments/:id/submit - Submit (idempotent)
 * - POST /shipments/:id/documents - Attach document
 */

const express = require('express');
const { 
  createShipment, 
  patchShipment, 
  submitShipment, 
  uploadDocument, 
  attachDocument,
  getShipment,
  ShipmentEvaluator,
  ShipmentStatus 
} = require('./services/shipment-evaluation');

const app = express();
app.use(express.json());

// ============================================
// API ENDPOINTS
// ============================================

/**
 * POST /shipments
 * Create new shipment
 */
app.post('/shipments', async (req, res) => {
  try {
    const shipment = await createShipment(req.body);
    res.status(201).json(shipment);
  } catch (error) {
    console.error('Create shipment error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /shipments/:id
 * Get full shipment object (canonical)
 */
app.get('/shipments/:id', async (req, res) => {
  try {
    const shipment = await getShipment(req.params.id);
    
    if (!shipment) {
      return res.status(404).json({ error: 'Shipment not found' });
    }
    
    res.json(shipment);
  } catch (error) {
    console.error('Get shipment error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /shipments/:id
 * Partial update (accepts any valid fields)
 */
app.patch('/shipments/:id', async (req, res) => {
  try {
    // Validate: accept partial updates
    const allowedFields = ['commodity', 'entity', 'destination', 'category'];
    const hasValidField = Object.keys(req.body).some(key => allowedFields.includes(key));
    
    if (!hasValidField) {
      return res.status(400).json({ 
        error: 'No valid fields to update',
        allowedFields 
      });
    }
    
    const shipment = await patchShipment(req.params.id, req.body);
    res.json(shipment);
  } catch (error) {
    console.error('Patch shipment error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /shipments/:id/evaluate
 * Recompute everything (critical endpoint)
 */
app.post('/shipments/:id/evaluate', async (req, res) => {
  try {
    const evaluator = new ShipmentEvaluator();
    const shipment = await evaluator.evaluate(req.params.id);
    res.json(shipment);
  } catch (error) {
    console.error('Evaluate error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /shipments/:id/submit
 * Submit shipment (idempotent)
 */
app.post('/shipments/:id/submit', async (req, res) => {
  try {
    const { submissionToken } = req.body;
    
    if (!submissionToken) {
      return res.status(400).json({ 
        error: 'submissionToken required for idempotency' 
      });
    }
    
    const result = await submitShipment(req.params.id, submissionToken);
    
    res.json({
      status: result.status,
      sgdNumber: result.sgdNumber,
      idempotent: result.idempotent
    });
  } catch (error) {
    console.error('Submit error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /documents/upload
 * Upload document file
 */
app.post('/documents/upload', async (req, res) => {
  try {
// Real multer upload (install multer if needed)
    const multer = require('multer');
    const upload = multer({ dest: 'uploads/' });
    
    upload.single('file')(req, res, async (err) => {
      if (err) return res.status(400).json({ error: 'Upload failed' });
      
      const file = req.file;
      if (!file) return res.status(400).json({ error: 'No file uploaded' });
      
      const realFile = {
        buffer: require('fs').readFileSync(file.path),
        filename: file.originalname,
        mimetype: file.mimetype
      };
      
      const shipmentId = req.body.shipmentId;
      const result = await uploadDocument(realFile, shipmentId);
      res.json(result);
      
      // Cleanup temp file
      require('fs').unlinkSync(file.path);
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /shipments/:id/documents
 * Attach document to shipment
 */
app.post('/shipments/:id/documents', async (req, res) => {
  try {
    const { document_id, type } = req.body;
    
    if (!document_id || !type) {
      return res.status(400).json({ 
        error: 'document_id and type required' 
      });
    }
    
    const shipment = await attachDocument(req.params.id, document_id, type);
    res.json(shipment);
  } catch (error) {
    console.error('Attach document error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /shipments
 * List shipments (with filters)
 */
app.get('/shipments', async (req, res) => {
  try {
    const { status, exporter_id, limit = 50 } = req.query;
    const db = require('./utils/db');
    
    let query = 'SELECT id, status, category, compliance_status, submission_ready, created_at FROM Shipments';
    const params = [];
    const conditions = [];
    
    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }
    
    if (exporter_id) {
      conditions.push('exporter_id = ?');
      params.push(exporter_id);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' ORDER BY updated_at DESC LIMIT ?';
    params.push(parseInt(limit));
    
    const shipments = await db.all(query, params);
    res.json({ count: shipments.length, shipments });
  } catch (error) {
    console.error('List shipments error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// START SERVER
// ============================================

const PORT = process.env.SHIPMENT_PORT || 3002;
app.listen(PORT, () => {
  console.log(`Culbridge Shipment API running on http://localhost:${PORT}`);
  console.log('Endpoints:');
  console.log('  POST   /shipments - Create shipment');
  console.log('  GET    /shipments/:id - Get shipment');
  console.log('  PATCH  /shipments/:id - Update shipment');
  console.log('  POST   /shipments/:id/evaluate - Evaluate');
  console.log('  POST   /shipments/:id/submit - Submit');
  console.log('  POST   /documents/upload - Upload document');
  console.log('  POST   /shipments/:id/documents - Attach');
  console.log('  GET    /shipments - List');
});

module.exports = app;