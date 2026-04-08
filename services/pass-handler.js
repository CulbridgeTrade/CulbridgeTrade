/**
 * Culbridge PASS_HANDLER Service
 * 
 * CRITICAL INFRASTRUCTURE - Ground Truth Capture & Learning System
 * 
 * When a shipment passes, this service:
 * 1. Captures real-world outcome (ground truth)
 * 2. Validates prediction vs reality
 * 3. Updates confidence scores per route/product/cert
 * 4. Builds proven compliance templates
 * 5. Makes Culbridge smarter over time
 * 
 * This is the moat - without it, Culbridge is just a validator.
 */

const crypto = require('crypto');
const { db } = require('../utils/db');

class PassHandlerService {
  
  /**
   * Record real-world clearance outcome
   * 
   * @param {Object} input - Pass outcome data
   * @returns {Object} - Processing result
   */
  async recordPassOutcome(input) {
    const {
      shipment_id,
      real_world_outcome,
      clearance_reference,
      port,
      destination_country,
      notes,
      module_outputs,
      attachments
    } = input;

    // 1. Validate shipment exists
    const shipment = await db.get('SELECT * FROM Shipments WHERE id = ?', [shipment_id]);
    if (!shipment) {
      throw new Error(`Shipment ${shipment_id} not found`);
    }

    // 2. Capture ground truth - append to immutable table
    const outcome_id = `OUT-${Date.now()}`;
    const outcomeTimestamp = new Date().toISOString();
    const payload_hash = this.computePayloadHash(input);

    await db.run(`
      INSERT INTO ShipmentOutcomes 
      (outcome_id, shipment_id, real_world_outcome, clearance_reference, clearance_timestamp, port, destination_country, notes, payload_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      outcome_id,
      shipment_id,
      real_world_outcome,
      clearance_reference,
      outcomeTimestamp,
      port,
      destination_country,
      notes,
      payload_hash
    ]);

    // 3. Validate prediction vs reality
    const predicted_status = shipment.predicted_status || 'COMPLIANT';
    const accuracyStatus = this.computeAccuracyStatus(predicted_status, real_world_outcome);
    
    const accuracy_id = `ACC-${Date.now()}`;
    await db.run(`
      INSERT INTO PredictionAccuracy
      (accuracy_id, shipment_id, predicted_status, real_world_outcome, accuracy_status, module_details)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      accuracy_id,
      shipment_id,
      predicted_status,
      real_world_outcome,
      accuracyStatus,
      JSON.stringify(module_outputs || {})
    ]);

    // 4. Update confidence scores
    const confidenceUpdate = await this.updateConfidenceScore(shipment, real_world_outcome);

    // 5. Build or update proven templates
    const templateUpdate = await this.updateProvenTemplate(shipment, real_world_outcome, payload_hash);

    // 6. Update shipment with clearance reference
    await db.run(`
      UPDATE Shipments 
      SET clearance_reference = ?, clearance_timestamp = ?, real_world_outcome = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [clearance_reference, outcomeTimestamp, real_world_outcome, shipment_id]);

    return {
      status: 'SUCCESS',
      shipment_id,
      outcome_id,
      prediction_accuracy: accuracyStatus,
      confidence_score_updated: confidenceUpdate.newScore,
      proven_template_updated: templateUpdate.updated,
      proven_count: templateUpdate.provenCount
    };
  }

  /**
   * Compute accuracy status based on prediction vs reality
   */
  computeAccuracyStatus(predicted_status, real_world_outcome) {
    if (predicted_status === 'COMPLIANT' && real_world_outcome === 'PASSED') {
      return 'CORRECT';
    } else if (predicted_status === 'COMPLIANT' && real_world_outcome === 'REJECTED') {
      return 'DANGEROUS'; // System predicted wrong - high risk
    } else if (predicted_status === 'NON-COMPLIANT' && real_world_outcome === 'PASSED') {
      return 'OVER-RESTRICTIVE'; // System was too strict
    }
    return 'UNKNOWN';
  }

  /**
   * Compute payload hash for integrity
   */
  computePayloadHash(input) {
    const payload = JSON.stringify({
      shipment_id: input.shipment_id,
      real_world_outcome: input.real_world_outcome,
      clearance_reference: input.clearance_reference,
      port: input.port,
      timestamp: new Date().toISOString()
    });
    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  /**
   * Update confidence score for route/product/cert combination
   */
  async updateConfidenceScore(shipment, real_world_outcome) {
    const route = this.computeRoute(shipment);
    const commodity_type = shipment.category || shipment.product;
    const certificates = await this.getRequiredCertificates(shipment.id);
    
    // Check if score exists
    const existingScore = await db.get(`
      SELECT * FROM ConfidenceScores 
      WHERE route = ? AND product_id = ? AND certificates = ?
    `, [route, shipment.product, JSON.stringify(certificates)]);

    const isPass = real_world_outcome === 'PASSED';
    
    if (existingScore) {
      // Update existing score
      const newProven = existingScore.proven_shipments + (isPass ? 1 : 0);
      const newTotal = existingScore.total_shipments + 1;
      const newScore = newTotal > 0 ? newProven / newTotal : 0;

      await db.run(`
        UPDATE ConfidenceScores
        SET proven_shipments = ?, total_shipments = ?, confidence_score = ?, last_updated = CURRENT_TIMESTAMP
        WHERE score_id = ?
      `, [newProven, newTotal, newScore, existingScore.score_id]);

      return {
        previousScore: existingScore.confidence_score,
        newScore: newScore,
        provenCount: newProven,
        totalCount: newTotal
      };
    } else {
      // Create new score
      const score_id = `CS-${Date.now()}`;
      const proven = isPass ? 1 : 0;
      const total = 1;
      const score = proven / total;

      await db.run(`
        INSERT INTO ConfidenceScores
        (score_id, route, product_id, commodity_type, certificates, hs_code, proven_shipments, total_shipments, confidence_score)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        score_id,
        route,
        shipment.product,
        commodity_type,
        JSON.stringify(certificates),
        shipment.hs_code,
        proven,
        total,
        score
      ]);

      return {
        newScore: score,
        provenCount: proven,
        totalCount: total
      };
    }
  }

  /**
   * Update or create proven compliance template
   */
  async updateProvenTemplate(shipment, real_world_outcome, payload_hash) {
    if (real_world_outcome !== 'PASSED') {
      return { updated: false, provenCount: 0 };
    }

    const route = this.computeRoute(shipment);
    const commodity_type = shipment.category || shipment.product;
    const certificates = await this.getRequiredCertificates(shipment.id);

    // Check if template exists
    const existingTemplate = await db.get(`
      SELECT * FROM ProvenTemplates 
      WHERE route = ? AND product_id = ? AND certificates = ? AND destination_country = ?
    `, [route, shipment.product, JSON.stringify(certificates), shipment.destination]);

    if (existingTemplate) {
      // Update existing template
      const newCount = existingTemplate.proven_count + 1;
      
      await db.run(`
        UPDATE ProvenTemplates
        SET proven_count = ?, last_used_at = CURRENT_TIMESTAMP
        WHERE template_id = ?
      `, [newCount, existingTemplate.template_id]);

      return { updated: true, provenCount: newCount };
    } else {
      // Create new template
      const template_id = `TMPL-${Date.now()}`;
      
      await db.run(`
        INSERT INTO ProvenTemplates
        (template_id, route, product_id, commodity_type, certificates, hs_code, destination_country, proven_count, payload_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        template_id,
        route,
        shipment.product,
        commodity_type,
        JSON.stringify(certificates),
        shipment.hs_code,
        shipment.destination,
        1,
        payload_hash
      ]);

      return { updated: true, provenCount: 1 };
    }
  }

  /**
   * Compute route from shipment
   */
  computeRoute(shipment) {
    // Format: NG-DE, NG-NL, etc.
    const origin = 'NG'; // Nigeria
    const destination = this.getCountryCode(shipment.destination);
    return `${origin}-${destination}`;
  }

  /**
   * Get country code from destination name
   */
  getCountryCode(destination) {
    const codes = {
      'Netherlands': 'NL',
      'Germany': 'DE',
      'Belgium': 'BE',
      'France': 'FR',
      'Italy': 'IT',
      'Spain': 'ES',
      'United Kingdom': 'UK'
    };
    return codes[destination] || 'XX';
  }

  /**
   * Get required certificates for shipment
   */
  async getRequiredCertificates(shipment_id) {
    const docs = await db.all(`
      SELECT doc_type FROM ShipmentDocuments WHERE shipment_id = ?
    `, [shipment_id]);
    
    return docs.map(d => d.doc_type);
  }

  /**
   * Get proven templates for UI suggestions
   */
  async getProvenTemplates(route, product_id) {
    let query = 'SELECT * FROM ProvenTemplates WHERE 1=1';
    const params = [];

    if (route) {
      query += ' AND route = ?';
      params.push(route);
    }
    if (product_id) {
      query += ' AND product_id = ?';
      params.push(product_id);
    }

    query += ' ORDER BY proven_count DESC LIMIT 10';

    return await db.all(query, params);
  }

  /**
   * Get confidence scores for analytics
   */
  async getConfidenceScores(route, product_id) {
    let query = 'SELECT * FROM ConfidenceScores WHERE 1=1';
    const params = [];

    if (route) {
      query += ' AND route = ?';
      params.push(route);
    }
    if (product_id) {
      query += ' AND product_id = ?';
      params.push(product_id);
    }

    query += ' ORDER BY confidence_score DESC';

    return await db.all(query, params);
  }

  /**
   * Get accuracy summary for dashboard
   */
  async getAccuracySummary() {
    return await db.all(`
      SELECT * FROM AccuracySummary ORDER BY accuracy_rate DESC
    `);
  }

  /**
   * Trigger PASS_HANDLER from webhook (NSW port event)
   */
  async triggerFromWebhook(webhookData) {
    const { shipment_id, event_type, clearance_reference, port_event } = webhookData;

    if (event_type === 'cargo_arrived' || event_type === 'exit_note_issued') {
      // Real-world outcome determined
      return await this.recordPassOutcome({
        shipment_id,
        real_world_outcome: 'PASSED', // If exit note issued, passed
        clearance_reference: clearance_reference || `AUTO-${Date.now()}`,
        port: port_event || 'Lagos',
        notes: `Auto-triggered from NSW webhook: ${event_type}`,
        module_outputs: {} // Could pull from stored evaluations
      });
    }

    return { status: 'SKIPPED', reason: 'Event type not outcome-determining' };
  }
}

/**
 * API ENDPOINTS IMPLEMENTATION
 */

// POST /v1/shipments/:shipment_id/pass
// Record real-world clearance outcome
async function handlePassOutcome(req, res) {
  try {
    const { shipment_id } = req.params;
    const service = new PassHandlerService();
    
    const result = await service.recordPassOutcome({
      shipment_id,
      ...req.body
    });

    res.json(result);
  } catch (error) {
    console.error('Pass handler error:', error);
    res.status(500).json({ error: error.message });
  }
}

// GET /v1/shipments/:shipment_id/proven
// Retrieve proven patterns for this shipment
async function getProvenPatterns(req, res) {
  try {
    const { shipment_id } = req.params;
    const service = new PassHandlerService();

    // Get shipment to find route/product
    const shipment = await db.get('SELECT * FROM Shipments WHERE id = ?', [shipment_id]);
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
}

// GET /v1/confidence-scores
// Analytics for dashboard
async function getConfidenceScores(req, res) {
  try {
    const { route, product_id } = req.query;
    const service = new PassHandlerService();

    const scores = await service.getConfidenceScores(route, product_id);

    res.json({
      count: scores.length,
      scores: scores.map(s => ({
        route: s.route,
        product_id: s.product_id,
        commodity_type: s.commodity_type,
        certificates: JSON.parse(s.certificates),
        hs_code: s.hs_code,
        confidence_score: s.confidence_score,
        proven_shipments: s.proven_shipments,
        total_shipments: s.total_shipments
      }))
    });
  } catch (error) {
    console.error('Get confidence scores error:', error);
    res.status(500).json({ error: error.message });
  }
}

// GET /v1/accuracy-summary
// Prediction accuracy metrics
async function getAccuracySummary(req, res) {
  try {
    const service = new PassHandlerService();
    const summary = await service.getAccuracySummary();

    res.json({
      summary: summary.map(s => ({
        route: s.route,
        product_id: s.product_id,
        total_evaluated: s.total_evaluated,
        correct_predictions: s.correct_predictions,
        dangerous_predictions: s.dangerous_predictions,
        over_restrictive: s.over_restrictive,
        accuracy_rate: s.accuracy_rate
      }))
    });
  } catch (error) {
    console.error('Get accuracy summary error:', error);
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  PassHandlerService,
  handlePassOutcome,
  getProvenPatterns,
  getConfidenceScores,
  getAccuracySummary
};

if (require.main === module) {
  console.log('PASS_HANDLER Service loaded');
  console.log('Use: recordPassOutcome({ shipment_id, real_world_outcome, clearance_reference, ... })');
}