# 🗺️ Culbridge Attack & Coverage Map

## Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Fixed / Covered |
| ⚠️ | Needs Hardening / Pending Fix |

## Attack Type Abbreviations

| Code | Type |
|------|------|
| DATA | Schema / field corruption |
| STATE | Stage / workflow integrity |
| CONCURRENCY | Race conditions / idempotency |
| SECURITY | Signature, privilege, access |
| EXTERNAL | NSW, Remita, webhooks |
| FINANCIAL | Ledger, payment, FX |
| EVENT | Sequence / webhook |
| AUDIT | Log integrity |
| STRESS | Load / throughput / backpressure |

---

## Module / Layer Coverage Map

| Module / Layer | Attack Vector | Attack Type | Status | Protection / Fix | Notes |
|---------------|---------------|-------------|--------|-------------------|-------|
| **HS Code Validator** | Invalid HS code injection | DATA | ⚠️ | Zod schemas applied | Must test HS → certificate → shipment match |
| **Document Vault** | Oversized / corrupted payload | DATA | ✅ | Payload limits, Zod | 20MB max enforced |
| **Entity Sync** | Duplicate entity creation | CONCURRENCY | ✅ | Idempotency middleware | Verify race conditions across 50x requests |
| **Compliance Engine** | Stage skipping / invalid state | STATE | ⚠️ | Middleware state-validator.js | Test SIGNED → FINANCE → COMPLIANCE sequences |
| **Fee Calculator** | Fee exposure to API | FINANCIAL | ⚠️ | RBAC filters pending | Ensure only internal roles see fee breakdown |
| **Clean Declaration Builder** | Cross-field mismatch | DATA | ⚠️ | Zod + field validation | HS → declaration → shipment consistency |
| **Digital Signature** | Replay / timestamp attack | SECURITY | ⚠️ | HMAC + nonce + timestamp (applied) | Test signature replay / expired signature |
| **NSW ESB Submission** | External chaos / timeout | EXTERNAL | ✅ | Circuit breaker + retry | Simulate partial failure / retry storm |
| **Webhook Listener** | Duplicate / out-of-order events | EVENT | ✅ | Idempotency + sequence validation | 20x duplicates tested |
| **Audit Logger** | Log tampering | AUDIT | ⚠️ | Immutable, hash-chained logs (ready) | Full replay validation needed |
| **Finance Ledger** | FX mismatch / ledger tampering | FINANCIAL | ⚠️ | Double-entry + RBAC (applied) | Test payment replay / FX rate inconsistencies |
| **Identity / Metadata** | Privilege escalation / sensitive exposure | SECURITY | ✅ | Founder & team attribution internal-only | No direct access to operations or financials |
| **Resilience Layer** | Queue overload / throughput stress | STRESS | ✅ | Circuit breaker / backpressure | Simulate 500 shipments / 30% invalid / 10% malicious |
| **API Gateway** | Rate limiting bypass | CONCURRENCY | ✅ | express-rate-limit | 100 req/min per IP |
| **Input Validation** | Invalid JSON / schema attacks | DATA | ✅ | Zod schemas applied | Webhook + module inputs validated |

---

## Current Protection Status

### ✅ Fully Protected (8 modules)
- Document Vault (DATA)
- Entity Sync (CONCURRENCY)
- NSW ESB Submission (EXTERNAL)
- Webhook Listener (EVENT)
- Identity / Metadata (SECURITY)
- Resilience Layer (STRESS)
- API Gateway (CONCURRENCY)
- Input Validation (DATA)

### ⚠️ Needs Hardening (6 modules)

| Module | Attack Type | Next Action |
|--------|-------------|-------------|
| HS Code Validator | DATA | Cross-field validation with certificates |
| Compliance Engine | STATE | DB constraints + middleware tests |
| Fee Calculator | FINANCIAL | RBAC filter for sensitive fields |
| Clean Declaration Builder | DATA | Schema tie with HS + shipment |
| Digital Signature | SECURITY | Replay / timestamp tests |
| Audit Logger | AUDIT | Hash chaining validation |
| Finance Ledger | FINANCIAL | FX / payment replay tests |

---

## Attack Surface Summary

```
Total Modules: 14
✅ Protected: 8 (57%)
⚠️ Hardening: 6 (43%)
```

---

## Dev Team Focus Areas

### Priority 1: Critical State & Financial

1. **Compliance Engine** - DB constraints for state transitions
   - Test: SIGNED → COMPLIANCE → REJECTED sequences
   
2. **Finance Ledger** - FX rate validation
   - Test: Payment replay with mismatched FX

### Priority 2: Data Integrity

3. **HS Code Validator** - Cross-field validation
   - Test: Invalid HS → mismatched certificate

4. **Clean Declaration Builder** - Schema consistency
   - Test: HS code vs declaration mismatch

### Priority 3: Security & Audit

5. **Digital Signature** - Replay protection
   - Test: Expired timestamp rejection

6. **Audit Logger** - Hash chain verification
   - Test: Tamper detection

---

## Red Team Test Coverage

| Test ID | Attack Type | Coverage |
|---------|-------------|----------|
| STATE-001/002 | STATE | ✅ Middleware ready |
| CONC-001 | CONCURRENCY | ✅ Idempotency ready |
| SIGN-001/002 | SECURITY | ✅ HMAC ready |
| FIN-001/002 | FINANCIAL | ⚠️ RBAC pending |
| EXT-001/002 | EXTERNAL | ✅ Validation ready |
| DATA-001 | DATA | ✅ Zod ready |
| LOAD-001 | STRESS | ✅ Passed |
| AUDIT-001 | AUDIT | ⚠️ Hash chaining ready |

---

## Evidence Output Format

Every attack test must produce:

```json
{
  "attack_id": "STATE-001",
  "failure_point": "Illegal state injection",
  "root_cause": "No DB constraint on current_state",
  "failure_type": "STATE",
  "blast_radius": "SYSTEMIC",
  "detectability": "HIGH",
  "fix_required": "ADD_CONSTRAINT_CHECK",
  "is_system_safe": false
}
```

---

## Next Steps

1. **Run Full Red-Team Suite** - All 12+ attack vectors
2. **Focus on ⚠️ Modules** - Priority 1-3 above
3. **Stress Testing** - 500 shipments + failure injection
4. **Evidence Collection** - JSON output per test

---

**Attribution:** David | CEO & Founder | Culbridge (internal)
**Team:** Culbridge Team – engineered responsibly