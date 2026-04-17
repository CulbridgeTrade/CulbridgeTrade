const express = require('express');
const cors = require('cors');
const { readFileSync } = require('fs');
const path = require('path');
const { evaluateShipment, loadRulesFromJSON } = require('../engine/engine.js');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Load rules once
const rulesFile = path.join(__dirname, '../engine/rules-v1-core.json');
const rulesData = readFileSync(rulesFile, 'utf8');
const rules = loadRulesFromJSON(rulesData);

app.post('/evaluate', (req, res) => {
  try {
    const result = evaluateShipment(req.body.shipment, rules);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', rules_count: rules.length });
});

app.listen(PORT, () => {
  console.log(`Culbridge Production Rule Engine (v1 CORE): http://localhost:${PORT}/evaluate`);
  console.log(`Health: http://localhost:${PORT}/health`);
});

module.exports = app;

