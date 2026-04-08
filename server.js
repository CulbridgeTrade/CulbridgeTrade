const express = require('express');
// const LLMServices = require('./llm-integration');
const cors = require('cors');
const bodyParser = require('body-parser');
const RuleEngine = require('./engine/ruleEngine');
const { initDB } = require('./utils/db');
const traceability = require('./utils/traceability');
const farmosIntegration = require('./utils/farmos-integration');
const hyperledgerIntegration = require('./utils/hyperledger-integration');
const odooWmsIntegration = require('./utils/odoo-wms-integration');
const opentmsIntegration = require('./utils/opentms-integration');
const openlmisIntegration = require('./utils/openlmis-integration');
const xgboostIntegration = require('./utils/xgboost-integration');
const decisionEngine = require('./utils/decision-engine');
const deterministicEngine = require('./engine/deterministic-engine');
const access2Markets = require('./services/access2markets');
const tracesParser = require('./services/traces-parser');
const rasffService = require('./services/rasff-ingestion');
const rasffScraper = require('./services/rasff-scraper');
const dovuIntegration = require('./services/dovu-integration');
const ushahidiIntegration = require('./services/ushahidi-integration');
const eudrCompliance = require('./services/eudr-compliance');
const accuracyMonitor = require('./services/accuracy-monitor');
const fixOptimizer = require('./services/fix-optimizer');
const humanLayer = require('./services/human-layer');
const adversarialDetector = require('./services/adversarial-detector');
const nvwaSimulator = require('./engine/nvwa-simulator');
const orchestration = require('./services/application-orchestration');
const labNetwork = require('./services/lab-network');
const rasffMonitor = require('./services/rasff-monitor');
const riskScoring = require('./services/risk-scoring');
const regulatoryIntelligence = require('./services/regulatory-intelligence');
const agencyIntegration = require('./services/agency-integration');
const path = require('path');

// PDF Generator Service (CRITICAL INFRASTRUCTURE)
const { PDFGeneratorService } = require('./services/pdf-generator');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static('public')); // for future static files

// Init DB on startup
initDB();

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// GET /labs?tier=1
app.get('/labs', async (req, res) => {
  try {
    const { tier } = req.query;
    const where = tier ? 'WHERE tier = ?' : '';
    const labs = await require('./utils/db').all(`SELECT * FROM Labs ${where}`, tier ? [tier] : []);
    res.json(labs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /shipments/:id/evaluations
app.get('/shipments/:id/evaluations', async (req, res) => {
  try {
    const { id } = req.params;
    const evals = await require('./utils/db').all(
      'SELECT * FROM ShipmentEvaluations WHERE shipment_id = ? ORDER BY evaluated_at DESC', [id]
    );
    const logs = await require('./utils/db').all(
      'SELECT * FROM RuleLogs WHERE shipment_id = ? ORDER BY timestamp DESC', [id]
    );
    res.json({ evaluations: evals, rule_logs: logs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /llm/extract - Document extraction service
app.post('/llm/extract', async (req, res) => {
  try {
    const { document_type, raw_content } = req.body;
    const result = await LLMServices.documentExtraction(document_type, raw_content);
    if (!result) {
      return res.status(500).json({ error: 'Extraction failed' });
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /llm/conflict - Conflict analysis
app.post('/llm/conflict', async (req, res) => {
  try {
    const { extracted_documents } = req.body;
    const result = await LLMServices.conflictAnalysis(extracted_documents);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /llm/explain - User explanation
app.post('/llm/explain', async (req, res) => {
  try {
    const { shipment_id, evaluation_snapshot } = req.body;
    const result = await LLMServices.userExplanation(shipment_id, evaluation_snapshot);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /shipments/:id/documents/lab_report (upload simulation)
app.post('/shipments/:id/documents/lab_report', async (req, res) => {
  try {
    const { id } = req.params;
    const { lab_id, file_hash, expiry_date, status = 'verified' } = req.body;
    
    // Insert document
    await require('./utils/db').run(
      'INSERT OR REPLACE INTO ShipmentDocuments (shipment_id, doc_type, lab_id, file_hash, status, expiry_date) VALUES (?, ?, ?, ?, ?, ?)',
      [id, 'lab_report', lab_id, file_hash, status, expiry_date]
    );
    res.json({ success: true, message: 'Lab report uploaded' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /shipments/:id/evaluate - Core deterministic endpoint
app.post('/shipments/:id/evaluate', async (req, res) => {
  try {
    const { id } = req.params;
    const engine = new RuleEngine();
    const result = await engine.evaluate(id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create sample shipment (for testing)
app.post('/shipments', async (req, res) => {
  const shipment = req.body;
  try {
    await require('./utils/db').run(
      'INSERT OR IGNORE INTO Shipments (id, exporter_id, product, category, destination, batch_number, production_date) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [shipment.id, shipment.exporter_id, shipment.product, shipment.category, shipment.destination, shipment.batch_number, shipment.production_date]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// PDF Generation Endpoints (CRITICAL INFRASTRUCTURE)
// ============================================

// POST /shipments/:id/generate-pdf - Generate PDF for shipment
app.post('/shipments/:id/generate-pdf', async (req, res) => {
  try {
    const { id } = req.params;
    const pdfService = new PDFGeneratorService();
    
    // Get shipment data and aggregated results
    const db = require('./utils/db');
    const shipment = await db.get('SELECT * FROM Shipments WHERE id = ?', [id]);
    
    if (!shipment) {
      return res.status(404).json({ error: 'Shipment not found' });
    }
    
    // Get aggregated results
    const evaluations = await db.all(
      'SELECT * FROM ShipmentEvaluations WHERE shipment_id = ? ORDER BY evaluated_at DESC',
      [id]
    );
    
    // Get digital signature if exists
    const signature = await db.get(
      'SELECT * FROM DigitalSignatureResults WHERE shipment_id = ? ORDER BY id DESC LIMIT 1',
      [id]
    );
    
    // Build input for PDF generation
    const input = {
      shipment_id: id,
      aggregated_results: {
        metadata: {
          product: shipment.product,
          destination: shipment.destination,
          batch_number: shipment.batch_number,
          exporter_name: shipment.exporter_id,
          hs_code: shipment.hs_code
        },
        aggregated_results: {
          hs_code_validator: { hs_code: shipment.hs_code, status: 'pass' },
          document_vault: { documents: [], status: 'pass' },
          entity_sync: { aeo_status: 'ACTIVE', tier: 1, status: 'pass' },
          compliance_engine: { status: 'pass' },
          fee_calculator: { total_estimated_fee_naira: 45000, certificate_breakdown: [] },
          digital_signature: signature || null
        },
        deterministic_flags: {
          verified_count: 6,
          all_verified: true
        }
      },
      digital_signature: signature,
      timestamp: new Date().toISOString()
    };
    
    // Generate PDF
    const result = await pdfService.generatePDF(input);
    
    res.json({
      success: true,
      pdf_path: result.pdf_path,
      pdf_hash: result.pdf_hash,
      generated_at: result.generated_at
    });
  } catch (error) {
    console.error('PDF generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /shipments/:id/pdf - Get PDF for shipment
app.get('/shipments/:id/pdf', async (req, res) => {
  try {
    const { id } = req.params;
    const pdfService = new PDFGeneratorService();
    
    // Get user from auth (simplified for now)
    const user = { role: 'admin' }; // In production, get from auth middleware
    
    const result = await pdfService.getPDF(id, user);
    
    if (result.error) {
      return res.status(result.code).json({ error: result.error });
    }
    
    // Send PDF file
    const fs = require('fs');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${id}.pdf"`);
    res.sendFile(result.pdf_path);
  } catch (error) {
    console.error('PDF retrieval error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /shipments/:id/pdf/verify - Verify PDF integrity
app.get('/shipments/:id/pdf/verify', async (req, res) => {
  try {
    const { id } = req.params;
    const pdfService = new PDFGeneratorService();
    
    const result = await pdfService.verifyIntegrity(id);
    
    res.json(result);
  } catch (error) {
    console.error('PDF verification error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /shipments/:id/pdf/verify - Verify PDF integrity
app.get('/shipments/:id/pdf/verify', async (req, res) => {
  try {
    const { id } = req.params;
    const pdfService = new PDFGeneratorService();
    
    const result = await pdfService.verifyIntegrity(id);
    
    res.json(result);
  } catch (error) {
    console.error('PDF verification error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// PASS_HANDLER Endpoints
// ============================================

// POST /v1/shipments/:shipment_id/pass - Record real-world outcome
app.post('/v1/shipments/:shipment_id/pass', async (req, res) => {
  try {
    const { shipment_id } = req.params;
    const { PassHandlerService } = require('./services/pass-handler');
    const service = new PassHandlerService();
    
    const result = await service.recordPassOutcome({
      shipment_id,
      ...req.body
    });
    
    res.json(result);
  } catch (error) {
    console.error('Pass outcome error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /v1/shipments/:shipment_id/proven - Get proven patterns
app.get('/v1/shipments/:shipment_id/proven', async (req, res) => {
  try {
    const { shipment_id } = req.params;
    const { PassHandlerService } = require('./services/pass-handler');
    const { get } = require('./utils/db');
    const service = new PassHandlerService();
    
    const shipment = await get('SELECT * FROM Shipments WHERE id = ?', [shipment_id]);
    if (!shipment) {
      return res.status(404).json({ error: 'Shipment not found' });
    }
    
    const route = service.computeRoute(shipment);
    const templates = await service.getProvenTemplates(route, shipment.product);
    
    res.json({
      shipment_id,
      route,
      templates: templates.map(t => ({
        route: t.route,
        product_id: t.product_id,
        certificates: JSON.parse(t.certificates),
        hs_code: t.hs_code,
        destination_country: t.destination_country,
        proven_count: t.proven_count
      }))
    });
  } catch (error) {
    console.error('Get proven patterns error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /v1/confidence-scores - Analytics endpoint
app.get('/v1/confidence-scores', async (req, res) => {
  try {
    const { route, product_id } = req.query;
    const { PassHandlerService } = require('./services/pass-handler');
    const service = new PassHandlerService();
    
    const scores = await service.getConfidenceScores(route, product_id);
    
    res.json({
      count: scores.length,
      scores: scores.map(s => ({
        route: s.route,
        product_id: s.product_id,
        confidence_score: s.confidence_score,
        proven_shipments: s.proven_shipments,
        total_shipments: s.total_shipments
      }))
    });
  } catch (error) {
    console.error('Get confidence scores error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /v1/accuracy-summary - Prediction accuracy
app.get('/v1/accuracy-summary', async (req, res) => {
  try {
    const { PassHandlerService } = require('./services/pass-handler');
    const service = new PassHandlerService();
    
    const summary = await service.getAccuracySummary();
    
    res.json({
      summary: summary.map(s => ({
        route: s.route,
        product_id: s.product_id,
        total_evaluated: s.total_evaluated,
        correct_predictions: s.correct_predictions,
        accuracy_rate: s.accuracy_rate
      }))
    });
  } catch (error) {
    console.error('Get accuracy summary error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// FEEDBACK LOOP ENGINE ENDPOINTS
// ============================================

// POST /feedback - Submit feedback on decision accuracy
app.post('/feedback', async (req, res) => {
  try {
    const { get, run } = require('./utils/db');
    const { v4: uuidv4 } = require('uuid');
    
    const { shipment_id, event_type, value, metadata } = req.body;
    
    // Validate required fields
    if (!shipment_id || !event_type || !value) {
      return res.status(400).json({ error: 'shipment_id, event_type, and value are required' });
    }
    
    // Validate event_type enum
    const validEventTypes = ['DECISION_ACCURACY', 'OUTCOME', 'FIX_RESULT'];
    if (!validEventTypes.includes(event_type)) {
      return res.status(400).json({ error: `event_type must be one of: ${validEventTypes.join(', ')}` });
    }
    
    // Validate value enum
    const validValues = ['TRUE_POSITIVE', 'FALSE_POSITIVE', 'FALSE_NEGATIVE', 'CLEARED', 'DELAYED', 'REJECTED', 'FIX_SUCCESS', 'FIX_FAILED'];
    if (!validValues.includes(value)) {
      return res.status(400).json({ error: `value must be one of: ${validValues.join(', ')}` });
    }
    
    // Check shipment exists
    const shipment = await get('SELECT id FROM shipments WHERE id = ?', [shipment_id]);
    if (!shipment) {
      return res.status(404).json({ error: 'Shipment not found' });
    }
    
    // Insert feedback event
    const id = uuidv4();
    await run(
      'INSERT INTO feedback_events (id, shipment_id, event_type, value, metadata, created_at) VALUES (?, ?, ?, ?, ?, datetime("now"))',
      [id, shipment_id, event_type, value, JSON.stringify(metadata || {})]
    );
    
    res.json({ success: true, id, message: 'Feedback recorded successfully' });
  } catch (error) {
    console.error('Feedback error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /shipments/:id/outcome - Submit shipment outcome
app.post('/shipments/:id/outcome', async (req, res) => {
  try {
    const { get, run } = require('./utils/db');
    
    const { id } = req.params;
    const { value } = req.body;
    
    // Validate value enum
    const validValues = ['CLEARED', 'DELAYED', 'REJECTED'];
    if (!value || !validValues.includes(value)) {
      return res.status(400).json({ error: `value must be one of: ${validValues.join(', ')}` });
    }
    
    // Check shipment exists
    const shipment = await get('SELECT * FROM shipments WHERE id = ?', [id]);
    if (!shipment) {
      return res.status(404).json({ error: 'Shipment not found' });
    }
    
    // Update shipment final_outcome
    await run('UPDATE shipments SET final_outcome = ?, updated_at = datetime("now") WHERE id = ?', [value, id]);
    
    // Also record as feedback event for analytics
    const { v4: uuidv4 } = require('uuid');
    await run(
      'INSERT INTO feedback_events (id, shipment_id, event_type, value, metadata, created_at) VALUES (?, ?, ?, ?, ?, datetime("now"))',
      [uuidv4(), id, 'OUTCOME', value, '{}']
    );
    
    res.json({ success: true, message: 'Outcome recorded successfully', final_outcome: value });
  } catch (error) {
    console.error('Outcome error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /analytics/rules - Get rule accuracy analytics
app.get('/analytics/rules', async (req, res) => {
  try {
    const { get, all } = require('./utils/db');
    
    // Get all feedback events grouped by rule/metadata
    const feedbackStats = await all(`
      SELECT 
        metadata->>'$.rule' as rule,
        event_type,
        value,
        COUNT(*) as count
      FROM feedback_events
      WHERE metadata IS NOT NULL
      GROUP BY metadata->>'$.rule', event_type, value
    `);
    
    // Also get overall stats
    const overallStats = await all(`
      SELECT 
        event_type,
        value,
        COUNT(*) as count
      FROM feedback_events
      GROUP BY event_type, value
    `);
    
    // Calculate accuracy per rule
    const ruleAnalytics = {};
    
    for (const stat of feedbackStats) {
      const rule = stat.rule || 'unknown';
      if (!ruleAnalytics[rule]) {
        ruleAnalytics[rule] = { triggered: 0, true_positive: 0, false_positive: 0, false_negative: 0, accuracy: 0 };
      }
      
      ruleAnalytics[rule].triggered += stat.count;
      
      if (stat.value === 'TRUE_POSITIVE') ruleAnalytics[rule].true_positive = stat.count;
      if (stat.value === 'FALSE_POSITIVE') ruleAnalytics[rule].false_positive = stat.count;
      if (stat.value === 'FALSE_NEGATIVE') ruleAnalytics[rule].false_negative = stat.count;
    }
    
    // Calculate accuracy for each rule
    for (const rule in ruleAnalytics) {
      const { true_positive, false_positive } = ruleAnalytics[rule];
      const total = true_positive + false_positive;
      ruleAnalytics[rule].accuracy = total > 0 ? true_positive / total : 0;
    }
    
    // Get false negatives from shipments where compliance was OK but final_outcome is REJECTED
    const falseNegatives = await get(`
      SELECT COUNT(*) as count FROM shipments s
      WHERE s.final_outcome = 'REJECTED'
      AND EXISTS (SELECT 1 FROM compliance_flags cf WHERE cf.shipment_id = s.id AND cf.severity = 'INFO')
    `);
    
    // Get fix success/failure stats
    const fixStats = await all(`
      SELECT value, COUNT(*) as count
      FROM feedback_events
      WHERE event_type = 'FIX_RESULT'
      GROUP BY value
    `);
    
    const fixResult = { fix_success: 0, fix_failed: 0 };
    for (const stat of fixStats) {
      if (stat.value === 'FIX_SUCCESS') fixResult.fix_success = stat.count;
      if (stat.value === 'FIX_FAILED') fixResult.fix_failed = stat.count;
    }
    
    // Get total feedback count for density check
    const totalFeedback = await get('SELECT COUNT(*) as count FROM feedback_events');
    const feedbackDensity = totalFeedback.count < 20 ? 'LOW' : totalFeedback.count < 50 ? 'MEDIUM' : 'HIGH';
    
    res.json({
      rules: ruleAnalytics,
      false_negatives: falseNegatives.count || 0,
      fix_result: fixResult,
      feedback_density: feedbackDensity,
      total_feedback: totalFeedback.count,
      overall: overallStats
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Culbridge Rule Engine running on http://localhost:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
  console.log(`Test eval: POST http://localhost:${PORT}/shipments/CB-001/evaluate`);
});

// ============================================
// INAtrace API Endpoints (EUDR Compliance)
// ============================================

// POST /traceability - Create new traceability record
app.post('/traceability', async (req, res) => {
  try {
    const record = await traceability.createTraceabilityRecord(req.body);
    res.json(record);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /traceability/:id - Get traceability record
app.get('/traceability/:id', async (req, res) => {
  try {
    const record = await traceability.getTraceabilityRecord(req.params.id);
    if (!record) {
      return res.status(404).json({ error: 'Traceability record not found' });
    }
    res.json(record);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /traceability/:traceId/fields - Add field mappings
app.post('/traceability/:traceId/fields', async (req, res) => {
  try {
    const { field_mappings } = req.body;
    const record = await traceability.addFieldMappings(req.params.traceId, field_mappings);
    res.json(record);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /traceability/:traceId/certifications - Add certification
app.post('/traceability/:traceId/certifications', async (req, res) => {
  try {
    const record = await traceability.addCertification(req.params.traceId, req.body);
    res.json(record);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /traceability/:traceId/assess - Perform EUDR risk assessment
app.post('/traceability/:traceId/assess', async (req, res) => {
  try {
    const assessment = await traceability.performRiskAssessment(req.params.traceId);
    res.json(assessment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /traceability/:traceId/report - Generate EUDR compliance report
app.get('/traceability/:traceId/report', async (req, res) => {
  try {
    const report = await traceability.generateComplianceReport(req.params.traceId);
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /traceability/:traceId/audit - Get audit trail
app.get('/traceability/:traceId/audit', async (req, res) => {
  try {
    const audit = await traceability.getAuditTrail(req.params.traceId);
    res.json(audit);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /traceability - List all traceability records
app.get('/traceability', async (req, res) => {
  try {
    const records = await traceability.getAllTraceabilityRecords();
    res.json(records);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /traceability-audit-logs - Get global audit logs
app.get('/traceability-audit-logs', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const logs = traceability.getAuditLogs(limit);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// farmOS Integration Endpoints
// ============================================

// POST /farmos/connect - Connect to farmOS server
app.post('/farmos/connect', async (req, res) => {
  try {
    const { serverUrl, username, password } = req.body;
    
    if (serverUrl || username || password) {
      farmosIntegration.configure({ serverUrl, username, password });
    }
    
    const connection = await farmosIntegration.connect();
    res.json({ 
      connected: farmosIntegration.isConnected(),
      serverUrl: farmosIntegration.getConfig().serverUrl
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /farmos/status - Get farmOS connection status
app.get('/farmos/status', (req, res) => {
  res.json(farmosIntegration.getConfig());
});

// GET /farmos/farms - Get all farms
app.get('/farmos/farms', async (req, res) => {
  try {
    const farms = await farmosIntegration.getFarms();
    res.json(farms);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /farmos/farms/:farmId/fields - Get fields for a farm
app.get('/farmos/farms/:farmId/fields', async (req, res) => {
  try {
    const fields = await farmosIntegration.getFields(req.params.farmId);
    res.json(fields);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /farmos/farms/:farmId/assets - Get assets for a farm
app.get('/farmos/farms/:farmId/assets', async (req, res) => {
  try {
    const { type } = req.query;
    const assets = await farmosIntegration.getAssets(req.params.farmId, type);
    res.json(assets);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /farmos/farms/:farmId/logs - Get logs for a farm
app.get('/farmos/farms/:farmId/logs', async (req, res) => {
  try {
    const { type } = req.query;
    const logs = await farmosIntegration.getLogs(req.params.farmId, type);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /farmos/fields/:fieldId/history - Get land management history
app.get('/farmos/fields/:fieldId/history', async (req, res) => {
  try {
    const history = await farmosIntegration.getLandManagementHistory(req.params.fieldId);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /farmos/sync - Sync farm data to traceability
app.post('/farmos/sync', async (req, res) => {
  try {
    const { farmId } = req.body;
    const results = await farmosIntegration.syncFarmData(farmId);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /farmos/convert/field/:fieldId - Convert farmOS field to traceability format
app.get('/farmos/convert/field/:fieldId', async (req, res) => {
  try {
    const fields = await farmosIntegration.getFields();
    const field = fields.find(f => f.id === req.params.fieldId);
    
    if (!field) {
      return res.status(404).json({ error: 'Field not found' });
    }
    
    const converted = farmosIntegration.convertFieldToTraceability(field);
    res.json(converted);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Hyperledger Integration Endpoints
// ============================================

// POST /hyperledger/connect - Connect to Hyperledger Fabric network
app.post('/hyperledger/connect', async (req, res) => {
  try {
    const { connectionProfile, channelName, chaincodeName } = req.body;
    
    if (connectionProfile || channelName || chaincodeName) {
      hyperledgerIntegration.configure({ connectionProfile, channelName, chaincodeName });
    }
    
    await hyperledgerIntegration.connectToNetwork();
    res.json(hyperledgerIntegration.getStatus());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /hyperledger/status - Get connection status
app.get('/hyperledger/status', (req, res) => {
  res.json(hyperledgerIntegration.getStatus());
});

// POST /hyperledger/shipments - Create shipment record on ledger
app.post('/hyperledger/shipments', async (req, res) => {
  try {
    const result = await hyperledgerIntegration.createShipmentRecord(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /hyperledger/shipments/:recordId - Get shipment record
app.get('/hyperledger/shipments/:recordId', async (req, res) => {
  try {
    const record = await hyperledgerIntegration.getShipmentRecord(req.params.recordId);
    if (!record) {
      return res.status(404).json({ error: 'Shipment not found' });
    }
    res.json(record);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /hyperledger/shipments/:recordId/status - Update shipment status
app.put('/hyperledger/shipments/:recordId/status', async (req, res) => {
  try {
    const { status, ...metadata } = req.body;
    const result = await hyperledgerIntegration.updateShipmentStatus(
      req.params.recordId,
      status,
      metadata
    );
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /hyperledger/shipments/:recordId/certifications - Add certification
app.post('/hyperledger/shipments/:recordId/certifications', async (req, res) => {
  try {
    const result = await hyperledgerIntegration.addCertification(
      req.params.recordId,
      req.body
    );
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /hyperledger/shipments/:recordId/custody - Get custody chain
app.get('/hyperledger/shipments/:recordId/custody', async (req, res) => {
  try {
    const custody = await hyperledgerIntegration.getCustodyChain(req.params.recordId);
    res.json(custody);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /hyperledger/shipments/:recordId/verify - Verify shipment authenticity
app.get('/hyperledger/shipments/:recordId/verify', async (req, res) => {
  try {
    const result = await hyperledgerIntegration.verifyShipment(req.params.recordId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /hyperledger/shipments - Query shipments
app.get('/hyperledger/shipments', async (req, res) => {
  try {
    const { exporter_id, status, product } = req.query;
    const results = await hyperledgerIntegration.queryShipments({
      exporter_id,
      status,
      product
    });
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /hyperledger/all - Get all records (debug)
app.get('/hyperledger/all', (req, res) => {
  res.json(hyperledgerIntegration.getAllRecords());
});

// ============================================
// Odoo WMS Integration Endpoints
// ============================================

// POST /odoo/connect - Connect to Odoo server
app.post('/odoo/connect', async (req, res) => {
  try {
    const { host, port, database, username, password } = req.body;
    
    if (host || port || database || username || password) {
      odooWmsIntegration.configure({ host, port, database, username, password });
    }
    
    await odooWmsIntegration.connect();
    res.json(odooWmsIntegration.getStatus());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /odoo/status - Get connection status
app.get('/odoo/status', (req, res) => {
  res.json(odooWmsIntegration.getStatus());
});

// GET /odoo/locations - Get warehouse locations
app.get('/odoo/locations', async (req, res) => {
  try {
    const locations = await odooWmsIntegration.getLocations();
    res.json(locations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /odoo/warehouses - Get warehouses
app.get('/odoo/warehouses', async (req, res) => {
  try {
    const warehouses = await odooWmsIntegration.getWarehouses();
    res.json(warehouses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /odoo/stock-moves - Get stock moves
app.get('/odoo/stock-moves', async (req, res) => {
  try {
    const { product_id } = req.query;
    const moves = await odooWmsIntegration.getStockMoves(product_id);
    res.json(moves);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /odoo/product-stock/:productId - Get product stock
app.get('/odoo/product-stock/:productId', async (req, res) => {
  try {
    const stock = await odooWmsIntegration.getProductStock(parseInt(req.params.productId));
    res.json(stock);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /odoo/transfers - Create stock transfer
app.post('/odoo/transfers', async (req, res) => {
  try {
    const transfer = await odooWmsIntegration.createTransfer(req.body);
    res.json(transfer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /odoo/transfers - Get transfers
app.get('/odoo/transfers', async (req, res) => {
  try {
    const { state, picking_type, origin } = req.query;
    const transfers = await odooWmsIntegration.getTransfers({
      state,
      picking_type,
      origin
    });
    res.json(transfers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /odoo/transfers/:id - Get transfer by ID
app.get('/odoo/transfers/:id', async (req, res) => {
  try {
    const transfer = await odooWmsIntegration.getTransfer(req.params.id);
    if (!transfer) {
      return res.status(404).json({ error: 'Transfer not found' });
    }
    res.json(transfer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /odoo/transfers/:id/state - Update transfer state
app.put('/odoo/transfers/:id/state', async (req, res) => {
  try {
    const { state } = req.body;
    const transfer = await odooWmsIntegration.updateTransferState(req.params.id, state);
    res.json(transfer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /odoo/lots - Get product lots
app.get('/odoo/lots', async (req, res) => {
  try {
    const { product_id } = req.query;
    const lots = await odooWmsIntegration.getProductLots(product_id);
    res.json(lots);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /odoo/inventory - Create inventory adjustment
app.post('/odoo/inventory', async (req, res) => {
  try {
    const adjustment = await odooWmsIntegration.createInventoryAdjustment(req.body);
    res.json(adjustment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /odoo/sync - Sync shipment with Odoo WMS
app.post('/odoo/sync', async (req, res) => {
  try {
    const result = await odooWmsIntegration.syncWithOdoo(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// OpenTMS Integration Endpoints
// ============================================

// POST /tms/connect - Connect to TMS
app.post('/tms/connect', async (req, res) => {
  try {
    const { apiUrl, apiKey } = req.body;
    
    if (apiUrl || apiKey) {
      opentmsIntegration.configure({ apiUrl, apiKey });
    }
    
    await opentmsIntegration.connect();
    res.json(opentmsIntegration.getStatus());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /tms/status - Get TMS status
app.get('/tms/status', (req, res) => {
  res.json(opentmsIntegration.getStatus());
});

// POST /tms/loads - Create load
app.post('/tms/loads', async (req, res) => {
  try {
    const load = await opentmsIntegration.createLoad(req.body);
    res.json(load);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /tms/loads - Get loads
app.get('/tms/loads', async (req, res) => {
  try {
    const { status, carrier_id, Culbridge_shipment_id } = req.query;
    const loads = await opentmsIntegration.getLoads({
      status,
      carrier_id,
      Culbridge_shipment_id
    });
    res.json(loads);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /tms/loads/:id - Get load
app.get('/tms/loads/:id', async (req, res) => {
  try {
    const load = await opentmsIntegration.getLoad(req.params.id);
    if (!load) {
      return res.status(404).json({ error: 'Load not found' });
    }
    res.json(load);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /tms/loads/:id/status - Update load status
app.put('/tms/loads/:id/status', async (req, res) => {
  try {
    const { status, ...eventData } = req.body;
    const load = await opentmsIntegration.updateLoadStatus(req.params.id, status, eventData);
    res.json(load);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /tms/loads/:id/tracking - Get tracking summary
app.get('/tms/loads/:id/tracking', async (req, res) => {
  try {
    const tracking = await opentmsIntegration.getTrackingSummary(req.params.id);
    res.json(tracking);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /tms/carriers - Create carrier
app.post('/tms/carriers', async (req, res) => {
  try {
    const carrier = await opentmsIntegration.createCarrier(req.body);
    res.json(carrier);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /tms/carriers - Get carriers
app.get('/tms/carriers', async (req, res) => {
  try {
    const { active, carrier_type } = req.query;
    const carriers = await opentmsIntegration.getCarriers({ active, carrier_type });
    res.json(carriers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /tms/carriers/:id - Get carrier
app.get('/tms/carriers/:id', async (req, res) => {
  try {
    const carrier = await opentmsIntegration.getCarrier(req.params.id);
    if (!carrier) {
      return res.status(404).json({ error: 'Carrier not found' });
    }
    res.json(carrier);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /tms/routes - Create route
app.post('/tms/routes', async (req, res) => {
  try {
    const route = await opentmsIntegration.createRoute(req.body);
    res.json(route);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /tms/routes/:id - Get route
app.get('/tms/routes/:id', async (req, res) => {
  try {
    const route = await opentmsIntegration.getRoute(req.params.id);
    if (!route) {
      return res.status(404).json({ error: 'Route not found' });
    }
    res.json(route);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /tms/routes/:id/tracking - Update route tracking
app.put('/tms/routes/:id/tracking', async (req, res) => {
  try {
    const route = await opentmsIntegration.updateRouteTracking(req.params.id, req.body);
    res.json(route);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /tms/deliveries - Create delivery
app.post('/tms/deliveries', async (req, res) => {
  try {
    const delivery = await opentmsIntegration.createDelivery(req.body);
    res.json(delivery);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /tms/deliveries/:id - Get delivery
app.get('/tms/deliveries/:id', async (req, res) => {
  try {
    const delivery = await opentmsIntegration.getDelivery(req.params.id);
    if (!delivery) {
      return res.status(404).json({ error: 'Delivery not found' });
    }
    res.json(delivery);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /tms/deliveries/:id/confirm - Confirm delivery
app.post('/tms/deliveries/:id/confirm', async (req, res) => {
  try {
    const delivery = await opentmsIntegration.confirmDelivery(req.params.id, req.body);
    res.json(delivery);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /tms/sync - Sync with Culbridge shipment
app.post('/tms/sync', async (req, res) => {
  try {
    const result = await opentmsIntegration.syncWithCulbridge(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// OpenLMIS Integration Endpoints
// ============================================

// POST /openlmis/connect - Connect to OpenLMIS
app.post('/openlmis/connect', async (req, res) => {
  try {
    const { apiUrl, apiKey, username, password } = req.body;
    
    if (apiUrl || apiKey || username || password) {
      openlmisIntegration.configure({ apiUrl, apiKey, username, password });
    }
    
    await openlmisIntegration.connect();
    res.json(openlmisIntegration.getStatus());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /openlmis/status - Get status
app.get('/openlmis/status', (req, res) => {
  res.json(openlmisIntegration.getStatus());
});

// POST /openlmis/facilities - Create facility
app.post('/openlmis/facilities', async (req, res) => {
  try {
    const facility = await openlmisIntegration.createFacility(req.body);
    res.json(facility);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /openlmis/facilities - Get facilities
app.get('/openlmis/facilities', async (req, res) => {
  try {
    const { active, type } = req.query;
    const facilities = await openlmisIntegration.getFacilities({ active, type });
    res.json(facilities);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /openlmis/facilities/:id - Get facility
app.get('/openlmis/facilities/:id', async (req, res) => {
  try {
    const facility = await openlmisIntegration.getFacility(req.params.id);
    if (!facility) {
      return res.status(404).json({ error: 'Facility not found' });
    }
    res.json(facility);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /openlmis/commodities - Create commodity
app.post('/openlmis/commodities', async (req, res) => {
  try {
    const commodity = await openlmisIntegration.createCommodity(req.body);
    res.json(commodity);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /openlmis/commodities - Get commodities
app.get('/openlmis/commodities', async (req, res) => {
  try {
    const { active, commodity_type, category } = req.query;
    const commodities = await openlmisIntegration.getCommodities({ active, commodity_type, category });
    res.json(commodities);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /openlmis/commodities/:id - Get commodity
app.get('/openlmis/commodities/:id', async (req, res) => {
  try {
    const commodity = await openlmisIntegration.getCommodity(req.params.id);
    if (!commodity) {
      return res.status(404).json({ error: 'Commodity not found' });
    }
    res.json(commodity);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /openlmis/orders - Create order
app.post('/openlmis/orders', async (req, res) => {
  try {
    const order = await openlmisIntegration.createOrder(req.body);
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /openlmis/orders - Get orders
app.get('/openlmis/orders', async (req, res) => {
  try {
    const { status, facility_id, program } = req.query;
    const orders = await openlmisIntegration.getOrders({ status, facility_id, program });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /openlmis/orders/:id - Get order
app.get('/openlmis/orders/:id', async (req, res) => {
  try {
    const order = await openlmisIntegration.getOrder(req.params.id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /openlmis/orders/:id/status - Update order status
app.put('/openlmis/orders/:id/status', async (req, res) => {
  try {
    const { status, notes } = req.body;
    const order = await openlmisIntegration.updateOrderStatus(req.params.id, status, notes);
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /openlmis/stock - Update stock level
app.post('/openlmis/stock', async (req, res) => {
  try {
    const stock = await openlmisIntegration.updateStockLevel(req.body);
    res.json(stock);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /openlmis/stock/:facilityId/:commodityId - Get stock level
app.get('/openlmis/stock/:facilityId/:commodityId', async (req, res) => {
  try {
    const stock = await openlmisIntegration.getStockLevel(req.params.facilityId, req.params.commodityId);
    res.json(stock);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /openlmis/stock/facility/:facilityId - Get facility stock
app.get('/openlmis/stock/facility/:facilityId', async (req, res) => {
  try {
    const stock = await openlmisIntegration.getFacilityStock(req.params.facilityId);
    res.json(stock);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /openlmis/stock/low - Get low stock items
app.get('/openlmis/stock/low', async (req, res) => {
  try {
    const { facility_id } = req.query;
    const items = await openlmisIntegration.getLowStockItems(facility_id);
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /openlmis/requisitions - Create requisition
app.post('/openlmis/requisitions', async (req, res) => {
  try {
    const requisition = await openlmisIntegration.createRequisition(req.body);
    res.json(requisition);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /openlmis/requisitions - Get requisitions
app.get('/openlmis/requisitions', async (req, res) => {
  try {
    const { status, facility_id } = req.query;
    const requisitions = await openlmisIntegration.getRequisitions({ status, facility_id });
    res.json(requisitions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /openlmis/requisitions/:id - Get requisition
app.get('/openlmis/requisitions/:id', async (req, res) => {
  try {
    const requisition = await openlmisIntegration.getRequisition(req.params.id);
    if (!requisition) {
      return res.status(404).json({ error: 'Requisition not found' });
    }
    res.json(requisition);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /openlmis/requisitions/:id/submit - Submit requisition
app.post('/openlmis/requisitions/:id/submit', async (req, res) => {
  try {
    const requisition = await openlmisIntegration.submitRequisition(req.params.id);
    res.json(requisition);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /openlmis/requisitions/:id/approve - Approve requisition
app.post('/openlmis/requisitions/:id/approve', async (req, res) => {
  try {
    const requisition = await openlmisIntegration.approveRequisition(req.params.id);
    res.json(requisition);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /openlmis/sync - Sync with Culbridge
app.post('/openlmis/sync', async (req, res) => {
  try {
    const result = await openlmisIntegration.syncWithCulbridge(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /openlmis/reports/:type - Generate report
app.get('/openlmis/reports/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const filters = req.query;
    const report = await openlmisIntegration.generateReport(type, filters);
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// XGBoost Integration Endpoints
// ============================================

// POST /xgboost/initialize - Initialize model
app.post('/xgboost/initialize', (req, res) => {
  try {
    const result = xgboostIntegration.initializeModel();
    res.json({ success: result, message: 'XGBoost model initialized' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /xgboost/config - Get model configuration
app.get('/xgboost/config', (req, res) => {
  res.json(xgboostIntegration.getConfig());
});

// POST /xgboost/train - Train model
app.post('/xgboost/train', async (req, res) => {
  try {
    const { training_data } = req.body;
    const result = await xgboostIntegration.trainModel(training_data);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /xgboost/predict - Predict risk
app.post('/xgboost/predict', async (req, res) => {
  try {
    const prediction = await xgboostIntegration.predictRisk(req.body);
    res.json(prediction);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /xgboost/batch-predict - Batch prediction
app.post('/xgboost/batch-predict', async (req, res) => {
  try {
    const { shipments } = req.body;
    const results = await xgboostIntegration.batchPredict(shipments);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /xgboost/importance - Get feature importance
app.get('/xgboost/importance', (req, res) => {
  res.json(xgboostIntegration.getFeatureImportance());
});

// GET /xgboost/predictions - Get prediction history
app.get('/xgboost/predictions', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const history = xgboostIntegration.getPredictionHistory(limit);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /xgboost/threshold - Set risk threshold
app.put('/xgboost/threshold', (req, res) => {
  try {
    const { threshold } = req.body;
    const result = xgboostIntegration.setRiskThreshold(threshold);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /xgboost/retrain - Retrain with new data
app.post('/xgboost/retrain', async (req, res) => {
  try {
    const { new_data } = req.body;
    const result = await xgboostIntegration.retrain(new_data);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /xgboost/combined - Combined deterministic + XGBoost prediction
app.post('/xgboost/combined', async (req, res) => {
  try {
    const { shipment_data, deterministic_result } = req.body;
    const result = await xgboostIntegration.predictWithIntegration(
      shipment_data,
      deterministic_result
    );
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Decision Engine Endpoints
// ============================================

// POST /decision - Main decision endpoint
app.post('/decision', async (req, res) => {
  try {
    const result = await decisionEngine.predictDecision(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /decision/calibration - Get calibration table
app.get('/decision/calibration', (req, res) => {
  res.json(decisionEngine.getCalibrationTable());
});

// POST /decision/outcomes - Record outcome
app.post('/decision/outcomes', async (req, res) => {
  try {
    const outcome = await decisionEngine.recordOutcome(req.body);
    res.json(outcome);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /decision/outcomes - Get outcomes
app.get('/decision/outcomes', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    res.json(decisionEngine.getOutcomes(limit));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Deterministic Evaluation Endpoint (MVP)
// POST /evaluate-shipment - Returns PASS|BLOCKED|RISK
// ============================================

function evaluateShipmentDeterministic(shipment) {
  const failures = [];
  const missing = [];
  const next_actions = [];
  const evidence_required = [];
  
  const { product, form, origin, destination, lab_results, documents } = shipment;
  
  // Validate required fields (Hard Constraint A: No missing inputs)
  if (!product || !origin || !destination) {
    return {
      status: 'BLOCKED',
      failures: [{ rule: 'required_fields', reason: 'missing_required_input' }],
      missing: ['product', 'origin', 'destination'].filter(f => !shipment[f]),
      next_actions: [],
      evidence_required: []
    };
  }
  
  // MVP Scope: Only cocoa_beans, Nigeria->Netherlands
  const isCocoaNL = product === 'cocoa_beans' && destination === 'Netherlands';
  
  if (isCocoaNL) {
    // Lab validations: moisture <= 7.5%
    if (lab_results) {
      if (lab_results.moisture !== undefined && lab_results.moisture > 7.5) {
        failures.push({ rule: 'eu_cocoa_moisture_v1', reason: 'moisture_exceeds_limit', value: lab_results.moisture });
      }
      // Lab validations: salmonella must be false
      if (lab_results.salmonella === true) {
        failures.push({ rule: 'eu_cocoa_salmonella_v1', reason: 'salmonella_detected' });
      }
      // Lab validations: pesticide_residue <= 0.1 (default MRL)
      if (lab_results.pesticide_residue !== undefined && lab_results.pesticide_residue > 0.1) {
        failures.push({ rule: 'eu_cocoa_pesticide_v1', reason: 'pesticide_exceeds_mrl', value: lab_results.pesticide_residue });
      }
    } else {
      // No lab results = BLOCK (Hard Constraint B: No assumptions)
      missing.push('lab_results');
      next_actions.push({ step: 1, action: 'conduct_lab_test' });
    }
    
    // Document requirements
    if (!documents) {
      missing.push('certificate_of_origin', 'phytosanitary_certificate', 'cci');
    } else {
      if (!documents.certificate_of_origin) {
        missing.push('certificate_of_origin');
      }
      if (!documents.phytosanitary_certificate) {
        missing.push('phytosanitary_certificate');
      }
      if (!documents.cci) {
        missing.push('cci');
      }
    }
    
    // Generate next_actions if documents missing
    if (missing.length > 0) {
      if (!documents?.certificate_of_origin) {
        next_actions.push({ step: next_actions.length + 1, action: 'apply_certificate_of_origin' });
      }
      if (!documents?.phytosanitary_certificate) {
        next_actions.push({ step: next_actions.length + 1, action: 'book_naqs_inspection' });
      }
      if (!documents?.cci) {
        next_actions.push({ step: next_actions.length + 1, action: 'complete_trms_registration' });
      }
    }
    
    // Evidence required (only list what's missing)
    if (!documents?.phytosanitary_certificate) evidence_required.push('phytosanitary_certificate');
    if (!documents?.certificate_of_origin) evidence_required.push('certificate_of_origin');
    if (!documents?.cci) evidence_required.push('cci');
    if (!lab_results) evidence_required.push('lab_results');
  }
  
  // Determine status
  let status = 'PASS';
  if (failures.length > 0 || missing.length > 0) {
    status = 'BLOCKED';
  }
  
  // If passed but elevated risk (e.g., high pesticide but under limit)
  if (status === 'PASS' && lab_results?.pesticide_residue && lab_results.pesticide_residue > 0.05) {
    status = 'RISK';
  }
  
  return {
    status,
    failures,
    missing,
    next_actions,
    evidence_required
  };
}

app.post('/evaluate-shipment', async (req, res) => {
  try {
    const { shipment_id, actor } = req.body;
    
    if (!shipment_id) {
      return res.status(400).json({ 
        error: 'Missing required field: shipment_id',
        hint: 'Pass shipment_id in request body to trigger full evaluation with audit trail'
      });
    }
    
    const result = await orchestration.processShipmentEvaluation(shipment_id, actor || 'api');
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/farms - Register farm
app.post('/api/v1/farms', async (req, res) => {
  try {
    const { farm_id, external_id, registered_by, farmer_name, farmer_phone, farmer_nin, cooperative_id, gps_lat, gps_lng, gps_polygon, state, lga, zone } = req.body;
    
    if (!farm_id || !registered_by || !farmer_name || !farmer_phone || !state || !lga || !zone) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const { run } = require('./utils/db');
    await run(`
      INSERT INTO farms (farm_id, external_id, registered_by, farmer_name, farmer_phone, farmer_nin, cooperative_id, gps_lat, gps_lng, gps_polygon, state, lga, zone)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [farm_id, external_id, registered_by, farmer_name, farmer_phone, farmer_nin, cooperative_id, gps_lat, gps_lng, JSON.stringify(gps_polygon), state, lga, zone]);
    
    res.json({ farm_id, status: 'registered' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/farms/:farm_id/pesticide-logs - Log pesticide application
app.post('/api/v1/farms/:farm_id/pesticide-logs', async (req, res) => {
  try {
    const { farm_id } = req.params;
    const { crop_id, logged_by, pesticide_name, active_ingredient, application_date, pre_harvest_interval_days, dosage_per_hectare, dosage_unit, application_method, area_treated_hectares, photo_evidence_url, purchased_from } = req.body;
    
    const { run } = require('./utils/db');
    const log_id = require('crypto').randomUUID();
    
    await run(`
      INSERT INTO pesticide_logs (log_id, farm_id, crop_id, logged_by, pesticide_name, active_ingredient, application_date, pre_harvest_interval_days, dosage_per_hectare, dosage_unit, application_method, area_treated_hectares, photo_evidence_url, purchased_from)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [log_id, farm_id, crop_id, logged_by, pesticide_name, active_ingredient, application_date, pre_harvest_interval_days, dosage_per_hectare, dosage_unit, application_method, area_treated_hectares, photo_evidence_url, purchased_from]);
    
    res.json({ log_id, status: 'logged' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/farms/:farm_id/pesticide-logs - Get pesticide logs for farm
app.get('/api/v1/farms/:farm_id/pesticide-logs', async (req, res) => {
  try {
    const { farm_id } = req.params;
    const { get, all } = require('./utils/db');
    
    const logs = await all('SELECT * FROM pesticide_logs WHERE farm_id = ? ORDER BY application_date DESC', [farm_id]);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/shipments - Create shipment (triggers MRL scan)
app.post('/api/v1/shipments', async (req, res) => {
  try {
    const { id, exporter_id, product, destination, farms } = req.body;
    
    if (!id || !exporter_id || !product || !destination) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const { run } = require('./utils/db');
    
    // Create shipment
    await run(`
      INSERT INTO shipments (id, exporter_id, status, product, destination, created_at)
      VALUES (?, ?, 'DRAFT', ?, ?)
    `, [id, exporter_id, product, destination]);
    
    // Link farms if provided
    if (farms && farms.length > 0) {
      for (const farm of farms) {
        await run(`
          INSERT INTO shipment_farms (shipment_id, farm_id, crop_id)
          VALUES (?, ?, ?)
        `, [id, farm.farm_id, farm.crop_id]);
      }
    }
    
    res.json({ shipment_id: id, status: 'created' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/shipments/:id/mrl-assessment - Get MRL risk result
app.get('/api/v1/shipments/:id/mrl-assessment', async (req, res) => {
  try {
    const { id } = req.params;
    const { get, all } = require('./utils/db');
    
    const assessment = await get('SELECT * FROM shipment_mrl_assessments WHERE shipment_id = ? ORDER BY generated_at DESC LIMIT 1', [id]);
    const decisions = await all('SELECT * FROM shipment_gate_decisions WHERE shipment_id = ? ORDER BY decided_at DESC', [id]);
    
    res.json({ assessment, gate_decisions: decisions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/shipments/:id/lab-result - Upload lab result
app.post('/api/v1/shipments/:id/lab-result', async (req, res) => {
  try {
    const { id } = req.params;
    const { lab_name, lab_accreditation_number, test_date, passed_eu_mrl, failed_chemicals, raw_results, report_url } = req.body;
    
    const { run } = require('./utils/db');
    
    await run(`
      INSERT INTO lab_test_results (shipment_id, lab_name, lab_accreditation_number, test_date, passed_eu_mrl, failed_chemicals, raw_results, report_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, lab_name, lab_accreditation_number, test_date, passed_eu_mrl, JSON.stringify(failed_chemicals || []), JSON.stringify(raw_results || {}), report_url]);
    
    res.json({ status: 'lab_result_uploaded' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Lab Network API Endpoints
// ============================================

// GET /api/v1/labs - List approved labs
app.get('/api/v1/labs', async (req, res) => {
  try {
    const labs = await labNetwork.getActiveLabs();
    res.json(labs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/labs/:id - Lab profile
app.get('/api/v1/labs/:id', async (req, res) => {
  try {
    const lab = await labNetwork.getLabById(req.params.id);
    if (!lab) return res.status(404).json({ error: 'Lab not found' });
    res.json(lab);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/shipments/:id/lab-request - Create + dispatch lab request
app.post('/api/v1/shipments/:id/lab-request', async (req, res) => {
  try {
    const { id } = req.params;
    const { exporter_id, commodity, destination_country, required_by_date } = req.body;
    
    if (!exporter_id || !commodity) {
      return res.status(400).json({ error: 'Missing required fields: exporter_id, commodity' });
    }
    
    const routing = await labNetwork.routeToLab({
      commodity,
      destination_country: destination_country || 'NL',
      required_by_date,
      exporter_tier: 'Standard'
    });
    
    const request = await labNetwork.createLabTestRequest({
      shipment_id: id,
      lab_id: routing.selected_lab.lab_id,
      exporter_id,
      commodity,
      test_suite: routing.test_suite,
      results_required_by: required_by_date
    });
    
    await labNetwork.dispatchLabRequest(request.request_id);
    
    res.json({
      request_id: request.request_id,
      selected_lab: routing.selected_lab,
      test_suite: routing.test_suite,
      estimated_result_date: routing.estimated_result_date,
      alternative_labs: routing.alternative_labs,
      estimated_cost_usd: routing.estimated_cost_usd
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/shipments/:id/lab-request - Get lab request status
app.get('/api/v1/shipments/:id/lab-request', async (req, res) => {
  try {
    const status = await labNetwork.getLabRequestStatus(req.params.id);
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/lab-results/ingest - Lab pushes result in
app.post('/api/v1/lab-results/ingest', async (req, res) => {
  try {
    const payload = req.body;
    const result = await labNetwork.ingestLabResult(payload);
    await labNetwork.processLabResult(result);
    res.json({ received: true, result_id: result.result_id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/shipments/:id/certificates - All certs for shipment
app.get('/api/v1/shipments/:id/certificates', async (req, res) => {
  try {
    const { get } = require('./utils/db');
    const certs = await get('SELECT * FROM certificates WHERE shipment_id = ? ORDER BY created_at DESC', [req.params.id]);
    res.json(certs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/shipments/:id/certificates - Upload certificate
app.post('/api/v1/shipments/:id/certificates', async (req, res) => {
  try {
    const { id } = req.params;
    const { type, certificate_number, issuing_authority, issued_date, valid_until, document_url } = req.body;
    
    const { run } = require('./utils/db');
    const crypto = require('crypto');
    
    const cert_id = `CERT-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`;
    const document_hash = crypto.createHash('sha256').update(document_url || Date.now().toString()).digest('hex');
    
    await run(`
      INSERT INTO certificates (cert_id, shipment_id, type, document_url, document_hash, certificate_number, issuing_authority, issued_date, valid_until, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [cert_id, id, type, document_url, document_hash, certificate_number, issuing_authority, issued_date, valid_until, new Date().toISOString()]);
    
    res.json({ cert_id, status: 'stored' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/shipments/:id/traceability - Full chain view
app.get('/api/v1/shipments/:id/traceability', async (req, res) => {
  try {
    const { get, all } = require('./utils/db');
    
    const chain = await get('SELECT * FROM traceability_chains WHERE shipment_id = ?', [req.params.id]);
    const stages = chain ? await all('SELECT * FROM traceability_stages WHERE chain_id = ? ORDER BY sequence_number', [chain.chain_id]) : [];
    
    res.json({ chain, stages });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/traceability/:stage_id/confirm - Confirm a stage
app.post('/api/v1/traceability/:stage_id/confirm', async (req, res) => {
  try {
    const { stage_id } = req.params;
    const { confirmed_by, confirmation_method, notes } = req.body;
    
    const { run, get } = require('./utils/db');
    const crypto = require('crypto');
    
    const stage = await get('SELECT * FROM traceability_stages WHERE stage_id = ?', [stage_id]);
    if (!stage) return res.status(404).json({ error: 'Stage not found' });
    if (stage.is_locked) return res.status(400).json({ error: 'Stage already confirmed and locked' });
    
    const stage_hash = crypto.createHash('sha256').update(JSON.stringify(stage)).digest('hex');
    
    await run(`
      UPDATE traceability_stages SET is_locked = 1, confirmed_by = ?, confirmed_at = ?, confirmation_method = ?, notes = ?, stage_hash = ?
      WHERE stage_id = ?
    `, [confirmed_by, new Date().toISOString(), confirmation_method || 'DIGITAL_SIGNATURE', notes, stage_hash, stage_id]);
    
    res.json({ stage_id, confirmed: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// RASFF Risk Monitoring API Endpoints
// ============================================

// GET /api/v1/rasff/alerts - Active alerts
app.get('/api/v1/rasff/alerts', async (req, res) => {
  try {
    const alerts = await rasffMonitor.getActiveNigeriaAlerts();
    res.json(alerts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/rasff/commodity/:commodity - Alerts by commodity
app.get('/api/v1/rasff/commodity/:commodity', async (req, res) => {
  try {
    const alerts = await rasffMonitor.getAlertsByCommodity(req.params.commodity);
    res.json(alerts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/commodities/risk-matrix - All commodity profiles
app.get('/api/v1/commodities/risk-matrix', async (req, res) => {
  try {
    const profiles = {};
    const commodities = ['Sesame Seeds', 'Cocoa Beans', 'Ginger', 'Shea Butter', 'Beans'];
    for (const commodity of commodities) {
      profiles[commodity] = await rasffMonitor.getCommodityRiskProfile(commodity);
    }
    res.json(profiles);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/shipments/:id/rasff-gate - Run RASFF gate check
app.get('/api/v1/shipments/:id/rasff-gate', async (req, res) => {
  try {
    const { get } = require('./utils/db');
    const shipment = await get('SELECT * FROM shipments WHERE id = ?', [req.params.id]);
    if (!shipment) return res.status(404).json({ error: 'Shipment not found' });
    
    const gateResult = await rasffMonitor.runRASFFGate(shipment);
    res.json(gateResult);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/shipments/:id/risk-score - Get composite risk score
app.get('/api/v1/shipments/:id/risk-score', async (req, res) => {
  try {
    const score = await riskScoring.getShipmentRiskScore(req.params.id);
    res.json(score || { shipment_id: req.params.id, risk_level: 'UNKNOWN', weighted_score: 0 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/shipments/:id/financial-exposure - Financial exposure calc
app.get('/api/v1/shipments/:id/financial-exposure', async (req, res) => {
  try {
    const exposure = await riskScoring.calculateFinancialExposure(req.params.id);
    res.json(exposure);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/shipments/:id/corrective-actions - Get corrective action plan
app.get('/api/v1/shipments/:id/corrective-actions', async (req, res) => {
  try {
    const { get } = require('./utils/db');
    const riskScore = await riskScoring.getShipmentRiskScore(req.params.id);
    
    let plan;
    if (riskScore && riskScore.is_blocked) {
      plan = await riskScoring.generateCorrectiveActionPlan(req.params.id, riskScore);
    } else {
      plan = { shipment_id: req.params.id, actions: [], message: 'No blocked actions' };
    }
    res.json(plan);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/exporters/:id/compliance-score - Exporter compliance score
app.get('/api/v1/exporters/:id/compliance-score', async (req, res) => {
  try {
    const score = await riskScoring.calculateExporterComplianceScore(req.params.id);
    res.json(score);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Regulatory Intelligence API Endpoints
// ============================================

// GET /api/v1/regulatory/changes - Active regulatory changes
app.get('/api/v1/regulatory/changes', async (req, res) => {
  try {
    const changes = await regulatoryIntelligence.getActiveRegulatoryChanges();
    res.json(changes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/regulatory/gap-index - Full gap index
app.get('/api/v1/regulatory/gap-index', async (req, res) => {
  try {
    const { commodity } = req.query;
    const gaps = await regulatoryIntelligence.getGapIndex(commodity);
    res.json(gaps);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/regulatory/alerts - My alerts
app.get('/api/v1/regulatory/alerts', async (req, res) => {
  try {
    const { exporter_id } = req.query;
    const alerts = await regulatoryIntelligence.getExporterAlerts(exporter_id);
    res.json(alerts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/v1/regulatory/alerts/:id/acknowledge - Mark alert as read
app.put('/api/v1/regulatory/alerts/:id/acknowledge', async (req, res) => {
  try {
    const { exporter_id } = req.body;
    await regulatoryIntelligence.acknowledgeAlert(req.params.id, exporter_id);
    res.json({ acknowledged: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Agency Integration API Endpoints
// ============================================

// GET /api/v1/shipments/:id/certifications/timeline - Timeline view
app.get('/api/v1/shipments/:id/certifications/timeline', async (req, res) => {
  try {
    const timeline = await agencyIntegration.buildCertificationTimeline(req.params.id);
    res.json(timeline);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/shipments/:id/nepc/initiate - Start NEPC workflow
app.post('/api/v1/shipments/:id/nepc/initiate', async (req, res) => {
  try {
    const result = await agencyIntegration.initiateNEPCWorkflow(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/v1/shipments/:id/nepc/status - Update NEPC status
app.put('/api/v1/shipments/:id/nepc/status', async (req, res) => {
  try {
    const { status, reference_number, certificate_url } = req.body;
    await agencyIntegration.updateNEPCStatus(req.params.id, status, reference_number, certificate_url);
    res.json({ updated: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/shipments/:id/naqs/booking - Initiate NAQS booking
app.post('/api/v1/shipments/:id/naqs/booking', async (req, res) => {
  try {
    const { requested_date, address, state } = req.body;
    const result = await agencyIntegration.initiateNAQSBooking(req.params.id, requested_date, address, state);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/v1/shipments/:id/naqs/status - Update NAQS status
app.put('/api/v1/shipments/:id/naqs/status', async (req, res) => {
  try {
    const { request_id, status, inspector_comments, certificate_number } = req.body;
    await agencyIntegration.updateNAQSStatus(request_id, status, inspector_comments, certificate_number);
    res.json({ updated: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /decision/signals - Add external signal
app.post('/decision/signals', (req, res) => {
  try {
    const signal = decisionEngine.addExternalSignal(req.body);
    res.json(signal);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /decision/signals/:shipmentId - Get signals for shipment
app.get('/decision/signals/:shipmentId', (req, res) => {
  res.json(decisionEngine.getExternalSignals(req.params.shipmentId));
});

// GET /decision/config - Get configuration
app.get('/decision/config', (req, res) => {
  res.json(decisionEngine.getConfig());
});

// PUT /decision/threshold - Set threshold
app.put('/decision/threshold', (req, res) => {
  try {
    const { threshold } = req.body;
    const result = decisionEngine.setThreshold(threshold);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /decision/retrain - Retrain model
app.post('/decision/retrain', async (req, res) => {
  try {
    const result = await decisionEngine.retrainModel();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /decision/reliability/:type/:id - Get actor reliability
app.get('/decision/reliability/:type/:id', (req, res) => {
  const { type, id } = req.params;
  const reliability = decisionEngine.getActorReliability(type, id);
  if (!reliability) {
    return res.status(404).json({ error: 'Actor not found' });
  }
  res.json(reliability);
});

// ============================================
// Decision Engine - PRODUCTION ENDPOINTS
// ============================================

// GET /decision/drift - Get drift detection metrics
app.get('/decision/drift', (req, res) => {
  try {
    const status = decisionEngine.checkDriftStatus();
    const metrics = decisionEngine.getDriftMetrics();
    res.json({ status, metrics });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /decision/health - Model health check (Kill Switch)
app.get('/decision/health', (req, res) => {
  try {
    const health = decisionEngine.checkModelHealth();
    res.json(health);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /decision/fixes - Get fix rules
app.get('/decision/fixes', (req, res) => {
  try {
    const fixes = decisionEngine.getFixRules();
    res.json(fixes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /decision/validate - Run validation test
app.post('/decision/validate', async (req, res) => {
  try {
    const { shipments } = req.body;
    if (!shipments || !Array.isArray(shipments)) {
      return res.status(400).json({ error: 'Array of shipments required' });
    }
    const result = await decisionEngine.runValidationTest(shipments);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /decision/loss - Calculate expected loss
app.post('/decision/loss', (req, res) => {
  try {
    const result = decisionEngine.calculateLossFromInputs(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// DETERMINISTIC ENGINE - Pre-ML Enforcement
// ============================================

// POST /deterministic/validate - Full deterministic validation
app.post('/deterministic/validate', async (req, res) => {
  try {
    const result = await deterministicEngine.validate(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /deterministic/quick - Quick NVWA validation
app.post('/deterministic/quick', (req, res) => {
  try {
    const result = deterministicEngine.quickValidate(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /deterministic/rules - Get all NVWA rules
app.get('/deterministic/rules', (req, res) => {
  try {
    const { severity } = req.query;
    const rules = severity 
      ? nvwaSimulator.getRulesBySeverity(severity)
      : nvwaSimulator.getAllRules();
    res.json(rules);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ACCESS2MARKETS - Compliance Rules
// ============================================

// GET /access2markets/rules - Get all compliance rules
app.get('/access2markets/rules', (req, res) => {
  try {
    const { hsCode, type } = req.query;
    let rules;
    if (hsCode) {
      rules = access2Markets.getRulesByHSCode(hsCode);
    } else {
      rules = access2Markets.getAllRules();
    }
    if (type) {
      rules = rules.filter(r => r.type === type);
    }
    res.json(rules);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /access2markets/rules/:hsCode - Get rules by HS code
app.get('/access2markets/rules/:hsCode', (req, res) => {
  try {
    const rules = access2Markets.getRulesByHSCode(req.params.hsCode);
    res.json(rules);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /access2markets/mrl/:hsCode/:pesticide - Get MRL
app.get('/access2markets/mrl/:hsCode/:pesticide', (req, res) => {
  try {
    const mrl = access2Markets.getMRL(req.params.hsCode, req.params.pesticide);
    if (!mrl) {
      return res.status(404).json({ error: 'MRL not found' });
    }
    res.json(mrl);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /access2markets/documents/:hsCode - Get required documents
app.get('/access2markets/documents/:hsCode', (req, res) => {
  try {
    const docs = access2Markets.getRequiredDocuments(req.params.hsCode);
    res.json({ hsCode: req.params.hsCode, requiredDocuments: docs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /access2markets/sync - Sync from API
app.post('/access2markets/sync', async (req, res) => {
  try {
    const result = await access2Markets.syncFromAPI();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /access2markets/config - Get configuration
app.get('/access2markets/config', (req, res) => {
  res.json(access2Markets.getConfig());
});

// ============================================
// TRACES - Certificate Validation
// ============================================

// POST /traces/import - Import certificate(s)
app.post('/traces/import', async (req, res) => {
  try {
    const result = await tracesParser.importCertificate(req.body);
    res.json({ imported: result.length, certificates: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /traces/certificates - Get all certificates
app.get('/traces/certificates', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const certs = tracesParser.getAllCertificates(limit);
    res.json(certs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /traces/certificates/:id - Get certificate
app.get('/traces/certificates/:id', (req, res) => {
  try {
    const cert = tracesParser.getCertificate(req.params.id);
    if (!cert) {
      return res.status(404).json({ error: 'Certificate not found' });
    }
    res.json(cert);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /traces/validate - Validate certificate
app.post('/traces/validate', (req, res) => {
  try {
    const result = tracesParser.validate(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /traces/batch/:batchId - Get certificates by batch
app.get('/traces/batch/:batchId', (req, res) => {
  try {
    const certs = tracesParser.getCertificatesByBatch(req.params.batchId);
    res.json(certs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /traces/config - Get configuration
app.get('/traces/config', (req, res) => {
  res.json(tracesParser.getConfig());
});

// ============================================
// RASFF - Enforcement Signals
// ============================================

// GET /rasff/alerts - Get alerts
app.get('/rasff/alerts', (req, res) => {
  try {
    const filters = {
      product: req.query.product,
      origin: req.query.origin,
      port: req.query.port,
      hazard: req.query.hazard,
      action: req.query.action,
      since: req.query.since
    };
    const alerts = rasffService.getAlerts(filters);
    res.json(alerts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /rasff/stats - Get statistics
app.get('/rasff/stats', (req, res) => {
  try {
    const stats = rasffService.getStatistics();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /rasff/rate/product/:product - Get rejection rate by product
app.get('/rasff/rate/product/:product', (req, res) => {
  try {
    const rate = rasffService.getRejectionRateByProduct(req.params.product);
    if (!rate) {
      return res.status(404).json({ error: 'No data found' });
    }
    res.json(rate);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /rasff/rate/origin/:country - Get rejection rate by origin
app.get('/rasff/rate/origin/:country', (req, res) => {
  try {
    const rate = rasffService.getRejectionRateByOrigin(req.params.country);
    if (!rate) {
      return res.status(404).json({ error: 'No data found' });
    }
    res.json(rate);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /rasff/rate/port/:port - Get rejection rate by port
app.get('/rasff/rate/port/:port', (req, res) => {
  try {
    const rate = rasffService.getRejectionRateByPort(req.params.port);
    if (!rate) {
      return res.status(404).json({ error: 'No data found' });
    }
    res.json(rate);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /rasff/hazards/:product - Get top hazards for product
app.get('/rasff/hazards/:product', (req, res) => {
  try {
    const hazards = rasffService.getTopHazards(req.params.product);
    res.json({ product: req.params.product, hazards });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /rasff/sync - Sync from RASFF
app.post('/rasff/sync', async (req, res) => {
  try {
    const result = await rasffService.syncFromAPI();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /rasff/alerts - Add alert
app.post('/rasff/alerts', async (req, res) => {
  try {
    const alert = await rasffService.addAlert(req.body);
    res.json(alert);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /rasff/features - Get derived features for ML
app.get('/rasff/features', (req, res) => {
  try {
    const features = rasffService.getDerivedFeatures(req.body);
    res.json(features);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /rasff/features - Get derived features (POST)
app.post('/rasff/features', (req, res) => {
  try {
    const features = rasffService.getDerivedFeatures(req.body);
    res.json(features);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /rasff/config - Get configuration
app.get('/rasff/config', (req, res) => {
  res.json(rasffService.getConfig());
});

// ============================================
// NVWA Simulator
// ============================================

// GET /nvwa/rules - Get NVWA rules
app.get('/nvwa/rules', (req, res) => {
  try {
    const { severity } = req.query;
    const rules = severity
      ? nvwaSimulator.getRulesBySeverity(severity)
      : nvwaSimulator.getAllRules();
    res.json(rules);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /nvwa/evaluate - Evaluate shipment
app.post('/nvwa/evaluate', (req, res) => {
  try {
    const result = nvwaSimulator.evaluate(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /nvwa/config - Get configuration
app.get('/nvwa/config', (req, res) => {
  res.json(nvwaSimulator.getConfig());
});

// ============================================
// RASFF LIVE SCRAPER
// ============================================

// GET /rasff/live/alerts - Get live alerts
app.get('/rasff/live/alerts', (req, res) => {
  try {
    const alerts = rasffScraper.getAllAlerts();
    res.json(alerts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /rasff/live/alerts/origin/:country - Get alerts by origin
app.get('/rasff/live/alerts/origin/:country', (req, res) => {
  try {
    const alerts = rasffScraper.getAlertsByOrigin(req.params.country);
    res.json(alerts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /rasff/live/alerts/product/:product - Get alerts by product
app.get('/rasff/live/alerts/product/:product', (req, res) => {
  try {
    const alerts = rasffScraper.getAlertsByProduct(req.params.product);
    res.json(alerts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /rasff/live/risk/:product/:origin - Check product risk
app.get('/rasff/live/risk/:product/:origin', (req, res) => {
  try {
    const risk = rasffScraper.checkProductRisk(req.params.product, req.params.origin);
    if (!risk) {
      return res.json({ message: 'No recent alerts found', riskLevel: 'LOW' });
    }
    res.json(risk);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /rasff/live/notifications - Get notifications
app.get('/rasff/live/notifications', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const notifications = rasffScraper.getNotifications(limit);
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /rasff/live/sync - Sync live alerts
app.post('/rasff/live/sync', async (req, res) => {
  try {
    const result = await rasffScraper.fetchLiveAlerts();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /rasff/live/stats - Get statistics
app.get('/rasff/live/stats', (req, res) => {
  try {
    const stats = rasffScraper.getStatistics();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// DOVU - Carbon Credits
// ============================================

// GET /dovu/projects - Get carbon projects
app.get('/dovu/projects', (req, res) => {
  try {
    const filters = {
      type: req.query.type,
      country: req.query.country,
      standard: req.query.standard
    };
    const projects = dovuIntegration.getProjects(filters);
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /dovu/projects/:id - Get project by ID
app.get('/dovu/projects/:id', (req, res) => {
  try {
    const project = dovuIntegration.getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json(project);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /dovu/projects/country/:country - Get projects by country
app.get('/dovu/projects/country/:country', (req, res) => {
  try {
    const projects = dovuIntegration.getProjectsByCountry(req.params.country);
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /dovu/calculate - Calculate carbon footprint
app.post('/dovu/calculate', (req, res) => {
  try {
    const { product, weightKg, originCountry } = req.body;
    const result = dovuIntegration.calculateCarbonFootprint(product, weightKg, originCountry);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /dovu/purchase - Purchase carbon credits
app.post('/dovu/purchase', (req, res) => {
  try {
    const { projectId, credits, exporterId, product, weightKg } = req.body;
    const result = dovuIntegration.purchaseCredits(projectId, credits, exporterId, product, weightKg);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /dovu/certificates - Get certificates
app.get('/dovu/certificates', (req, res) => {
  try {
    const { exporterId } = req.query;
    const certificates = exporterId 
      ? dovuIntegration.getCertificatesByExporter(exporterId)
      : dovuIntegration.getAllCertificates();
    res.json(certificates);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /dovu/certificates/validate/:id - Validate certificate
app.get('/dovu/certificates/validate/:id', (req, res) => {
  try {
    const result = dovuIntegration.validateCertificate(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /dovu/score/:exporterId - Get exporter sustainability score
app.get('/dovu/score/:exporterId', (req, res) => {
  try {
    const score = dovuIntegration.getExporterSustainabilityScore(req.params.exporterId);
    res.json(score);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /dovu/stats - Get statistics
app.get('/dovu/stats', (req, res) => {
  try {
    const stats = dovuIntegration.getStatistics();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /dovu/config - Get configuration
app.get('/dovu/config', (req, res) => {
  res.json(dovuIntegration.getConfig());
});

// ============================================
// USHAHIDI - Market & Security Alerts
// ============================================

// GET /ushahidi/alerts - Get alerts
app.get('/ushahidi/alerts', (req, res) => {
  try {
    const filters = {
      category: req.query.category,
      riskLevel: req.query.riskLevel,
      country: req.query.country,
      state: req.query.state
    };
    const alerts = ushahidiIntegration.getAlerts(filters);
    res.json(alerts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /ushahidi/alerts/critical - Get critical alerts
app.get('/ushahidi/alerts/critical', (req, res) => {
  try {
    const alerts = ushahidiIntegration.getCriticalAlerts();
    res.json(alerts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /ushahidi/alerts/security - Get security alerts
app.get('/ushahidi/alerts/security', (req, res) => {
  try {
    const alerts = ushahidiIntegration.getSecurityAlerts();
    res.json(alerts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /ushahidi/route/:route - Check route safety
app.get('/ushahidi/route/:route', (req, res) => {
  try {
    const safety = ushahidiIntegration.checkRouteSafety(req.params.route);
    res.json(safety);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /ushahidi/prices - Get market prices
app.get('/ushahidi/prices', (req, res) => {
  try {
    const { product, region } = req.query;
    const prices = ushahidiIntegration.getMarketPrices(product, region);
    res.json(prices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /ushahidi/prices/compare/:product - Price comparison
app.get('/ushahidi/prices/compare/:product', (req, res) => {
  try {
    const comparison = ushahidiIntegration.getPriceComparison(req.params.product);
    res.json(comparison);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /ushahidi/alerts - Add alert
app.post('/ushahidi/alerts', (req, res) => {
  try {
    const alert = ushahidiIntegration.addAlert(req.body);
    res.json(alert);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /ushahidi/alerts/:id/upvote - Upvote alert
app.post('/ushahidi/alerts/:id/upvote', (req, res) => {
  try {
    const alert = ushahidiIntegration.upvoteAlert(req.params.id);
    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    res.json(alert);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /ushahidi/region/:country - Get regional risk summary
app.get('/ushahidi/region/:country', (req, res) => {
  try {
    const summary = ushahidiIntegration.getRegionalRiskSummary(req.params.country);
    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /ushahidi/stats - Get statistics
app.get('/ushahidi/stats', (req, res) => {
  try {
    const stats = ushahidiIntegration.getStatistics();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /ushahidi/config - Get configuration
app.get('/ushahidi/config', (req, res) => {
  res.json(ushahidiIntegration.getConfig());
});

// ============================================
// EUDR Compliance - Deforestation-Free Verification
// ============================================

// POST /eudr/check - Check EUDR compliance
app.post('/eudr/check', async (req, res) => {
  try {
    const result = await eudrCompliance.checkEUDR(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /eudr/compliance/:shipmentId - Get compliance record
app.get('/eudr/compliance/:shipmentId', (req, res) => {
  try {
    const result = eudrCompliance.getCompliance(req.params.shipmentId);
    if (!result) {
      return res.status(404).json({ error: 'No compliance record found' });
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /eudr/records - Get all compliance records
app.get('/eudr/records', (req, res) => {
  try {
    const filters = {
      status: req.query.status,
      country: req.query.country,
      exporterId: req.query.exporterId
    };
    const records = eudrCompliance.getAllRecords(filters);
    res.json(records);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /eudr/stats - Get statistics
app.get('/eudr/stats', (req, res) => {
  try {
    const stats = eudrCompliance.getStatistics();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /eudr/records - Add compliance record
app.post('/eudr/records', (req, res) => {
  try {
    const result = eudrCompliance.addRecord(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /eudr/config - Get configuration
app.get('/eudr/config', (req, res) => {
  res.json(eudrCompliance.getConfig());
});

// ============================================
// Audit Logs
// ============================================

// GET /audit - Get audit logs
app.get('/audit', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const logs = deterministicEngine.getAllAuditLogs(limit);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /audit/:shipmentId - Get audit log for shipment
app.get('/audit/:shipmentId', (req, res) => {
  try {
    const logs = deterministicEngine.getAuditLog(req.params.shipmentId);
    if (!logs || logs.length === 0) {
      return res.status(404).json({ error: 'No audit logs found' });
    }
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Decision Accuracy Monitoring (Ground Truth)
// ============================================

// GET /decision/accuracy - Get accuracy metrics (with date range)
app.get('/decision/accuracy', (req, res) => {
  try {
    const { start, end } = req.query;
    const metrics = accuracyMonitor.getAccuracy(start, end);
    res.json(metrics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /decision/outcomes - Record actual outcome (ground truth)
app.post('/decision/outcomes', (req, res) => {
  try {
    const { shipment_id, actual_outcome, actual_loss_usd } = req.body;
    if (!shipment_id || !actual_outcome) {
      return res.status(400).json({ error: 'shipment_id and actual_outcome required' });
    }
    const result = accuracyMonitor.attachOutcome(shipment_id, actual_outcome, actual_loss_usd);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /decision/outcomes - Get all outcomes
app.get('/decision/outcomes', (req, res) => {
  try {
    const filters = {
      actual_outcome: req.query.outcome,
      product_type: req.query.product,
      port: req.query.port,
      has_actual: req.query.has_actual === 'true'
    };
    const outcomes = accuracyMonitor.getOutcomes(filters);
    res.json(outcomes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Fix Optimization Engine
// ============================================

// POST /decision/fix-plan - Optimize fix plan (NEW API per spec)
app.post('/decision/fix-plan', (req, res) => {
  try {
    const { shipment_id, risk_score, conditions, max_budget } = req.body;
    if (!conditions || !Array.isArray(conditions)) {
      return res.status(400).json({ error: 'conditions array required' });
    }
    const result = fixOptimizer.optimizeFixPlan({ 
      shipment_id, 
      risk_score: risk_score || 0.5, 
      conditions, 
      max_budget 
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /fix/optimize - Optimize fix plan (legacy)
app.post('/fix/optimize', (req, res) => {
  try {
    const { issues, max_budget } = req.body;
    if (!issues || !Array.isArray(issues)) {
      return res.status(400).json({ error: 'issues array required' });
    }
    // Convert issues to conditions format
    const conditions = issues.map(i => i.condition);
    const result = fixOptimizer.optimizeFixPlan({ conditions, max_budget });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /fix/rules - Get fix rules
app.get('/fix/rules', (req, res) => {
  try {
    const rules = fixOptimizer.getFixRules();
    res.json(rules);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /fix/rules - Add fix rule
app.post('/fix/rules', (req, res) => {
  try {
    const rule = fixOptimizer.addFixRule(req.body);
    res.json(rule);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Adversarial Detection Layer
// ============================================

// GET /adversarial/analyze/:actorType/:actorId - Analyze actor
app.get('/adversarial/analyze/:actorType/:actorId', (req, res) => {
  try {
    const { actorType, actorId } = req.params;
    const analysis = adversarialDetector.analyzeActor(actorId, actorType);
    res.json(analysis);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /adversarial/high-risk - Get high risk actors
app.get('/adversarial/high-risk', (req, res) => {
  try {
    const minRisk = parseFloat(req.query.min_risk) || 0.2;
    const actors = adversarialDetector.getHighRiskActors(minRisk);
    res.json(actors);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /adversarial/activity - Record actor activity
app.post('/adversarial/activity', (req, res) => {
  try {
    const { actor_id, actor_type, pattern_type, count } = req.body;
    if (!actor_id || !actor_type || !pattern_type) {
      return res.status(400).json({ error: 'actor_id, actor_type, pattern_type required' });
    }
    const result = adversarialDetector.recordActivity(actor_id, actor_type, pattern_type, count);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /adversarial/patterns - Get patterns
app.get('/adversarial/patterns', (req, res) => {
  try {
    const filters = {
      actor_type: req.query.actor_type,
      pattern_type: req.query.pattern_type,
      actor_id: req.query.actor_id
    };
    const patterns = adversarialDetector.getPatterns(filters);
    res.json(patterns);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /adversarial/config - Get configuration
app.get('/adversarial/config', (req, res) => {
  res.json(adversarialDetector.getConfig());
});

// POST /adversarial/apply - Apply adversarial penalties to shipment
app.post('/adversarial/apply', (req, res) => {
  try {
    const result = adversarialDetector.applyAdversarialPenalties(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Human Layer - Legal, Financial, Social Preconditions
// ============================================

// GET /human-layer/exporters - Get all exporters
app.get('/human-layer/exporters', (req, res) => {
  try {
    const exporters = humanLayer.getAllExporters();
    res.json(exporters);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /human-layer/exporter/:id - Get exporter details
app.get('/human-layer/exporter/:id', (req, res) => {
  try {
    const exporter = humanLayer.getExporter(req.params.id);
    if (!exporter) {
      return res.status(404).json({ error: 'Exporter not found' });
    }
    res.json(exporter);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /human-layer/exporter - Add/update exporter
app.post('/human-layer/exporter', (req, res) => {
  try {
    const exporter = humanLayer.upsertExporter(req.body);
    res.json(exporter);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /human-layer/validate - Validate exporter for shipment
app.post('/human-layer/validate', (req, res) => {
  try {
    const { exporter_id, decision } = req.body;
    if (!exporter_id) {
      return res.status(400).json({ error: 'exporter_id required' });
    }
    
    const validation = humanLayer.validateExporter(exporter_id);
    
    if (decision) {
      // Apply Human Layer to existing decision
      const enhancedDecision = humanLayer.applyToDecision(exporter_id, decision);
      res.json(enhancedDecision);
    } else {
      res.json(validation);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /human-layer/config - Get configuration
app.get('/human-layer/config', (req, res) => {
  res.json(humanLayer.getConfig());
});

// ============================================
// Execution Infrastructure Endpoints
// ============================================

// POST /execution/start - Start complete execution workflow
app.post('/execution/start', async (req, res) => {
  try {
    const executionInfra = require('./services/execution-infrastructure');
    const result = await executionInfra.executeShipment(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /execution/action - Execute a single action
app.post('/execution/action', async (req, res) => {
  try {
    const executionInfra = require('./services/execution-infrastructure');
    const { shipment_id, action_type, action_data } = req.body;
    
    if (!shipment_id || !action_type) {
      return res.status(400).json({ error: 'shipment_id and action_type required' });
    }
    
    const result = await executionInfra.executeAction(shipment_id, action_type, action_data || {});
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /execution/status/:shipmentId - Get execution status
app.get('/execution/status/:shipmentId', async (req, res) => {
  try {
    const executionInfra = require('./services/execution-infrastructure');
    const result = await executionInfra.getShipmentExecutionStatus(req.params.shipmentId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /execution/override - Record agent override
app.post('/execution/override', async (req, res) => {
  try {
    const executionInfra = require('./services/execution-infrastructure');
    const { shipment_id, system_output, user_action, reason } = req.body;
    
    if (!shipment_id || !user_action) {
      return res.status(400).json({ error: 'shipment_id and user_action required' });
    }
    
    const result = await executionInfra.recordOverride(
      shipment_id, 
      system_output, 
      user_action, 
      reason || ''
    );
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /execution/port/:portCode - Get port intelligence
app.get('/execution/port/:portCode', async (req, res) => {
  try {
    const executionTracking = require('./services/execution-tracking');
    const result = await executionTracking.getPortIntelligence(req.params.portCode);
    
    if (!result) {
      return res.status(404).json({ error: 'Port not found' });
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /execution/validity-check - Check document validity window
app.post('/execution/validity-check', async (req, res) => {
  try {
    const executionTracking = require('./services/execution-tracking');
    const { shipment_id, document_type } = req.body;
    
    if (!shipment_id || !document_type) {
      return res.status(400).json({ error: 'shipment_id and document_type required' });
    }
    
    const result = await executionTracking.checkValidityWindow(shipment_id, document_type);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

