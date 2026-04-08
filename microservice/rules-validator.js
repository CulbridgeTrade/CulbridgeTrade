const { Engine } = require('json-rules-engine');
const express = require('express');
const { all } = require('../utils/db');

const app = express();
app.use(express.json());

let rulesEngine;

async function loadRules() {
const rulesData = JSON.parse(require('fs').readFileSync('./engine/rules-v1.0-fixed.json', 'utf8'));
  rulesEngine = new Engine();
  
  for (const rule of rulesData.rules) {
    await rulesEngine.addRule({
      conditions: {
        all: Object.entries(rule.conditions).map(([k, v]) => ({
          fact: k,
          operator: typeof v === 'object' ? 'greaterThan' : 'equal',
          value: typeof v === 'object' ? v.gt : v
        }))
      },
      event: {
        type: rule.type,
        params: {
          score_adjustment: rule.score_adjustment || 0,
          reason: rule.reason
        }
      }
    });
  }
}

loadRules();

app.post('/validate', async (req, res) => {
  try {
    const { shipment } = req.body;
    const facts = await loadShipmentFacts(shipment.id);
    
    const { events } = await rulesEngine.run(facts);
    
    const result = {
      shipment_id: shipment.id,
      triggered: events.map(e => e.params),
      validated: true
    };
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

async function loadShipmentFacts(shipmentId) {
  // Load from DB + ML + satellite
  const ml = require('../services/ml-models');
  const sentinel = require('../services/sentinel-hub');
  
  const baseFacts = {}; // from DB
  const mlRisk = await ml.ensemblePrediction([0.5, 0.3]); // features
  const cropHealth = await sentinel.cropHealthIndex(6.5, 3.3);
  
  return {
    ...baseFacts,
    ml_risk: mlRisk.ensemble_risk,
    ndvi_health: cropHealth.health,
    eudr_compliant: true
  };
}

app.listen(3001, () => {
  console.log('Rules microservice: http://localhost:3001/validate');
});

module.exports = app;

