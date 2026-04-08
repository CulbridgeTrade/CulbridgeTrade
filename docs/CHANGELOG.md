# Culbridge Change Log & Version History

This document tracks all significant changes to the Culbridge compliance engine, schemas, rules, and documentation.

## Version 1.2.0 (2026-03-31)

### Engine
- **New**: Dynamic threshold engine with risk-adjusted limits
- **New**: RASFF alert integration for corridor risk scoring
- **New**: Zero tolerance enforcement for high-risk corridors
- **Enhancement**: Deterministic engine now includes Stage 0.5 (dynamic thresholds)
- **Enhancement**: Threshold audit logging with version tracking

### Security
- **New**: MFA enforcement for admin/auditor roles
- **New**: Brute-force protection with account lockout
- **New**: External API sandbox with permission controls
- **Enhancement**: RBAC enforcement on sensitive actions

### Error Handling
- **Enhancement**: All error handling already production-ready (circuit breakers, retry policies, graceful degradation)
- **Enhancement**: Warnings now emit events for dashboard alerts

### Documentation
- **New**: Versioned rule documentation structure
- **New**: Audit log structure documentation
- **New**: Corridor & lab ontology mapping documentation

## Version 1.1.0 (2025-06-01)

### Engine
- **New**: Support for ethylene oxide testing (sesame → EU)
- **New**: Dynamic mapping for extractor outputs
- **Enhancement**: EUDR compliance checking
- **Enhancement**: Lab trust scoring system

### Schemas
- **New**: `engine/schemas/risk-profiling.ts` - Risk profile types
- **New**: `engine/schemas/threshold.ts` - Threshold version schema

### Error Handling
- **New**: Circuit breaker for external APIs
- **New**: Retry with exponential backoff
- **New**: Safe execution wrapper

## Version 1.0.0 (2024-01-01)

### Core Features
- Deterministic rule evaluation engine
- Multi-corridor support (Nigeria → NL/DE, Ghana → NL/DE)
- Lab result validation (aflatoxin, salmonella, pesticides)
- Document verification
- HS code validation
- Full audit trail

### Schemas
- Shipment, LabResult, Document, Rule, EvaluationResult

### API
- OpenAPI 3.0 specification
- RESTful endpoints for all operations

---

## Change Categories

### Schema Changes
| Version | Schema | Change Type | Description |
|---------|--------|-------------|-------------|
| 1.2.0 | Shipment | Added | `risk` field for RASFF flags |
| 1.2.0 | EngineError | Added | `context` field for debug info |
| 1.1.0 | LabResult | Added | `ethyleneOxide` test |
| 1.0.0 | - | Initial | Core schemas |

### Rule Changes
| Version | Rule ID | Change Type | Description |
|---------|---------|-------------|-------------|
| 1.2.0 | EU_SESAME_EO_001 | Updated | Dynamic threshold support |
| 1.1.0 | EU_SESAME_EO_001 | Added | New EtO limit (0.1 mg/kg) |
| 1.0.0 | EU_SESAME_AFLATOXIN | Initial | 2.0 μg/kg limit |

### Corridor Mapping Changes
| Version | Corridor | Change | Description |
|---------|----------|--------|-------------|
| 1.2.0 | NG-NL (sesame) | Enhanced | Dynamic threshold rules |
| 1.1.0 | NG-DE (sesame) | Added | New corridor support |
| 1.0.0 | NG-NL | Initial | Core corridors |

---

## Deprecation Notices

### Scheduled Deprecations
| Item | Deprecated In | Remove In | Replacement |
|------|---------------|-----------|--------------|
| `rules-v1.0.json` | 1.1.0 | 2.0.0 | `rules-v1.2.json` |
| Legacy audit format | 1.2.0 | 2.0.0 | New audit with threshold tracking |

---

## Migration Guides

### 1.0 → 1.1
- Update rule IDs to include version (e.g., `SESAME_NL_001` → `EU_SESAME_AFLATOXIN_001_v1`)
- Add ethylene oxide tests to sesame lab validation
- Enable EUDR checking for EU destinations

### 1.1 → 1.2
- Integrate dynamic threshold engine
- Update audit logging to include threshold adjustment factors
- Enable MFA for admin/auditor users
- Configure rate limiting for API access

---

## Release Tags

- `v1.2.0` - Current (2026-03-31)
- `v1.1.0` - Previous (2025-06-01)
- `v1.0.0` - Initial (2024-01-01)