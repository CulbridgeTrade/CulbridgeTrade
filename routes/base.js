/**
 * Culbridge API Routes - Modular Route Definitions
 * Split from monolithic server.js for maintainability
 */

const express = require('express');
const router = express.Router();
const { initDB } = require('../utils/db');

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// GET /labs?tier=1
router.get('/labs', async (req, res) => {
  try {
    const { tier } = req.query;
    const where = tier ? 'WHERE tier = ?' : '';
    const labs = await require('../utils/db').all(`SELECT * FROM Labs ${where}`, tier ? [tier] : []);
    res.json(labs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /shipments/:id/evaluations
router.get('/shipments/:id/evaluations', async (req, res) => {
  try {
    const { id } = req.params;
    const evals = await require('../utils/db').all(
      'SELECT * FROM ShipmentEvaluations WHERE shipment_id = ? ORDER BY evaluated_at DESC', [id]
    );
    const logs = await require('../utils/db').all(
      'SELECT * FROM RuleLogs WHERE shipment_id = ? ORDER BY timestamp DESC', [id]
    );
    res.json({ evaluations: evals, rule_logs: logs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
