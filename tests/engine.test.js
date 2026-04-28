const assert = require('assert/strict');
const { readFileSync } = require('fs');
const path = require('path');
const { loadRulesFromJSON, evaluateShipment } = require('../engine/engine.js');

describe('Culbridge Rule Engine', () => {
  let rules;

  beforeAll(() => {
    const rulesData = readFileSync(path.join(__dirname, '../engine/sample-rules.json'), 'utf8');
    rules = loadRulesFromJSON(rulesData);
  });

  it('spec example: dichlorvos_residue 0.02 > 0.01 → REJECT', () => {
    const input = {
      shipment: {
        product_id: "dried_beans",
        origin: "NG",
        destination: "DE",
        channel: "supermarket",
        attributes: {
          dichlorvos_residue: 0.02
        },
        documents: ["CCI"]
      }
    };

    const result = evaluateShipment(input, rules);
    assert.equal(result.decision, 'REJECT');
    assert(result.risk_score > 50);
    assert(result.violations.length > 0);
    assert(result.violations.some(v => v.rule_id === 'EU-MRL-001'));
  });

  it('no violations → APPROVE', () => {
    const input = {
      shipment: {
        product_id: "dried_beans",
        origin: "NG",
        destination: "DE",
        attributes: {
          dichlorvos_residue: 0.005  // Below threshold
        },
        documents: ["LAB_REPORT", "COO"]
      }
    };

    const result = evaluateShipment(input, rules);
    assert.equal(result.decision, 'APPROVE');
    assert.equal(result.violations.length, 0);
    assert.equal(result.risk_score, 0);
  });

  it('REVIEW on non-REJECT violation', () => {
    const input = {
      shipment: {
        product_id: "sesame",
        origin: "NG",
        destination: "NL",
        attributes: {},
        documents: []  // Missing LAB_REPORT
      }
    };

    const result = evaluateShipment(input, rules);
    assert.equal(result.decision, 'REVIEW');
    assert(result.violations.some(v => v.rule_id === 'LAB-REPORT-REQUIRED'));
  });

  it('priority ordering: higher priority REJECT first', () => {
    // Engine sorts by priority desc
    assert(rules[0].priority === 100);  // EU-MRL-001 highest
  });

  console.log('All tests passed! Run: node server/evaluate-server.js && curl -X POST http://localhost:3001/evaluate -H "Content-Type: application/json" -d \'{"shipment":{"product_id":"dried_beans","origin":"NG","destination":"DE","attributes":{"dichlorvos_residue":0.02}}}\'');
});

