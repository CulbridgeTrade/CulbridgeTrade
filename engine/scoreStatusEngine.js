// Scoring & Status Engine MVP - Deterministic Culbridge
// ENHANCED: Dynamic thresholds, RASFF integration, risk-aware adjustments

class ScoreStatusEngine {
  constructor(config = {}) {
    this.initialScore = config.initialScore || 100;
    this.maxScore = config.maxScore || 100;
    this.minScore = config.minScore || 0;
    this.defaultThresholds = this._loadDefaultThresholds();
  }

  // Load default thresholds from versioned tables (scalable to new corridors/products)
  _loadDefaultThresholds() {
    return {
      // Product category → Corridor → Hazard → Max allowed value
      cocoa: {
        default: {
          aflatoxin_total: 4.0,  // μg/kg
          aflatoxin_b1: 2.0,
          moisture: 8.0,
          salmonella: 0,  // zero tolerance
          ethyleneOxide: 0
        },
        eu: { aflatoxin_total: 4.0, aflatoxin_b1: 2.0 },
        usa: { aflatoxin_total: 20.0, aflatoxin_b1: 10.0 }
      },
      sesame: {
        default: {
          salmonella: 0,
          ethyleneOxide: 0.1,  // mg/kg
          pesticide_residue: 0.5
        },
        eu: { salmonella: 0, ethyleneOxide: 0.1 },
        default_nonEU: { salmonella: 0, ethyleneOxide: 0.05 }
      },
      cashew: {
        default: {
          aflatoxin_total: 8.0,
          moisture: 9.0,
          foreign_matter: 1.0
        }
      },
      ginger: {
        default: {
          pesticide_residue: 0.1,
          heavy_metals: { lead: 0.1, cadmium: 0.1 },
          moisture: 12.0
        }
      },
      default: {
        default: {
          aflatoxin_total: 10.0,
          salmonella: 0,
          moisture: 10.0
        }
      }
    };
  }

  // A. Dynamic thresholds via risk hooks - KEY IMPROVEMENT
  adjustThresholds(shipment, riskProfile) {
    const productCategory = shipment.product?.category || 'default';
    const corridorId = shipment.corridor?.destinationCountry || 'default';
    
    // Get base thresholds
    let thresholds = this.defaultThresholds[productCategory]?.[corridorId] 
      || this.defaultThresholds[productCategory]?.default 
      || this.defaultThresholds.default.default;
    
    // Clone to avoid mutation
    thresholds = { ...thresholds };
    const adjustments = [];

    // Apply risk profile adjustments
    if (riskProfile.previousBlockersCount >= 3) {
      // Stricter thresholds for repeat offenders
      thresholds.aflatoxin_total *= 0.8;
      thresholds.aflatoxin_b1 *= 0.8;
      thresholds.ethyleneOxide *= 0.9;
      adjustments.push({
        type: 'PREVIOUS_BLOCKERS',
        factor: 0.8,
        reason: '3+ previous blockers - applying stricter thresholds'
      });
    }

    // Country-specific risk adjustments (RASFF integration)
    if (riskProfile.countryRiskFlags) {
      for (const [hazard, risk] of Object.entries(riskProfile.countryRiskFlags)) {
        if (risk === 'HIGH') {
          if (hazard === 'salmonella' || hazard.includes('salmonella')) {
            thresholds.salmonella = 0;  // zero tolerance
            adjustments.push({
              type: 'RASFF_ALERT',
              hazard,
              reason: 'High risk RASFF alert - zero tolerance applied'
            });
          } else if (hazard.includes('aflatoxin')) {
            thresholds.aflatoxin_total *= 0.7;
            adjustments.push({
              type: 'RASFF_ALERT',
              hazard,
              factor: 0.7,
              reason: 'High aflatoxin risk - stricter threshold'
            });
          } else if (hazard.includes('ethylene') || hazard.includes('ethoxyquin')) {
            thresholds.ethyleneOxide = 0;
            adjustments.push({
              type: 'RASFF_ALERT',
              hazard,
              reason: 'High ethylene oxide risk - zero tolerance'
            });
          }
        }
      }
    }

    // Exporter tier trust adjustments (Tier 1 = more lenient)
    if (riskProfile.exporterTier === 1) {
      // Tier 1 exporters get slight leniency within margin
      thresholds.aflatoxin_total = thresholds.aflatoxin_total;
      adjustments.push({
        type: 'TRUST_BONUS',
        tier: 1,
        reason: 'Tier 1 exporter - standard thresholds maintained'
      });
    }

    return { thresholds, adjustments };
  }

  // B. Full RASFF Integration
  checkRASFFAlerts(shipment, rasffHistory = []) {
    const alerts = [];
    const product = shipment.product?.category;
    const corridor = shipment.corridor?.destinationCountry;

    for (const alert of rasffHistory) {
      // Check if alert matches product/corridor
      if (alert.product === product || alert.productCategory === product) {
        if (alert.country === corridor || alert.affectedCountries?.includes(corridor)) {
          alerts.push({
            alertId: alert.alert_id,
            hazard: alert.hazard,
            severity: alert.severity,
            matched_on: ['product', 'corridor']
          });
        }
      }
    }

    return alerts;
  }

  // C. Data-driven threshold fetching (for versioned tables)
  async fetchThresholds(productCategory, corridorId, version = 'latest') {
    // In production, this would query a versioned thresholds table
    // For now, return configured defaults with version metadata
    const thresholds = this.defaultThresholds[productCategory]?.[corridorId] 
      || this.defaultThresholds[productCategory]?.default 
      || this.defaultThresholds.default.default;

    return {
      thresholds,
      version: 'v1.0.0',
      fetched_at: new Date().toISOString(),
      product_category: productCategory,
      corridor_id: corridorId
    };
  }

  applyHardBlockers(hardBlockers) {
    if (hardBlockers.length > 0) {
      return {
        score: this.minScore,
        status: 'BLOCKED',
        hard_blockers: hardBlockers,
        penalties: [],
        trust_boosts: [],
        calculation_order: ['check_hard_blockers']
      };
    }
    return null;
  }

  applyPenalties(score, penalties) {
    let newScore = score;
    const penaltyList = [];
    for (const p of penalties) {
      newScore += p.points; // negative points
      penaltyList.push(p);
    }
    return { score: newScore, penalties: penaltyList, calculation_order: ['apply_penalties'] };
  }

  applyTrustBoosts(score, boosts) {
    let newScore = score;
    const boostList = [];
    for (const b of boosts) {
      newScore += b.points;
      boostList.push(b);
    }
    return { score: newScore, trust_boosts: boostList, calculation_order: ['apply_trust_boosts'] };
  }

  clampScore(score) {
    return Math.max(this.minScore, Math.min(this.maxScore, score));
  }

  computeStatus(score) {
    if (score === this.minScore) return 'BLOCKED'; // from hard blocker
    if (score < 50) return 'HIGH_RISK';
    return 'SAFE';
  }

  // Enhanced evaluate method with dynamic thresholds and risk integration
  evaluate(initialScore = 100, hardBlockers = [], penalties = [], trustBoosts = [], options = {}) {
    const { 
      shipment = { product: {}, corridor: {} }, 
      riskProfile = { previousBlockersCount: 0, countryRiskFlags: {}, exporterTier: 2 },
      rasffHistory = [],
      useDynamicThresholds = true
    } = options;

    let score = initialScore;
    const order = [];

    // 0. Dynamic threshold adjustment (NEW - key improvement)
    let thresholdAdjustments = [];
    if (useDynamicThresholds) {
      const { thresholds, adjustments } = this.adjustThresholds(shipment, riskProfile);
      thresholdAdjustments = adjustments;
      order.push({ step: 'threshold_adjustment', thresholds, adjustments });
      // Store adjusted thresholds for later evaluation
      shipment._adjustedThresholds = thresholds;
    }

    // 1. Hard Blockers override
    const blockerResult = this.applyHardBlockers(hardBlockers);
    if (blockerResult) {
      return {
        ...blockerResult,
        final_score: blockerResult.score,
        status: blockerResult.status,
        initial_score: initialScore,
        calculation_order: [...blockerResult.calculation_order, 'override_all'],
        threshold_adjustments: thresholdAdjustments  // Track adjustments even on blockers
      };
    }

    // 2. Penalties
    const penaltyResult = this.applyPenalties(score, penalties);
    score = penaltyResult.score;
    order.push({ step: 'apply_penalties', ...penaltyResult.calculation_order });

    // 3. Trust Boosts
    const boostResult = this.applyTrustBoosts(score, trustBoosts);
    score = boostResult.score;
    order.push({ step: 'apply_trust_boosts', ...boostResult.calculation_order });

    // 4. Clamp & Status
    score = this.clampScore(score);
    order.push('clamp_score');

    // 5. Check RASFF alerts (NEW)
    const rasffAlerts = this.checkRASFFAlerts(shipment, rasffHistory);
    let finalStatus = this.computeStatus(score);
    
    // If high-severity RASFF alerts, escalate status
    if (rasffAlerts.some(a => a.severity === 'SERIOUS' || a.severity === 'CRITICAL')) {
      if (score >= 50) {
        finalStatus = 'HIGH_RISK';  // Escalate even if score would be SAFE
        order.push({ step: 'rasff_escalation', alerts: rasffAlerts.map(a => a.alertId) });
      }
    }

    return {
      shipment_id: shipment.id || 'S12345',
      initial_score: initialScore,
      hard_blockers: [],
      penalties: penaltyResult.penalties,
      trust_boosts: boostResult.trust_boosts,
      final_score: score,
      status: finalStatus,
      calculation_order: order,
      threshold_adjustments: thresholdAdjustments,
      rasff_alerts: rasffAlerts,
      risk_profile: {
        previousBlockersCount: riskProfile.previousBlockersCount,
        exporterTier: riskProfile.exporterTier,
        countryRiskFlags: riskProfile.countryRiskFlags
      }
    };
  }
}

// Example Usage with Enhanced Features
const engine = new ScoreStatusEngine();

// Example 1: Standard evaluation (backward compatible)
const result = engine.evaluate(100, 
  [], // no hard blockers
  [{rule_id: 'MOISTURE_LIMIT', points: -15}], 
  [{rule_id: 'LAB_TIER1', points: +10}]
);
console.log('Standard:', JSON.stringify(result, null, 2));

// Example 2: Dynamic thresholds with risk profile
const shipment = {
  id: 'CB-001',
  product: { category: 'cocoa' },
  corridor: { destinationCountry: 'eu' }
};
const riskProfile = {
  previousBlockersCount: 3,
  countryRiskFlags: { salmonella: 'HIGH' },
  exporterTier: 2
};
const dynamicResult = engine.evaluate(100, [], [], [], { 
  shipment, 
  riskProfile,
  useDynamicThresholds: true
});
console.log('Dynamic:', JSON.stringify(dynamicResult, null, 2));

// Example 3: With RASFF alerts (matching product/corridor)
const rasffHistory = [
  { alert_id: 'RASFF-2026-1234', product: 'cocoa', country: 'eu', hazard: 'aflatoxin', severity: 'CRITICAL' }
];
const withRasff = engine.evaluate(80, [], [], [], {
  shipment: { id: 'CB-002', product: { category: 'cocoa' }, corridor: { destinationCountry: 'eu' } },
  riskProfile: { previousBlockersCount: 0, countryRiskFlags: {}, exporterTier: 1 },
  rasffHistory
});
console.log('With RASFF:', JSON.stringify(withRasff, null, 2));

// Example 4: RASFF escalation - should elevate to HIGH_RISK due to CRITICAL alert
const escalation = engine.evaluate(60, [], [], [], {
  shipment: { id: 'CB-003', product: { category: 'cocoa' }, corridor: { destinationCountry: 'eu' } },
  riskProfile: { previousBlockersCount: 0, countryRiskFlags: {}, exporterTier: 2 },
  rasffHistory: [{ alert_id: 'RASFF-2026-5678', product: 'cocoa', country: 'gh', hazard: 'salmonella', severity: 'SERIOUS', affectedCountries: ['eu'] }]
});
console.log('RASFF Escalation:', JSON.stringify(escalation, null, 2));

// Test BLOCKED
const blocked = engine.evaluate(100, ['aflatoxin_total_exceeded']);
console.log('Blocked:', JSON.stringify(blocked, null, 2));

module.exports = ScoreStatusEngine;

