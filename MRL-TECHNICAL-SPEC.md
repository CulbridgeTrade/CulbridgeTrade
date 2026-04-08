# MRL (Maximum Residue Limits) System — Technical Specification

## Overview

This document explains how to build the MRL-checking subsystem for the Culbridge Trade Compliance Platform. MRL checks are **regulatory requirements** — exceeding an MRL triggers RASFF alerts regardless of whether the residue level is scientifically "safe."

---

## Why MRLs Matter

- **MRL = EU regulatory threshold** for pesticide residue in food
- **Exceeding MRL** → **RASFF alert** → shipment blocked/destroyed
- Nigerian exports (cocoa, sesame, ginger, etc.) often exceed MRLs due to:
  - Over-spraying practices
  - Poor spray records (date, product, rate, area)
  - No pre-export testing

---

## Data Models

### 1. MRLRule (Reference Table)

Stores EU MRL thresholds by product/substance/country.

```javascript
{
  id: Number,
  product: "cocoa" | "sesame" | "ginger" | "groundnuts" | "beans",
  substance: "oxamyl" | "chlorpyrifos" | "aflatoxin-b1" | ...,  // pesticide name
  mrl: Number,           // limit value
  unit: "mg/kg" | "μg/kg",
  country: "NL" | "DE", // Netherlands or Germany (EU)
  dateFrom: "YYYY-MM-DD",
  dateTo: "YYYY-MM-DD",
}
```

**Indices needed:**
- `(product, substance, country)` — for fast lookup
- `(country, dateTo)` — for "current rules only" queries

### 2. TestResult (Per-Shipment Lab Results)

Stores individual lab test results, linked to MRL rules.

```javascript
{
  id: Number,
  shipmentId: Number,
  testType: "pesticide" | "aflatoxin",
  substance: String,     // e.g., "oxamyl", "chlorpyrifos"
  labName: String,
  value: Number,         // measured result
  unit: "mg/kg" | "μg/kg",
  mrlRuleId: Number,     // foreign key to MRLRule
  status: "Pass" | "Fail", // computed by rule engine
  createdAt: DateTime,
}
```

### 3. MRLCheckResult (Computed Summary)

Aggregates MRL check results per shipment.

```javascript
{
  id: Number,
  shipmentId: Number,
  totalTestsRun: Number,
  totalViolations: Number,     // count of substances > MRL
  overallStatus: "Pass" | "Warning" | "Blocked",
  violations: [
    { substance: "oxamyl", measured: 0.05, mrl: 0.01, unit: "mg/kg" },
    ...
  ],
  checkedAt: DateTime,
}
```

---

## Business Logic (Rule Engine)

### Step 1: Find Matching MRL Rule

```javascript
function findMRLRule(product, substance, destinationCountry) {
  return db.query(`
    SELECT * FROM MRLRule
    WHERE product = ?
      AND substance = ?
      AND country = ?
      AND dateFrom <= NOW()
      AND dateTo >= NOW()
    LIMIT 1
  `, [product, substance, destinationCountry]);
}
```

### Step 2: Compute Test Status

```javascript
function computeTestStatus(testResult) {
  const rule = findMRLRule(
    testResult.product,
    testResult.substance,
    testResult.destinationCountry
  );
  
  if (!rule) {
    return { status: "Unknown", reason: "No MRL rule found" };
  }
  
  // Normalize units to mg/kg for comparison
  const measuredMgKg = normalizeToMgKg(testResult.value, testResult.unit);
  const mrlMgKg = normalizeToMgKg(rule.mrl, rule.unit);
  
  const isPass = measuredMgKg <= mrlMgKg;
  
  return {
    status: isPass ? "Pass" : "Fail",
    measured: measuredMgKg,
    limit: mrlMgKg,
    violation: isPass ? null : {
      substance: testResult.substance,
      measured: measuredMgKg,
      limit: mrlMgKg,
      excessPercent: ((measuredMgKg / mrlMgKg) - 1) * 100
    }
  };
}
```

### Step 3: Compute Shipment MRL Violations

```javascript
function computeShipmentMRLViolations(shipmentId) {
  const testResults = db.query(`
    SELECT * FROM TestResult 
    WHERE shipmentId = ? AND testType = 'pesticide'
  `, [shipmentId]);
  
  let violations = [];
  let passCount = 0;
  
  for (const test of testResults) {
    const result = computeTestStatus(test);
    
    // Update test result status
    db.query(`UPDATE TestResult SET status = ? WHERE id = ?`, 
      [result.status, test.id]);
    
    if (result.status === "Pass") {
      passCount++;
    } else if (result.violation) {
      violations.push(result.violation);
    }
  }
  
  const overallStatus = violations.length === 0 ? "Pass" 
    : violations.length <= 2 ? "Warning" 
    : "Blocked";
  
  // Save aggregated result
  db.query(`
    INSERT INTO MRLCheckResult 
    (shipmentId, totalTestsRun, totalViolations, overallStatus, violations, checkedAt)
    VALUES (?, ?, ?, ?, ?, NOW())
    ON CONFLICT(shipmentId) DO UPDATE SET ...
  `, [shipmentId, testResults.length, violations.length, overallStatus, JSON.stringify(violations)]);
  
  return { overallStatus, violations, passCount };
}
```

### Step 4: Integrate with Compliance Engine

In the existing `calculate_compliance_status` function:

```javascript
function calculateComplianceStatus(shipment) {
  // Existing logic (documents, RASFF, etc.)
  const docStatus = checkDocuments(shipment);
  const rasffStatus = checkRASFFAlerts(shipment);
  
  // NEW: MRL check
  const mrlResult = computeShipmentMRLViolations(shipment.id);
  
  // Final status calculation
  let finalStatus = "Ready";
  
  if (mrlResult.overallStatus === "Blocked") {
    finalStatus = "Blocked";
    shipment.blockers.push({
      code: "MRL_BLOCKED",
      message: `${mrlResult.violations.length} substance(s) exceed EU MRL limits`,
      details: mrlResult.violations
    });
  } else if (mrlResult.overallStatus === "Warning" || rasffStatus === "Warning") {
    finalStatus = "Warning";
  }
  
  return {
    status: finalStatus,
    healthScore: calculateHealthScore(shipment),
    blockers: shipment.blockers,
    warnings: shipment.warnings,
    mrlViolations: mrlResult.violations
  };
}
```

---

## API Endpoints

### GET /mrl-rules

Returns all MRL rules. Use for admin management.

```javascript
// GET /api/v1/mrl-rules?product=cocoa&country=NL
{
  rules: [
    { product: "cocoa", substance: "oxamyl", mrl: 0.01, unit: "mg/kg" },
    { product: "cocoa", substance: "chlorpyrifos", mrl: 0.05, unit: "mg/kg" },
    ...
  ]
}
```

### POST /mrl-rules/ingest

Admin endpoint to ingest MRL data from EU official sources.

```javascript
// POST /api/v1/mrl-rules/ingest
// Body: CSV or JSON from EU MRL database
{
  inserted: 150,
  updated: 23,
  errors: []
}
```

### GET /shipments/:id/mrl-check

Returns MRL check result for a specific shipment.

```javascript
// GET /api/v1/shipments/123/mrl-check
{
  shipmentId: 123,
  overallStatus: "Blocked",
  totalViolations: 2,
  violations: [
    { substance: "oxamyl", measured: 0.05, mrl: 0.01, excessPercent: 400 },
    { substance: "chlorpyrifos", measured: 0.08, mrl: 0.05, excessPercent: 60 }
  ]
}
```

---

## Database Schema (PostgreSQL)

```sql
-- MRL Rules Reference Table
CREATE TABLE mrl_rules (
  id SERIAL PRIMARY KEY,
  product VARCHAR(50) NOT NULL,
  substance VARCHAR(100) NOT NULL,
  mrl DECIMAL(10, 6) NOT NULL,
  unit VARCHAR(10) NOT NULL DEFAULT 'mg/kg',
  country VARCHAR(2) NOT NULL, -- NL, DE
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT uq_mrl_rule UNIQUE (product, substance, country, date_from)
);

CREATE INDEX idx_mrl_product_substance ON mrl_rules(product, substance, country);
CREATE INDEX idx_mrl_country_active ON mrl_rules(country, date_to) WHERE date_to > CURRENT_DATE;

-- Test Results with MRL Link
CREATE TABLE test_results (
  id SERIAL PRIMARY KEY,
  shipment_id INTEGER NOT NULL REFERENCES shipments(id),
  test_type VARCHAR(20) NOT NULL, -- 'pesticide', 'aflatoxin'
  substance VARCHAR(100) NOT NULL,
  lab_name VARCHAR(255),
  value DECIMAL(12, 6) NOT NULL,
  unit VARCHAR(10) NOT NULL DEFAULT 'mg/kg',
  mrl_rule_id INTEGER REFERENCES mrl_rules(id),
  status VARCHAR(10), -- 'Pass', 'Fail', computed
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_test_shipment ON test_results(shipment_id);

-- MRL Check Results (computed, not source of truth)
CREATE TABLE mrl_check_results (
  id SERIAL PRIMARY KEY,
  shipment_id INTEGER NOT NULL REFERENCES shipments(id),
  total_tests_run INTEGER DEFAULT 0,
  total_violations INTEGER DEFAULT 0,
  overall_status VARCHAR(10) NOT NULL, -- 'Pass', 'Warning', 'Blocked'
  violations JSONB, -- Array of violation objects
  checked_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT uq_mrl_check_shipment UNIQUE (shipment_id)
);

CREATE INDEX idx_mrl_check_status ON mrl_check_results(overall_status);
```

---

## Unit Conversion Helper

```javascript
function normalizeToMgKg(value, unit) {
  if (unit === 'mg/kg') return value;
  if (unit === 'μg/kg') return value / 1000; // 1 mg = 1000 μg
  if (unit === '%') return value * 10000;   // 1% = 10000 mg/kg
  throw new Error(`Unknown unit: ${unit}`);
}
```

---

## What Senior Devs Need to Build

### Phase 1: Core Infrastructure
1. **MRLRule table** + ingest script (from EU MRL database)
2. **TestResult table** with MRL relationship
3. **MRLCheckResult table** for computed results

### Phase 2: Rule Engine
4. `computeTestStatus()` — compare test value vs MRL limit
5. `computeShipmentMRLViolations()` — aggregate per shipment
6. Unit normalization utilities

### Phase 3: Integration
7. Hook into existing `calculate_compliance_status()`
8. Add MRL violations to API response
9. Display in UI (ShipmentTable + DetailView)

### Phase 4: Polish
10. Add "What was checked" section in UI
11. Show substance-level Pass/Fail in lab results
12. Color-coding: Red (Blocked), Yellow (Warning), Green (Pass)

---

## Initial MRL Data (Sample)

| Product | Substance | MRL (mg/kg) | Country |
|---------|-----------|-------------|---------|
| Cocoa | Oxamyl | 0.01 | NL, DE |
| Cocoa | Chlorpyrifos | 0.05 | NL, DE |
| Sesame | Aflatoxin Total | 8.0 | NL, DE |
| Ginger | Ethylene Oxide | 0.05 | NL, DE |
| Groundnuts | Aflatoxin B1 | 2.0 | NL, DE |

---

## FAQ

**Q: Who provides the MRL data?**
A: EU MRL data is public. Source from European Food Safety Authority (EFSA) or use a commercial dataset like mrlvalidator.com.

**Q: What if a substance has no MRL rule?**
A: Mark as "Unknown" — don't block, but show warning. Default to Pass.

**Q: How often do MRL rules change?**
A: EU updates MRLs periodically. Ingest via cron job (monthly recommended).

**Q: Can we override MRL checks?**
A: No. UI cannot override backend decisions. This is a regulatory requirement.
