# Culbridge Core Infrastructure: Data Model + Rules + Simulation

> **Version:** 1.0  
> **Generated:** 2026-03-28  
> **Purpose:** Define the operational layer that makes Culbridge infrastructure, not just a tool

---

## Executive Summary

Culbridge has three core layers that determine whether it becomes **infrastructure** or just another tool:

1. **Database Schema** - Normalized, minimal, storing state transitions + evidence + rule outputs
2. **Rule Engine** - Deterministic constraint evaluation system (data-driven, not hardcoded)
3. **Simulation Engine** - Predicts failure BEFORE submission (the "moat")

---

## 1. Database Schema

### 1.1 Core Tables

Located in: [`db/core-schema.sql`](db/core-schema.sql)

| Table | Purpose |
|-------|---------|
| `shipments` | Core state - id, status, timestamps |
| `shipment_commodity` | Commodity data - description, HS code, confidence |
| `shipment_entity` | Exporter/agent - IDs, verification status |
| `shipment_destination` | Destination - country, port |
| `documents` | Document metadata - file, hash, storage |
| `shipment_documents` | Junction - doc type, validation status |
| `compliance_flags` | Rule outputs - code, severity, message |
| `fees` | Fee breakdown per shipment |
| `submissions` | Idempotency - tokens, SGD numbers |
| `audit_logs` | **Immutable** - event trail with SHA-256 hash |

### 1.2 Key Design Decisions

```
✓ State stored as transitions, not "forms"
✓ Evidence (documents, lab results) separate from state
✓ Rule outputs stored as flags (not buried in JSON)
✓ Audit logs are append-only with hash chain verification
✓ Idempotency tokens prevent duplicate submissions
```

---

## 2. Rule Engine

Located in: [`engine/rule-engine.js`](engine/rule-engine.js) + [`engine/deterministic-rules.js`](engine/deterministic-rules.js)

### 2.1 Rule Structure

```javascript
{
    id: 'SESAME_NL_001',
    commodity: 'sesame',
    destination: 'NL',
    condition: (shipment) => boolean,  // Evaluates shipment
    effect: {
        type: 'BLOCKER' | 'WARNING',
        code: 'LAB_REPORT_MISSING',
        message: 'Lab report is mandatory...'
    }
}
```

### 2.2 How It Works

```
Shipment → Get Applicable Rules → Run Each Condition → 
    → If TRUE: Apply Effect (FLAG or REQUIRE_DOCUMENT)
    → If FALSE: PASS
```

### 2.3 Operational Rules (Nigeria → Netherlands)

This is **exactly** what causes rejection:

| Rule ID | Condition | Effect |
|---------|-----------|--------|
| `SESAME_NL_001` | Sesame → NL without lab report | BLOCKER |
| `SESAME_NL_002` | Aflatoxin B1 > 2.0 μg/kg | BLOCKER |
| `SESAME_NL_003` | Total aflatoxins > 4.0 μg/kg | BLOCKER |
| `SESAME_NL_004` | No phytosanitary cert | BLOCKER |
| `SESAME_NL_005` | No Certificate of Origin | BLOCKER |
| `SESAME_NL_006` | No EUDR traceability | BLOCKER |

### 2.4 Running Rules

```javascript
const { RuleEvaluator } = require('./engine/deterministic-rules');

const evaluator = new RuleEvaluator();
const result = evaluator.evaluate(shipment);

// Result:
// {
//   willPass: false,
//   blockers: [...],
//   warnings: [...],
//   passedCount: 8
// }
```

---

## 3. Simulation Engine

Located in: [`engine/simulation-engine.js`](engine/simulation-engine.js)

### 3.1 Why This Is The Moat

Exporters don't care about:
- "compliance engine"
- "rules"
- "modules"

They care about:
> **"Will my shipment be rejected?"**

The simulation engine answers this **before** submission.

### 3.2 Port Profiles

```javascript
const PORT_PROFILES = {
    NL: {
        country: 'NL',
        strictness: 'HIGH',
        checks: ['EUDR', 'RASFF', 'MRL', 'DOCUMENT'],
        mrlLimits: {
            aflatoxinB1: 2.0,    // μg/kg
            aflatoxinTotal: 4.0,
            cadmium: 0.5
        },
        eudrRequired: true
    },
    DE: { /* ... */ },
    // etc
};
```

### 3.3 Simulation Output

```json
{
    "willPass": false,
    "score": 0,
    "failurePoints": [
        {
            "stage": "DOCUMENT_CHECK",
            "reason": "Missing required documents: LAB_REPORT",
            "severity": "BLOCKER"
        },
        {
            "stage": "MRL_AFLATOXIN",
            "reason": "Aflatoxin B1: 3.5 μg/kg (limit: 2.0)",
            "severity": "BLOCKER"
        }
    ],
    "recommendations": [
        "Upload lab test report",
        "Fix 2 blocking issue(s) before submission"
    ],
    "checks": [
        { "name": "Rule Evaluation", "passed": false },
        { "name": "Document Completeness", "passed": false },
        { "name": "MRL Aflatoxin B1", "passed": false }
    ]
}
```

### 3.4 API Endpoint

```
POST /shipments/:id/simulate
{
    "destination": "NL"  // or DE, BE, FR, etc.
}

→ Returns simulation result with failure prediction
```

---

## 4. Audit System

Located in: [`engine/audit-engine.js`](engine/audit-engine.js)

### 4.1 Immutable Event Log

Every action logged with:
- Unique event ID
- Timestamp (ISO 8601)
- Actor: { id, name, role }
- Details (JSON)
- SHA-256 hash for integrity

### 4.2 Founder Attribution

Internal users see:
```
Reviewer: David | CEO & Founder | Culbridge
```

### 4.3 Verification

```javascript
const integrity = await verifyAuditIntegrity('shp_001');
// { valid: true, brokenAt: null }
// OR
// { valid: false, brokenAt: 'evt_015', ... }
```

---

## 5. Integration Flow

```
┌─────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ Exporter│────▶│ Submission │────▶│ Rule Engine│────▶│ Simulation │
│ Creates │     │   Form     │     │  Evaluation │     │  Prediction│
└─────────┘     └─────────────┘     └─────────────┘     └─────────────┘
       │               │                    │                   │
       ▼               ▼                    ▼                   ▼
   (1) Save       (2) Validate        (3) Generate       (4) Show:
   shipment       inputs + docs        compliance         - Will pass?
                    ▼                    flags             - What will fail?
                    │                                         - Recommendations
                    ▼
              ┌──────────────────────────────────────────────────────────┐
              │                  DECISION POINT                        │
              │                                                           │
              │  If simulation.willPass === true:                        │
              │     → Allow submission                                    │
              │     → Proceed to NSW/Remita                              │
              │                                                           │
              │  If simulation.willPass === false:                       │
              │     → BLOCK submission                                    │
              │     → Show failure points                                 │
              │     → Recommend fixes                                     │
              └──────────────────────────────────────────────────────────┘
```

---

## 6. What Makes This Defensible

| Layer | Defensible Because |
|-------|---------------------|
| **Rule Database** | Encodes actual export regulations (EU MRL, EUDR, etc.) |
| **Evaluation Engine** | Deterministic + explainable (shows which rule failed) |
| **Simulation Layer** | Predicts failure before it happens - unique value |
| **Audit Trail** | Immutable + verifiable - compliance requirement |

---

## 7. The Brutal Truth

> **If you cannot encode this rule as `condition → effect`, your system is still conceptual, not operational:**

> **"What exact rule causes a Nigerian sesame shipment to be rejected in the Netherlands?"**

**Answer:**

| Condition | Effect |
|-----------|--------|
| Sesame → NL + No Lab Report | BLOCKER: Lab report mandatory |
| Sesame → NL + Aflatoxin B1 > 2.0 | BLOCKER: Exceeds EU MRL |
| Sesame → NL + No EUDR Data | BLOCKER: EUDR non-compliance |

**This is encoded in:** [`engine/deterministic-rules.js`](engine/deterministic-rules.js) - Rules `SESAME_NL_001`, `SESAME_NL_002`, `SESAME_NL_006`

---

## 8. Files Created

| File | Purpose |
|------|---------|
| [`db/core-schema.sql`](db/core-schema.sql) | Normalized database schema |
| [`engine/rule-engine.js`](engine/rule-engine.js) | Generic rule engine |
| [`engine/deterministic-rules.js`](engine/deterministic-rules.js) | Operational export rules |
| [`engine/simulation-engine.js`](engine/simulation-engine.js) | Failure prediction engine |
| [`engine/audit-engine.js`](engine/audit-engine.js) | Immutable audit trail |

---

## 9. Next Steps

1. [ ] Run `db/core-schema.sql` against SQLite database
2. [ ] Integrate RuleEngine into shipment evaluation pipeline
3. [ ] Expose `/shipments/:id/simulate` endpoint
4. [ ] Add WebSocket for real-time simulation updates
5. [ ] Load real EU MRL limits from official sources

---

*End of Core Infrastructure Documentation*