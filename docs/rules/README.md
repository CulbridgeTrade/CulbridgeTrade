# Versioned Rule Documentation

This directory contains versioned documentation for all compliance rules in the Culbridge engine.

## Rule ID Format
`{CORRIDOR}_{PRODUCT}_{HAZARD}_{VERSION}`

Example: `EU_SESAME_EO_001_v3`

## Available Rules

### Sesame → Netherlands (EU)

| Rule ID | Version | Hazard | Threshold | Effective Date |
|---------|---------|--------|-----------|-----------------|
| [EU_SESAME_AFLATOXIN_B1_001_v1.md](sesame-nl/EU_SESAME_AFLATOXIN_B1_001_v1.md) | v1 | Aflatoxin B1 | 2.0 μg/kg | 2024-01-01 |
| [EU_SESAME_AFLATOXIN_TOTAL_001_v1.md](sesame-nl/EU_SESAME_AFLATOXIN_TOTAL_001_v1.md) | v1 | Total Aflatoxin | 4.0 μg/kg | 2024-01-01 |
| [EU_SESAME_SALMONELLA_001_v1.md](sesame-nl/EU_SESAME_SALMONELLA_001_v1.md) | v1 | Salmonella | 0 (Zero Tolerance) | 2024-01-01 |
| [EU_SESAME_EO_001_v3.md](sesame-nl/EU_SESAME_EO_001_v3.md) | v3 | Ethylene Oxide | 0.1 mg/kg | 2026-01-01 |

### Sesame → Germany (EU)

| Rule ID | Version | Hazard | Threshold | Effective Date |
|---------|---------|--------|-----------|-----------------|
| [EU_DE_SESAME_AFLATOXIN_001_v1.md](sesame-de/EU_DE_SESAME_AFLATOXIN_001_v1.md) | v1 | Aflatoxin B1 | 2.0 μg/kg | 2024-01-01 |
| [EU_DE_SESAME_PESTICIDE_001_v1.md](sesame-de/EU_DE_SESAME_PESTICIDE_001_v1.md) | v1 | Pesticides | 0.05 mg/kg | 2024-01-01 |

### Cocoa → Netherlands (EU)

| Rule ID | Version | Hazard | Threshold | Effective Date |
|---------|---------|--------|-----------|-----------------|
| [EU_COCOA_AFLATOXIN_001_v1.md](cocoa-nl/EU_COCOA_AFLATOXIN_001_v1.md) | v1 | Aflatoxin B1 | 5.0 μg/kg | 2024-01-01 |
| [EU_COCOA_CADMIUM_001_v1.md](cocoa-nl/EU_COCOA_CADMIUM_001_v1.md) | v1 | Cadmium | 0.5 mg/kg | 2024-01-01 |

### Groundnuts → Netherlands (EU)

| Rule ID | Version | Hazard | Threshold | Effective Date |
|---------|---------|--------|-----------|-----------------|
| [EU_GROUNDNUTS_AFLATOXIN_001_v1.md](groundnuts-nl/EU_GROUNDNUTS_AFLATOXIN_001_v1.md) | v1 | Aflatoxin B1 | 8.0 μg/kg | 2024-01-01 |

## Rule Template

```markdown
# Rule: {RULE_ID}

## Metadata
- **Version**: {VERSION}
- **Effective Date**: {DATE}
- **Regulatory Reference**: {REGULATION}
- **Authority**: {AUTHORITY}

## Scope
- **Product**: {PRODUCT}
- **Corridor**: {ORIGIN} → {DESTINATION}
- **Hazard Type**: {HAZARD}

## Condition
- **Field**: {FIELD_PATH}
- **Operator**: {OPERATOR}
- **Value**: {THRESHOLD_VALUE} {UNIT}

## Effect
- **Type**: BLOCKER | WARNING
- **Message**: {MESSAGE}

## Audit Example
```json
{
  "ruleId": "{RULE_ID}",
  "input": { "value": 1.5, "unit": "μg/kg", "labId": "lab_001" },
  "result": "PASS",
  "timestamp": "2026-03-28T10:23:00Z",
  "context": { "shipmentId": "shipment_001" }
}
```

## Changelog
| Version | Date | Changes |
|---------|------|---------|
| v1 | 2024-01-01 | Initial release |
```

## Quick Reference

### MRL Limits (μg/kg)
| Product | Aflatoxin B1 | Aflatoxin Total | Salmonella |
|---------|-------------|-----------------|------------|
| Sesame | 2.0 | 4.0 | 0 (ZT) |
| Groundnuts | 8.0 | - | - |
| Cocoa | 5.0 | - | - |
| Cashew | 5.0 | - | - |

ZT = Zero Tolerance (any detection = BLOCKER)