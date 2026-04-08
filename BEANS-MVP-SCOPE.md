# EU Beans MVP Scope - NL/DE (Rotterdam/Hamburg)

**Objective:** Deterministic "Safe-to-Ship" for Nigerian brown/white beans (Phaseolus vulgaris). No AI.

## A. Components ✅
- **Hard Gates** - aflatoxin>limit, Salmonella+, moisture>14%, batch mismatch, no trace/certs
- **Rule Engine** - PASS/FAIL evaluation
- **Lab Trust** - Tier1/2, batch verify, RASFF history → confidence 0-1
- **Extraction** - COA/lab/docs → JSON fields
- **Scoring** - 100 → -20 crit -5 mod +5 trust → clamp → BLOCKED/HIGH_RISK/SAFE
- **Audit Logs** - Immutable snapshots/hashes
- **Decision Layer** - DO_NOT_SHIP + fix cost/confidence

## B. Flow
1. Ingest → parse PDF/CSV
2. Rules → FAIL→BLOCKED
3. RASFF/lab trust
4. Score + confidence
5. Decision: `{"decision":"DO_NOT_SHIP","loss":"$12.5k","fix":"Tier1 retest $120"}`
6. Log

## C. Ex Output
```json
{
  "shipment_id": "BEAN001","health_score":78,"status":"HIGH_RISK",
  "lab_confidence":0.85,"recommended_action":{"decision":"DO_NOT_SHIP","loss":"$12,500","fix":"Retest Tier1 ($120)"}
}
```

## D. Assumptions
- NL/DE ports only
- Nigeria beans only
- Manual Tier1 labs
- Deterministic heuristics

**Status: PRODUCTION-READY**

