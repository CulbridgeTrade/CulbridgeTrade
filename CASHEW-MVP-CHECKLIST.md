# EU Cashew MVP Launch Checklist (NL & DE)

**Status: ✅ PRODUCTION READY - Zero Assumptions**

| # | Task | Status | Files |
|---|------|--------|-------|
| 1 | Define NL & DE corridor | ✅ | rules-cashew-v1.0.json (destinations:["NL","DE"]) |
| 2 | Implement hard gates | ✅ | rules-cashew-v1.0.json (9 HARD_GATE: aflatoxin/Salmonella/moisture/batch/botanical/certs/traceability) |
| 3 | Implement scoring engine | ✅ | engine/scoreStatusEngine.js (100 → penalties → boosts → clamp → status) |
| 4 | Define Tier 1/Tier 2 labs + confidence | ✅ | db/lab-trust-schema.sql (Tier1 ISO17025 clean RASFF → confidence 95) |
| 5 | Deterministic rule logs & audit | ✅ | db/schema.sql RuleLogs + immutable_snapshot/sha256 (ruleEngine.js) |
| 6 | Map lab reports/certificates/shipping docs | ✅ | db/cashew-lab-schema.sql + CashewLabReports table |
| 7 | JSON schemas (lab, mapping, scoring, trust) | ✅ | cashew-lab-schema.sql, rules-cashew-v1.0.json, enforcement-model.json |
| 8 | Full auditability | ✅ | Every rule logged w/ snapshot/reason/timestamp |

**Test:**
```bash
curl -X POST http://localhost:3000/shipments/CASHEW-NL-001/evaluate
```

**Output:** Deterministic BLOCKED/HIGH_RISK/SAFE + full audit trail.

**Live:** localhost:3000. Cashew NL/DE operational.

