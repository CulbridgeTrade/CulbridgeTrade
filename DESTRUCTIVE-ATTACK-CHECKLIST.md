# Culbridge Destructive Attack Checklist

## 🧠 Ground Truth

Before starting any destructive test:
- Log `system_state = "baseline"`
- Log `known_issues = []`
- Any deviation = captured as failure

---

## 🔥 1. Pipeline Integrity (State Machine + Invariants)

### Attack Examples
- [ ] Skip HS validation → try to submit (expect BLOCKED)
- [ ] Run Compliance → Signature → Fee Calculator (wrong order)
- [ ] Sign before compliance check

### Checks Required
- [ ] State enforcement prevents execution outside allowed path
- [ ] Signed payload invariant holds (payload hash = signed hash)
- [ ] Module dependencies enforced

### Fixes Implemented
- [ ] State machine enforcement in pipeline
- [ ] Stage dependency validation

### Failure Register Entry
```json
{
  "failure_point": "Pipeline",
  "root_cause": "No invariant enforcement",
  "status": "CRITICAL"
}
```

---

## ⚡ 2. Concurrency & Idempotency

### Attack Examples
- [ ] Submit same shipment 10-50x concurrently
- [ ] Duplicate NSW submission requests
- [ ] Duplicate webhook events

### Checks Required
- [ ] Only ONE accepted submission per shipment
- [ ] No duplicate charges
- [ ] Cross-service idempotency (NSW, Remita, webhooks)

### Fixes Implemented
- [ ] DB-level UNIQUE constraint on shipment_id + operation
- [ ] Idempotency key validation

### Failure Register Entry
```json
{
  "failure_point": "Duplicate submission accepted",
  "root_cause": "No DB idempotency",
  "status": "CRITICAL"
}
```

---

## 🌐 3. External Dependency Chaos

### Attack Examples
- [ ] NSW timeout → verify queue + retry logic
- [ ] Remita no response → verify blocking
- [ ] NAQS returns data conflicting with NAFDAC

### Checks Required
- [ ] Failure contained, unrelated shipments unaffected
- [ ] Circuit breakers activate
- [ ] Retry with exponential backoff works

### Fixes Implemented
- [ ] Adapter layer for external APIs
- [ ] Circuit breaker pattern
- [ ] Retry logic (built in ESB layer)

### Failure Register Entry
```json
{
  "failure_point": "External API failures not handled",
  "root_cause": "No circuit breakers",
  "status": "WEAK"
}
```

---

## 🔐 4. Signature System Attack

### Attack Examples
- [ ] Replay signed payload with old timestamp
- [ ] Modify signed payload after creation
- [ ] Use invalid/expired CA

### Checks Required
- [ ] Replay attacks blocked
- [ ] Payload mutation triggers hard block
- [ ] Certificate trust chain validated

### Fixes Implemented
- [ ] Timestamp binding in signature
- [ ] Nonce for one-time use
- [ ] Post-signature immutability enforcement

### Failure Register Entry
```json
{
  "failure_point": "Signature can be replayed",
  "root_cause": "No nonce/timestamp binding",
  "status": "CRITICAL"
}
```

---

## 💰 5. Financial Engine Stress

### Attack Examples
- [ ] FX drift: lock rate 1500, submit at 1650
- [ ] Partial payment (less than required)
- [ ] Overpayment

### Checks Required
- [ ] Payment mismatch flagged
- [ ] Ledger maintains integrity
- [ ] No silent acceptance of invalid amounts

### Fixes Implemented
- [ ] FX rate stored at calculation time
- [ ] Payment verification before submission
- [ ] Partial payment handling

### Failure Register Entry
```json
{
  "failure_point": "Payment not verified before submission",
  "root_cause": "No payment verification step",
  "status": "CRITICAL"
}
```

---

## 📦 6. Data Integrity

### Attack Examples
- [ ] Remove critical fields (HS code, destination)
- [ ] Inject invalid ISO codes
- [ ] Corrupt large payload (15MB document)

### Checks Required
- [ ] Immediate ingestion rejection
- [ ] Referential integrity validated
- [ ] Data provenance recorded

### Fixes Implemented
- [ ] Strict schema validation at API layer
- [ ] Required field enforcement

### Failure Register Entry
```json
{
  "failure_point": "Invalid data accepted",
  "root_cause": "Weak schema validation",
  "status": "WEAK"
}
```

---

## 🧠 7. Event System / Control Tower

### Attack Examples
- [ ] Send events out-of-order (C104 → C101)
- [ ] Send duplicates 5×
- [ ] Inject invalid HMAC events

### Checks Required
- [ ] Deterministic replay reconstructs exact state
- [ ] Duplicate events ignored
- [ ] Invalid events rejected and logged

### Fixes Implemented
- [ ] Event sequencing validation
- [ ] Event idempotency key

### Failure Register Entry
```json
{
  "failure_point": "Duplicate events not deduplicated",
  "root_cause": "No idempotent event processing",
  "status": "WEAK"
}
```

---

## 🧨 8. Throughput & Load

### Attack Examples
- [ ] 100-500 concurrent shipments
- [ ] Mix valid + invalid
- [ ] Random dependency failures

### Checks Required
- [ ] Latency measured
- [ ] Error rate measured
- [ ] Queue backlog handled
- [ ] Critical flows prioritized (AEO)

### Fixes Implemented
- [ ] Basic connection pooling
- [ ] Queue system preparation (BullMQ/Kafka)

### Failure Register Entry
```json
{
  "failure_point": "State inconsistencies under load",
  "root_cause": "Race conditions",
  "status": "WEAK"
}
```

---

## 📁 9. Audit / Legal Integrity

### Attack Examples
- [ ] Tamper logs, reorder events
- [ ] Delete audit record

### Checks Required
- [ ] Cryptographically chained logs detect modification
- [ ] Full shipment reconstruction possible
- [ ] Exportable court-ready dossier

### Fixes Implemented
- [ ] Immutable audit logs
- [ ] Event sourcing model

### Failure Register Entry
```json
{
  "failure_point": "Cannot reconstruct shipment",
  "root_cause": "Missing audit trail",
  "status": "CRITICAL"
}
```

---

## 🔍 10. Observability & Detection

### Attack Examples
- [ ] Blind system → inject failures without logging

### Checks Required
- [ ] Metrics: success/failure/retry rates
- [ ] Alerts trigger on threshold breach
- [ ] OpenTelemetry traces end-to-end

### Fixes Implemented
- [ ] Console logging
- [ ] Audit logging
- [ ] Error tracking

---

## 📋 Post-Test Output Format

For EACH failure, document:

```json
{
  "failure_point": "Pipeline / State / Signature / Financial / Data / Event / Load / Audit / Observability",
  "root_cause": "Exact reason it broke",
  "failure_type": "STATE | CONCURRENCY | EXTERNAL | DATA | SECURITY | FINANCIAL",
  "blast_radius": "Which shipments / modules affected",
  "fix_applied": "Changes made",
  "residual_risk": "What could still fail",
  "is_eliminated": true | false
}
```

---

## 🔑 Critical Thinking Rules

1. **Stop proving functionality → start proving survivability**

2. **Measure every failure → nothing ignored**

3. **Iterate until:**
   - No silent failure
   - No duplicate or corrupted state
   - No untraceable events

---

## 📊 Current Status

| Category | Status | Fixes Needed |
|----------|--------|--------------|
| Pipeline | 🔴 CRITICAL | State machine enforcement |
| Concurrency | 🔴 CRITICAL | DB idempotency |
| External Dependencies | ⚠️ WEAK | Circuit breakers |
| Signature | 🔴 CRITICAL | Nonce + timestamp binding |
| Financial | 🔴 CRITICAL | Payment verification |
| Data | ⚠️ WEAK | Schema validation |
| Events | ⚠️ WEAK | Event idempotency |
| Throughput | ✅ SAFE | Queue system ready |
| Audit | ✅ SAFE | Audit logs present |
| Observability | ⚠️ WEAK | Production metrics |

**Overall: 7 CRITICAL, 4 WEAK, 2 SAFE**