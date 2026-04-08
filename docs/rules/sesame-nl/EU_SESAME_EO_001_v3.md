# Rule: EU_SESAME_EO_001_v3

## Metadata
- **Version**: 3.0
- **Effective Date**: 2026-01-01
- **Regulatory Reference**: EU 2023/915, Commission Implementing Regulation (EU) 2025/1043
- **Authority**: European Commission, NVWA (Netherlands)
- **Status**: Active

## Scope
- **Product**: Sesame seeds
- **Corridor**: Nigeria → Netherlands
- **Hazard Type**: Ethylene Oxide (EtO)
- **Product Category**: sesame

## Condition
- **Field**: `labResults.ethyleneOxide`
- **Operator**: `>`
- **Value**: 0.1 mg/kg (100 μg/kg)

## Effect
- **Type**: BLOCKER
- **Message**: Ethylene oxide residue exceeds EU maximum residue limit of 0.1 mg/kg

## Rationale
Ethylene oxide is carcinogenic and mutagenic. The EU has zero tolerance for ethylene oxide in sesame seeds imported from third countries following RASFF alerts in 2024-2025.

## Dynamic Threshold Adjustment
This rule supports risk-adjusted thresholds based on:
- Exporter history (3+ previous blockers → 20% stricter limit)
- Country risk flags (HIGH → 50% stricter limit)
- RASFF rejection rate >50% → Zero tolerance

## Related Rules
- `EU_SESAME_EO_001_v2` (superseded) - 0.05 mg/kg limit
- `EU_SESAME_EO_001_v1` (superseded) - 0.1 mg/kg limit

## Audit Example (PASS)
```json
{
  "ruleId": "EU_SESAME_EO_001_v3",
  "appliedThreshold": 0.1,
  "input": {
    "value": 0.05,
    "unit": "mg/kg",
    "labId": "LAB-NG-001",
    "labAccreditation": "ISO 17025",
    "analysisDate": "2026-03-15"
  },
  "result": "PASS",
  "timestamp": "2026-03-28T10:23:00Z",
  "context": {
    "shipmentId": "CB-2026-001",
    "exporterId": "EXP-NG-001",
    "corridor": "NG-NL"
  },
  "engineVersion": "1.2.0"
}
```

## Audit Example (BLOCKER)
```json
{
  "ruleId": "EU_SESAME_EO_001_v3",
  "appliedThreshold": 0.1,
  "input": {
    "value": 0.15,
    "unit": "mg/kg",
    "labId": "LAB-NG-002",
    "labAccreditation": "ISO 17025",
    "analysisDate": "2026-03-20"
  },
  "result": "BLOCKER",
  "timestamp": "2026-03-28T11:45:00Z",
  "context": {
    "shipmentId": "CB-2026-002",
    "exporterId": "EXP-NG-002",
    "corridor": "NG-NL"
  },
  "engineVersion": "1.2.0"
}
```

## Changelog
| Version | Date | Changes |
|---------|------|---------|
| v3 | 2026-01-01 | Updated limit to 0.1 mg/kg, added dynamic threshold support |
| v2 | 2025-06-01 | Interim limit 0.05 mg/kg (withdrawn) |
| v1 | 2024-07-01 | Initial release following RASFF alert |

## References
- [EU 2023/915](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32023R0915)
- [RASFF Portal](https://food.ec.europa.eu/rasff-window-circabc-web/) - Search: "sesame ethylene oxide"
- [NVWA Guidance](https://www.nvwa.nl/onderwerpen/ethyleenoxide)