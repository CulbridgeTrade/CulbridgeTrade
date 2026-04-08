# 🚨 CULBRIDGE SENIOR DEV TEAM MANDATE: INFRASTRUCTURE-GRADE HARDENING

**Audience:** Senior Dev Team, Technical Leads, Systems Engineers

**Objective:** Culbridge must survive real-world adversarial conditions with legal, financial, and operational safety guaranteed. Functional correctness alone is insufficient. This is a production survival mandate.

---

## 1️⃣ Ground Truth: Reality Check

### Principle
> **Functional correctness ≠ production readiness**
> Production readiness = predictable, contained, recoverable failures under all expected and adversarial conditions

### Current State
| Aspect | Status |
|--------|--------|
| Deterministic logic | ✅ Works |
| Structured pipeline | ✅ Exists |
| Failure propagation | ❌ Uncontrolled |
| External dependencies | ❌ Untrusted |
| Concurrency flows | ❌ Unprotected |
| Financial flows | ❌ Unprotected |

### Directive
Think like an **adversary attacking the system**, not a feature engineer delivering happy-path code.

Every module, every transaction, every external call must survive chaos without legal, financial, or operational breach.

---

## 2️⃣ Pipeline Integrity (State Machine + Invariants)

### Critical Failures
- `PIPELINE_OUT_OF_ORDER` - Signature before compliance
- `SKIP_REQUIRED_STAGE` - Fee calculator skipped

### Requirement
**Monotonic, non-bypassable pipeline enforced at every layer**

### State Flow (Mandatory)
```
INGESTED → HS_VALIDATED → DOCUMENTS_VERIFIED → COMPLIANCE_PASSED → 
FINANCIAL_CONFIRMED → READY_FOR_SIGNATURE → SIGNED → SUBMITTED
```

### Implementation

```javascript
// State transition validation
validate_state_transition(prev_state, next_state)
validate_invariants(shipment)

// Mandatory Invariants
1. Signed payload = hashed payload
2. Submitted payload = signed payload  
3. Payment matches declared financials
4. Compliance matches attached documents
5. Shipment state strictly monotonic
```

### Enforcement
- Central state manager
- DB constraints
- Middleware validation

### MANDATORY
**Any invariant violation → system panic, halt, alert**

---

## 3️⃣ Concurrency & Idempotency (Exactly-Once Semantics)

### Critical Failure
- `DUPLICATE_SUBMISSION` - Multiple submissions accepted

### Requirement
**Exactly-once execution across all modules and external systems**

### Implementation

```javascript
// Execution ledger
{
  "operation": "NSW_SUBMISSION",
  "shipment_id": "...",
  "execution_id": "...",
  "status": "COMPLETED"
}

// Check ledger before processing
// Idempotency extended to: API, Remita, NSW, Webhooks
// Distributed locking for parallel pipelines
```

### MANDATORY
**One shipment → one financial path → one submission. No exceptions.**

---

## 4️⃣ External Systems (Failure Containment Architecture)

### Critical Weakness
- `EXTERNAL_DEPENDENCY` - Failures propagate uncontrolled

### Requirement
**Adapter layer + bulkhead + circuit breaker pattern**

### Implementation Table

| Dependency | Failure Mode | Behavior |
|------------|--------------|----------|
| NSW | Timeout/500 | Queue + retry, mark pending |
| Remita | No response | Block financial stage |
| NAQS | Partial/invalid | Mark UNKNOWN, isolate |
| NAFDAC | Conflict | Cross-check + flag |

### Bulkhead
Unrelated pipelines → failure in one dependency cannot crash others

### MANDATORY
**All calls must pass through adapters → no direct core calls**

---

## 5️⃣ Signature System (Trust Architecture)

### Critical Failures
- `SIGNATURE_REPLAY` - Same signature reused
- `SIGNATURE_MUTATION` - Payload changed after signing

### Requirement
**Immutable, traceable, one-time-use signatures**

### Implementation

```javascript
// Signature must bind to:
{
  payload_hash: ...,      // SHA-256 of payload
  timestamp: ...,         // Unix timestamp
  nonce: ...,             // One-time random
  system_version: "2026.1"  // Version lock
}

// Trust store
{
  ca_list: [...],
  revoked_certs: [...],
  expiry_window: 300 // 5 minutes
}

// Post-signature → immutable lock enforced
```

### MANDATORY
**No stale, replayed, or impersonated signature accepted. Legal validity preserved.**

---

## 6️⃣ Financial Engine (Ledger-Based Accounting)

### Critical Failures
- `PARTIAL_PAYMENT` - Payment not verified
- `FX_DRIFT` - FX rate not locked

### Requirement
**Double-entry ledger with reconciliation and time-bound FX rates**

### Implementation

```javascript
// Ledger entries
{
  shipment_id: "...",
  debit: "NES_LEVY",
  credit: "REMITA_PAYMENT",
  fx_rate_at_calculation: 1500,
  fx_rate_at_submission: null, // Must match
  reconciliation_status: "MATCHED"
}

// Payment validation window enforced
// FX snapshot locked at calculation time
```

### MANDATORY
**No silent discrepancies, no overpayment, no underpayment, audit-ready.**

---

## 7️⃣ Data Integrity (Zero-Trust Inputs)

### Critical Weakness
- `DATA_CORRUPTION` - Invalid data accepted

### Requirement
**Assume every input is malicious**

### Implementation

```javascript
// Multi-layer validation
{
  schema: "JSON Schema / Zod",
  domain: "Product-specific rules",
  cross_field: "HS code vs product consistency"
}

// Provenance tracking per field
{
  field: "hs_code",
  source: "NAQS_API",
  verified: true,
  timestamp: "2024-03-20T10:00:00Z"
}
```

### MANDATORY
**No invalid, unverifiable, or malicious data enters the system.**

---

## 8️⃣ Event System (Event Sourcing + Causality)

### Critical Weakness
- `EVENT_OUT_OF_ORDER` - C104 before C100
- `DUPLICATE_WEBHOOK` - Same event 5x

### Requirement
**Deterministic, replayable, fully traceable event system**

### Implementation

```javascript
// Event versioning + causal chain
{
  event_id: "...",
  shipment_id: "...",
  causation_id: "previous_event_id",
  version: "2026.1"
}

// Dead Letter Queue for failures
// Deterministic replay engine
```

### MANDATORY
**No lost events, no silent corruption, full traceability.**

---

## 9️⃣ Throughput & Load (Backpressure + Queue Control)

### Requirement
**System survives high load with mixed valid/invalid shipments**

### Implementation

```javascript
// Event-driven queue (Kafka/RabbitMQ)
// Backpressure rules → reject/delay ingestion
// Priority queues → critical shipments (AEO)
```

### MANDATORY
**Critical flows survive under extreme load; system never collapses.**

---

## 🔟 Audit (Legal-Grade Evidence)

### Requirement
**Cryptographically tamper-proof, exportable audit logs**

### Implementation

```javascript
// Chained logs
{
  log_id: "...",
  previous_log_hash: "...",
  payload_hash: "...",
  timestamp: "...",
  actor: "..."
}

// Tamper detection → instant alert
// Full dossier exportable, court-ready
```

### MANDATORY
**Regulatory acceptance, institutional trust, legal defensibility.**

---

## 1️⃣1️⃣ Observability (Critical Layer)

### Requirement
**Full visibility into all failures before users see them**

### Implementation

```javascript
// Metrics
{
  success_rate: 0.98,
  failure_rate: 0.02,
  retry_rate: 0.05,
  latency_p99: 250 // ms
}

// Alerts: threshold-based
// Distributed tracing → OpenTelemetry
```

### MANDATORY
**Detect and respond proactively, not reactively.**

---

## 🛑 SENIOR DEV TEAM DIRECTIVE

This is a **non-negotiable command**.

### Priority 1: Critical Fixes (Without Delay)
1. [ ] Resolve `PIPELINE_OUT_OF_ORDER` - State machine enforcement
2. [ ] Resolve `SKIP_REQUIRED_STAGE` - Stage dependency enforcement
3. [ ] Resolve `DUPLICATE_SUBMISSION` - DB idempotency + UNIQUE constraint
4. [ ] Resolve `SIGNATURE_REPLAY` - Nonce + timestamp binding
5. [ ] Resolve `SIGNATURE_MUTATION` - Post-signature immutability lock
6. [ ] Resolve `PARTIAL_PAYMENT` - Payment verification before submission

### Priority 2: Weak Areas (Harden)
1. [ ] Add circuit breakers for external APIs
2. [ ] Lock FX rate at calculation time
3. [ ] Add event sequencing validation
4. [ ] Add event idempotency key
5. [ ] Deepen schema validation

### Priority 3: Validation Loop
1. [ ] Re-run destructive validation after each fix
2. [ ] Pass = progress; Fail = stop and fix
3. [ ] Inject randomness, fail dependencies, corrupt inputs, scale concurrency

### Priority 4: Track Everything
Update Failure Registry for each fix:
```json
{
  "failure_point": "...",
  "root_cause": "...",
  "fix_applied": "...",
  "residual_risk": "...",
  "is_eliminated": true/false
}
```

### Priority 5: Infrastructure Verification
- [ ] Invariants enforced at all layers
- [ ] Ledger correctness verified
- [ ] Audit traceability complete
- [ ] Event causality preserved

---

## ⭐ ABSOLUTE METRIC

> **Can this system survive reality without breaking trust?**

If the answer is **NO** → **DO NOT SHIP**. Stop work until fixed.

---

## ✅ Command-Level Enhancements Added

- **System panic triggers** for invariant failures
- **Distributed locking + ledger** required before external submissions
- **Bulkhead enforcement** across all external adapters
- **Signature + immutability** enforced at middleware + DB
- **FX snapshot** hard constraint, not optional
- **Dead Letter Queue + deterministic replay** mandatory
- **OpenTelemetry + metric-driven alerts** required for production

---

**Failure to implement any item is a direct risk to legal, financial, and operational integrity.**

---

## Current Failure Registry

| # | Failure | Status | Fix |
|---|---------|--------|-----|
| 1 | PIPELINE_OUT_OF_ORDER | 🔴 CRITICAL | State machine |
| 2 | SKIP_REQUIRED_STAGE | 🔴 CRITICAL | Stage dependencies |
| 3 | DUPLICATE_SUBMISSION | 🔴 CRITICAL | DB idempotency |
| 4 | SIGNATURE_REPLAY | 🔴 CRITICAL | Nonce + timestamp |
| 5 | SIGNATURE_MUTATION | 🔴 CRITICAL | Immutability lock |
| 6 | PARTIAL_PAYMENT | 🔴 CRITICAL | Payment verification |
| 7 | EXTERNAL_DEPENDENCY | ⚠️ WEAK | Circuit breakers |
| 8 | FX_DRIFT | ⚠️ WEAK | FX snapshot |
| 9 | DATA_CORRUPTION | ⚠️ WEAK | Schema validation |
| 10 | EVENT_OUT_OF_ORDER | ⚠️ WEAK | Event sequencing |
| 11 | DUPLICATE_WEBHOOK | ⚠️ WEAK | Event idempotency |

**Progress: 0/11 fixed**