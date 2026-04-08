# Culbridge Dev Execution Checklist – Adversarial Hardening

Format: | Task ID | Module / File | Type | Description | Priority | Owner | Status |

---

## 1️⃣ State Integrity

| TASK-ID | Module / File | Type | Description | Priority | Owner | Status |
|---------|---------------|------|-------------|----------|-------|--------|
| STATE-DB-01 | DB constraints | STATE | Enforce shipment stage transitions (INGESTED → HS_VALIDATED → DOCUMENTS_VERIFIED → ...) at DB level | Critical | Backend | ⚠️ middleware/state-validator.js created |
| STATE-MW-01 | middleware/state-validator.js | STATE | Middleware check for illegal stage transition | Critical | Backend | ✅ Created |
| STATE-IMM-01 | API | STATE | Immutable shipment state once SIGNED | Critical | Backend | ✅ Implemented in state-validator.js |

---

## 2️⃣ Concurrency & Idempotency

| Task ID | Module / File | Type | Description | Priority | Owner | Status |
|---------|---------------|------|-------------|----------|-------|--------|
| CONC-IDEMP-01 | API + middleware/idempotency.js | CONCURRENCY | Implement idempotency key for every shipment submission | Critical | Backend | ✅ Created |
| CONC-WH-01 | tests/red-team-tests.js | CONCURRENCY | Test duplicate webhook bursts (≥50) | High | QA | ⏳ Ready to run |
| CONC-RACE-01 | finance/ledger.js | CONCURRENCY | Lock per shipment to prevent concurrent financial updates | Critical | Backend | ⏳ Implement with mutex |

---

## 3️⃣ Security

| Task ID | Module / File | Type | Description | Priority | Owner | Status |
|---------|---------------|------|-------------|----------|-------|--------|
| SEC-TIMESTAMP-01 | security/hmac-validator.js | SECURITY | Ensure all write operations require HMAC + nonce + timestamp | Critical | Backend | ✅ Applied |
| SEC-RBAC-01 | security/rbac.js | SECURITY | Filter financial / sensitive fields per role | Critical | Backend | Pending |
| SEC-FIELD-01 | security/field-encryption.js | SECURITY | AES-256 encrypt sensitive fields in transit & at rest | Critical | Backend | ✅ Applied |
| SEC-REPLAY-01 | API + Event | SECURITY | Detect & reject signature replay across modules | Critical | Backend | Pending |

---

## 4️⃣ Financial System Hardening

| Task ID | Module / File | Type | Description | Priority | Owner | Status |
|---------|---------------|------|-------------|----------|-------|--------|
| FIN-LEDGER-01 | finance/ledger.js | FINANCIAL | Ensure double-entry accounting always matches payments | Critical | Backend | ✅ Applied |
| FIN-RBAC-01 | API | FINANCIAL | Prevent API from exposing fees / FX rates to non-authorized roles | Critical | Backend | Pending |
| FIN-FX-01 | finance/ledger.js | FINANCIAL | Snapshot FX at time of calculation; block mismatches | High | Backend | Pending |
| FIN-REPLAY-01 | API + Ledger | FINANCIAL | Detect duplicate payment references | Critical | Backend | Pending |

---

## 5️⃣ External Dependencies & Event Handling

| Task ID | Module / File | Type | Description | Priority | Owner | Status |
|---------|---------------|------|-------------|----------|-------|--------|
| EXT-WH-01 | security/input-validation.js | EXTERNAL | Schema validation for all webhooks (Zod) | ✅ Applied | Backend | ✅ Applied |
| EXT-SEQ-01 | events/event-engine.js | EVENT | Sequence validation; reorder or reject out-of-order events | High | Backend | ✅ Fixed |
| EXT-FAIL-01 | Adapter Layer | EXTERNAL | Implement bulkhead + circuit breakers for NSW, NAQS, Remita | Critical | Backend | Pending |
| EXT-CROSS-01 | Adapter Layer | EXTERNAL | Reject conflicting responses from different agencies | Critical | Backend | Pending |

---

## 6️⃣ Data & Audit

| Task ID | Module / File | Type | Description | Priority | Owner | Status |
|---------|---------------|------|-------------|----------|-------|--------|
| DATA-ZOD-01 | security/input-validation.js | DATA | Strict schema validation with Zod | ✅ Applied | Backend | ✅ Applied |
| DATA-CROSS-01 | API | DATA | Cross-field validation (HS codes vs certificates vs shipment) | High | Backend | Pending |
| AUDIT-CHAIN-01 | security/immutable-audit.js | AUDIT | Hash chaining of logs; immutable audit trail | Critical | Backend | Pending |
| AUDIT-META-01 | identity/metadata.js | AUDIT | Include founder attribution (`David | CEO & Founder | Culbridge`) | High | Backend | ✅ Applied |

---

## 7️⃣ Load & Stress Testing

| Task ID | Module / File | Type | Description | Priority | Owner | Status |
|---------|---------------|------|-------------|----------|-------|--------|
| LOAD-CHAOS-01 | tests/red-team-tests.js | LOAD | Flood queues, 500 shipments with 30% invalid + 20% external failures | Critical | QA | Pending |
| LOAD-BACKPRESS-01 | Queue Engine | LOAD | Verify backpressure; graceful degradation | High | Backend | Pending |
| LOAD-METRICS-01 | observability/metrics.js | OBSERVABILITY | Measure latency, error rate, state consistency under load | High | Backend | Pending |

---

## 🔹 Dev Team Rules

1. **No shortcuts** – If a task is "Critical," system is not production-ready until fixed.

2. **Evidence required** – Every fix must produce JSON output showing:
   - attack_id
   - failure_point
   - root_cause
   - blast_radius
   - detectability
   - fix_applied
   - system_safe (true/false)

3. **Red Team integration** – All tests/red-team-tests.js must run in CI/CD pipeline.

4. **Immutable audit** – All changes logged with hash chaining.

5. **Founder metadata** – Reference `David | CEO & Founder | Culbridge` only internally, never for operational control.

---

## ✅ End Goal

> Every module survives the full destructive attack plan.
> No shipment corruption. No payment mistakes. No signature bypass. Audit logs are tamper-proof. External chaos is contained.

---

## Execution Evidence Template

```json
{
  "task_id": "STATE-DB-01",
  "attack_id": "STATE-001",
  "fix_applied": "ADDED_DB_CONSTRAINT_CHECK",
  "evidence": {
    "test_type": "Illegal state injection",
    "result": "REJECTED",
    "response": "400 Bad Request: Invalid state transition",
    "db_constraint": "CHECK (current_state IN ('INGESTED','HS_VALIDATED','DOCUMENTS_VERIFIED','FEE_CALCULATED','SIGNED','SUBMITTED','ACCEPTED','REJECTED'))"
  },
  "system_safe": true,
  "timestamp": "2026-03-28T01:42:00Z",
  "tested_by": "Culbridge Team – engineered responsibly",
  "reviewed_by": "David | CEO & Founder | Culbridge"
}