const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { all, get, run } = require('../utils/db');

const ruleFiles = [
  'rules-v1.2-cocoa-nl.json', 'rules-v1.3-cocoa-de.json', 'rules-v1.2-sesame.json'
];

const rulesPath = path.join(__dirname, '.');

async function loadRules() {
  const allRules = [];
  for (const file of ruleFiles) {
    try {
      const data = await fs.readFile(path.join(rulesPath, file), 'utf8');
      const rules = JSON.parse(data);
      allRules.push(...(rules.rules || rules));
    } catch (e) {
      console.warn(`Failed to load ${file}:`, e.message);
    }
  }
  return { version: '1.2-multi', rules: allRules };
}

class RuleEngine {
  constructor() {
    this.ruleFiles = ruleFiles;
    this.rulesPath = rulesPath;
  }

  async loadShipment(shipmentId) {
    const shipment = await get('SELECT * FROM Shipments WHERE id = ?', [shipmentId]);
    if (!shipment) throw new Error(`Shipment ${shipmentId} not found`);

    const documents = await all('SELECT * FROM ShipmentDocuments WHERE shipment_id = ?', [shipmentId]);
    
    let lab = null;
    const labDoc = documents.find(d => d.doc_type === 'lab_report');
    if (labDoc && labDoc.lab_id) {
      lab = await get('SELECT * FROM Labs WHERE id = ?', [labDoc.lab_id]);
    }

    return {
      ...shipment,
      documents: documents.reduce((acc, d) => {
        acc[d.doc_type] = d;
        return acc;
      }, {}),
      lab,
      lab_iso_17025: lab ? lab.iso_17025 : false,
      lab_tier: lab ? lab.tier : null,
      lab_report_age_days: labDoc ? Math.floor((new Date() - new Date(labDoc.upload_date)) / (1000 * 60 * 60 * 24)) : Infinity,
      batch_mismatch: labDoc && labDoc.file_hash ? shipment.batch_number !== labDoc.file_hash.substring(0,12) : false,
      aflatoxin_test: null, 
      pesticide_test: null,
      phytosanitary_cert: documents.find(d => d.doc_type === 'phytosanitary_cert'),
      all_required_docs_present: documents.length >= 3,
      exporter_history_clean: true
    };
  }

  filterApplicableRules(shipment, allRules) {
    return allRules.rules.filter(rule => {
      const applies = rule.applies_to || {};
      return (!applies.destinations || applies.destinations.includes(shipment.destination)) &&
             (!applies.products || applies.products.includes(shipment.product)) &&
             (!applies.categories || applies.categories.includes(shipment.category));
    });
  }

  evaluateRule(shipment, rule) {
    for (const [key, val] of Object.entries(rule.conditions)) {
      const shipmentVal = shipment[key];
      if (typeof val === 'object') {
        // e.g. {gt: 180}
        if (val.gt !== undefined && shipmentVal <= val.gt) return false;
      } else if (shipmentVal !== val) {
        return false;
      }
    }
    return true;
  }

  async logRuleEnhanced(shipmentId, rule, result, snapshot, prevScore, newScore) {
    const snapshotStr = JSON.stringify(snapshot);
    const immutableHash = crypto.createHash('sha256').update(snapshotStr + Date.now()).digest('hex');
    
    await run(`
      INSERT INTO RuleLogs (shipment_id, rule_id, rule_version, rule_type, result, reason, immutable_snapshot, lab_batch_number, document_source, previous_score, new_score, immutable_hash)
      VALUES (?, ?, '1.0', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [shipmentId, rule.id, rule.type, result, rule.reason || '', snapshotStr, snapshot.lab_batch_number || 'N/A', 'lab_report', prevScore, newScore, immutableHash]);
  }

  async executeHardGates(shipmentId, shipment, rules) {
    const hardGates = rules.filter(r => r.type === 'HARD_GATE');
    const blockers = [];
    let score = 100;
    for (const rule of hardGates) {
      const triggered = this.evaluateRule(shipment, rule);
      await this.logRuleEnhanced(shipmentId, rule, triggered ? 'BLOCKED' : 'PASS', shipment, score, triggered ? 0 : score);
      if (triggered) {
        blockers.push(rule.reason);
        score = 0;
      }
    }
    if (blockers.length > 0) {
      return { status: 'BLOCKED', health_score: 0, blockers, critical_issues: [], warnings: [], verified: [] };
    }
    return null;
  }

  async executePenalties(shipmentId, shipment, rules) {
    let score = 100;
    const critical_issues = [];
    const warnings = [];
    const penalties = rules.filter(r => r.type === 'PENALTY');
    for (const rule of penalties) {
      const triggered = this.evaluateRule(shipment, rule);
      const prevScore = score;
      if (triggered) {
        score += rule.score_adjustment;
        if (rule.severity === 'critical') critical_issues.push(rule.reason);
        else warnings.push(rule.reason);
      }
      await this.logRuleEnhanced(shipmentId, rule, triggered ? 'FAIL' : 'PASS', shipment, prevScore, score);
    }
    return { score, critical_issues, warnings };
  }

  async executeTrustSignals(shipmentId, shipment, rules) {
    const trustSignals = rules.filter(r => r.type === 'TRUST_SIGNAL');
    let scoreBonus = 0;
    const verified = [];
    let score = 100; // assume from penalties
    for (const rule of trustSignals) {
      const triggered = this.evaluateRule(shipment, rule);
      const prevScore = score;
      if (triggered) {
        scoreBonus += rule.score_adjustment;
        verified.push(rule.reason);
      }
      await this.logRuleEnhanced(shipmentId, rule, triggered ? 'PASS' : 'FAIL', shipment, prevScore, score + scoreBonus);
    }
    return { scoreBonus, verified };
  }

  computeStatus(score) {
    if (score >= 90) return 'SAFE';
    if (score >= 70) return 'WARNING';
    if (score >= 40) return 'HIGH_RISK';
    return 'BLOCKED';
  }

  computeConfidence(shipment) {
    let confidence = 100;
    if (!shipment.lab) confidence -= 30;
    if (shipment.batch_mismatch) confidence -= 20;
    if (shipment.documents.length === 0) confidence -= 10;
    const level = confidence >= 80 ? 'HIGH' : confidence >= 60 ? 'MEDIUM' : 'LOW';
    return level;
  }

  async saveEvaluation(shipmentId, evalData) {
    await run(`
      INSERT INTO ShipmentEvaluations (shipment_id, status, health_score, confidence_level, blockers, critical_issues, warnings, verified)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [shipmentId, evalData.status, evalData.health_score, evalData.confidence_level,
        JSON.stringify(evalData.blockers || []),
        JSON.stringify(evalData.critical_issues || []),
        JSON.stringify(evalData.warnings || []),
        JSON.stringify(evalData.verified || [])
    ]);
  }

  async evaluate(shipmentId) {
    const shipment = await this.loadShipment(shipmentId);
    const allRules = await this.loadRules();
    const applicableRules = this.filterApplicableRules(shipment, allRules);

    const hardGateResult = await this.executeHardGates(shipmentId, shipment, applicableRules);
    if (hardGateResult) {
      await this.saveEvaluation(shipmentId, hardGateResult);
      return hardGateResult;
    }

    const penaltyResult = await this.executePenalties(shipmentId, shipment, applicableRules);
    let score = penaltyResult.score;

    const trustResult = await this.executeTrustSignals(shipmentId, shipment, applicableRules);
    score += trustResult.scoreBonus;
    score = Math.max(0, Math.min(100, score));

    const status = this.computeStatus(score);
    const confidence_level = this.computeConfidence(shipment);

    const output = {
      shipment_id: shipmentId,
      status,
      health_score: Math.round(score),
      confidence_level,
      blockers: [],
      critical_issues: penaltyResult.critical_issues,
      warnings: penaltyResult.warnings,
      verified: trustResult.verified,
      timestamp: Math.floor(Date.now() / 1000)
    };

    await this.saveEvaluation(shipmentId, output);
    return output;
  }
}

module.exports = RuleEngine;

