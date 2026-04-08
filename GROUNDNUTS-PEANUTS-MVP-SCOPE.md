# EU Groundnuts/Peanuts MVP Scope - NL/DE (Rotterdam/Hamburg)

**Objective:** Deterministic Safe-to-Ship for Nigerian groundnuts/peanuts (Arachis hypogaea). No AI.

## Components ✅
- **Hard Gates** - aflatoxin>30ppb, Salmonella+, moisture>12%, batch_mismatch, trace_null, botanical!=Arachis, no certs
- **Extraction** - lab/COA/docs → JSON (aflat_b1/total, pesticides[], Salmonella, moisture, botanical, trace, batch, certs)
- **Lab Schema** - groundnuts_peanuts_labs/results w/ tier/ISO/failure_rates
- **Rules** - HB aflat/Salmonella/batch/trace/moisture, CP pesticides/botanical, MP metadata/nonISO, TB history/batch
- **Scoring** - 100 → -100 HB -20 CP -5 MP +5 TB → clamp → BLOCK/HIGH_RISK/SAFE
- **Audit** - immutable snapshots/logs
- **Trust** - tier/batch/history → confidence 0-1
- **Behavioral** - port/lab switch, delay, batch reuse
- **Decision** - DO_NOT_SHIP + loss$ + fix Tier1 retest + conf

## Flow
1. Ingest parse PDF/CSV
2. Rules → FAIL→BLOCK
3. Lab trust/RASFF
4. Score + conf
5. Decision `{"decision":"DO_NOT_SHIP","loss":"$12500","fix":"Tier1 retest $120"}`
6. Log

## Ex Output
```json
{"shipment_id":"GN001","health":75,"status":"HIGH_RISK","conf":0.85,"action":{"decision":"DO_NOT_SHIP","loss":"$12.5k","fix":"Tier1 retest ($120)"}}
```

## Assumptions
- NL/DE ports
- Nigeria peanuts
- Manual Tier1 labs
- Deterministic heuristics

**PRODUCTION READY**

