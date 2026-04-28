/**
 * CULBRIDGE EVALUATION PIPELINE v1.0
 * Phase 1: RuleResult Standardization Orchestrator
 * 
 * Runs ALL engines → Unified RuleResult[] → Audit logging
 * 
 * Execution Order:
 * 1. ruleEngine.js (deterministic rules)  
 * 2. engine.js (scoring engine)
 * 3. decision-engine.js (financial decisions)
 * 4. Aggregate → complianceStatus
 */

const RuleEngineClass = require('./ruleEngine');
const ScoringEngine = require('./engine');
const DecisionEngine = require('../utils/decision-engine');
const db = require('../utils/db');
const { LabResult } = require('./schemas/lab');

/**
 * Unified RuleResult interface (Phase 1 spec)
 */
class RuleResult {
  constructor(ruleId, status, inputSnapshot, message = '') {
    this.ruleId = ruleId;
    this.status = status; // 'PASS'|'WARNING'|'BLOCKER'
    this.inputSnapshot = inputSnapshot;
    this.evaluatedAt = new Date().toISOString();
    this.message = message;
  }

  /**
   * Log to evaluation_events table (immutable audit)
   */
  async log(shipmentId) {
    await db.run(`
      INSERT INTO evaluation_events (shipment_id, rule_id, status, input_snapshot, message, evaluated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [shipmentId, this.ruleId, this.status, JSON.stringify(this.inputSnapshot), this.message, this.evaluatedAt]);
  }
}

/**
 * Evaluation Pipeline - Single source of truth
 */
class EvaluationPipeline {
  constructor() {
    this.ruleEngine = new RuleEngineClass();
    this.scoringEngine = new ScoringEngine();
    this.decisionEngine = new DecisionEngine();
  }

  /**
   * MAIN ENTRYPOINT: shipment → RuleResult[]
   */
  async evaluate(shipmentId, rawShipment) {
    const ruleResults = [];
    const startTime = Date.now();

    try {
      // STEP 1: Deterministic Rules (ruleEngine.js)
      const ruleOutput = this.ruleEngine.runRules(rawShipment);
      for (const flag of ruleOutput.flags || []) {
        const result = new RuleResult(
          flag.ruleId || 'UNKNOWN_RULE',
          flag.severity || 'WARNING',
          { flags: ruleOutput.flags, docs: rawShipment.documents },
          flag.message || 'Rule triggered'
        );
        await result.log(shipmentId);
        ruleResults.push(result);
      }

      // STEP 2: Scoring Engine (engine.js) 
      const scoreOutput = await this.scoringEngine.evaluate(shipmentId);
      // Wrap scores as RuleResults (threshold violations)
      const scoreResult = new RuleResult(
        'SCORING_ENGINE',
        scoreOutput.status === 'BLOCKED' ? 'BLOCKER' : 
        scoreOutput.status === 'WARNING' ? 'WARNING' : 'PASS',
        scoreOutput,
        `Health score: ${scoreOutput.health_score}, Confidence: ${scoreOutput.confidence_level}`
      );
      await scoreResult.log(shipmentId);
      ruleResults.push(scoreResult);

      // STEP 3: Decision Engine (financial layer)
      const decisionOutput = await this.decisionEngine.predictDecision(rawShipment);
      const decisionResult = new RuleResult(
        'DECISION_ENGINE',
        decisionOutput.decision === 'DO_NOT_SHIP' || decisionOutput.decision === 'INSUFFICIENT_DATA' ? 'BLOCKER' :
        decisionOutput.decision === 'REVIEW_REQUIRED' ? 'WARNING' : 'PASS',
        decisionOutput,
        `Decision: ${decisionOutput.decision}, Expected Loss: $${decisionOutput.expected_loss_usd}`
      );
      await decisionResult.log(shipmentId);
      ruleResults.push(decisionResult);

      // STEP 4: Derive aggregated compliance status
      const blockers = ruleResults.filter(r => r.status === 'BLOCKER').length;
      const warnings = ruleResults.filter(r => r.status === 'WARNING').length;
      
      const complianceStatus = blockers > 0 ? 'BLOCKER' :
                              warnings > 0 ? 'WARNING' : 'PASS';
      
      const submissionReady = complianceStatus === 'PASS';

      // STEP 5: Update shipment status
      await db.run(`
        UPDATE Shipments 
        SET compliance_status = ?, submission_ready = ?, last_evaluated_at = datetime('now')
        WHERE id = ?
      `, [complianceStatus, submissionReady ? 1 : 0, shipmentId]);

      // FINAL OUTPUT
      return {
        shipmentId,
        evaluationId: `eval_${Date.now()}`,
        ruleResults,
        summary: {
          complianceStatus,
          submissionReady,
          totalRules: ruleResults.length,
          blockers: blockers,
          warnings: warnings,
          executionTimeMs: Date.now() - startTime
        },
        evaluatedAt: new Date().toISOString()
      };

    } catch (error) {
      // Emergency audit log
      const errorResult = new RuleResult('PIPELINE_ERROR', 'BLOCKER', { error: error.message, shipment: rawShipment }, error.message);
      await errorResult.log(shipmentId);
      
      return {
        shipmentId,
        evaluationId: `error_${Date.now()}`,
        ruleResults: [errorResult],
        summary: { complianceStatus: 'ERROR', submissionReady: false, error: error.message },
        evaluatedAt: new Date().toISOString()
      };
    }
  }
}

module.exports = { EvaluationPipeline, RuleResult };
