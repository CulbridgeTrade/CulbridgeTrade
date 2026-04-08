# Audit Log Structure Documentation

This document describes the complete audit log structure for Culbridge compliance engine.

## Overview

All audit log entries are immutable and append-only. Each entry captures:
- The exact rule or component that was evaluated
- The input values provided
- The result (PASS/BLOCKER/WARNING)
- Timestamp and context for traceability

## Audit Log Entry Schema

```json
{
  "audit_id": "string",
  "shipment_id": "string",
  "timestamp": "ISO8601",
  
  "component": "string",
  "component_version": "string",
  
  "result": "PASS | BLOCKER | WARNING",
  "severity": "INFO | WARNING | BLOCKER",
  
  "input": { ... },
  "expected": { ... },
  "actual": { ... },
  
  "context": {
    "shipment_id": "string",
    "exporter_id": "string",
    "corridor": "string",
    "product_category": "string"
  },
  
  "rule_id": "string (if applicable)",
  "rule_version": "string (if applicable)",
  
  "linked_resources": {
    "lab_id": "string (optional)",
    "document_ids": ["string"] (optional)
  }
}
```

## Field Descriptions

### Top-Level Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `audit_id` | string | Yes | Unique identifier for this audit entry |
| `shipment_id` | string | Yes | The shipment being evaluated |
| `timestamp` | ISO8601 | Yes | When the evaluation occurred |
| `component` | string | Yes | Which component was evaluated (e.g., "rule", "lab", "document", "threshold") |
| `component_version` | string | Yes | Version of the component code |
| `result` | enum | Yes | PASS, BLOCKER, or WARNING |
| `severity` | enum | Yes | INFO, WARNING, or BLOCKER |

### Input/Expected/Actual

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `input` | object | Yes | The actual input values provided |
| `input.value` | number | Yes | The measured/observed value |
| `input.unit` | string | Yes | Unit of measurement |
| `input.lab_id` | string | No | Lab that performed the test |
| `input.lab_accreditation` | string | No | Lab's accreditation (ISO 17025) |
| `expected` | object | Sometimes | Expected threshold or value |
| `expected.threshold` | number | Sometimes | The limit being checked against |
| `actual` | object | Sometimes | Actual values after any adjustments |
| `actual.adjustment_factor` | number | No | Dynamic threshold adjustment factor (0.0-1.0) |

### Context

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `context.shipment_id` | string | Yes | Shipment being evaluated |
| `context.exporter_id` | string | No | Exporter identifier |
| `context.corridor` | string | No | Origin-Destination (e.g., "NG-NL") |
| `context.product_category` | string | No | Product type (sesame, cocoa, etc.) |

### Rule-Specific Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `rule_id` | string | For rules | The rule that was evaluated |
| `rule_version` | string | For rules | Version of the rule |
| `rule.source` | string | For rules | Regulatory reference |

### Linked Resources

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `linked_resources.lab_id` | string | No | Lab entity used for testing |
| `linked_resources.document_ids` | array | No | Documents referenced |

## Example Audit Log Entries

### 1. Rule Evaluation (BLOCKER)

```json
{
  "audit_id": "AUDIT-20260328102300-001",
  "shipment_id": "CB-2026-001",
  "timestamp": "2026-03-28T10:23:00Z",
  
  "component": "rule",
  "component_version": "1.2.0",
  
  "result": "BLOCKER",
  "severity": "BLOCKER",
  
  "input": {
    "value": 0.15,
    "unit": "mg/kg",
    "lab_id": "LAB-NG-001",
    "lab_accreditation": "ISO 17025",
    "analysis_date": "2026-03-15"
  },
  "expected": {
    "threshold": 0.1,
    "threshold_version": "1.0.0",
    "regulation": "EU 2023/915"
  },
  "actual": {
    "adjusted_threshold": 0.1,
    "adjustment_factor": 1.0
  },
  
  "context": {
    "shipment_id": "CB-2026-001",
    "exporter_id": "EXP-NG-001",
    "corridor": "NG-NL",
    "product_category": "sesame"
  },
  
  "rule_id": "EU_SESAME_EO_001_v3",
  "rule_version": "3.0",
  "rule": {
    "name": "Ethylene Oxide Limit",
    "source": "EU 2023/915, NVWA"
  },
  
  "linked_resources": {
    "lab_id": "LAB-NG-001",
    "document_ids": ["DOC-001"]
  }
}
```

### 2. Lab Validation (PASS)

```json
{
  "audit_id": "AUDIT-20260328102400-002",
  "shipment_id": "CB-2026-001",
  "timestamp": "2026-03-28T10:24:00Z",
  
  "component": "lab",
  "component_version": "1.2.0",
  
  "result": "PASS",
  "severity": "INFO",
  
  "input": {
    "lab_id": "LAB-NG-001",
    "accreditation": "ISO 17025",
    "scope": ["aflatoxin", "pesticides", "ethylene_oxide"],
    "verification_date": "2026-01-15"
  },
  
  "expected": {
    "required_accreditation": "ISO 17025",
    "required_scope": ["aflatoxin"]
  },
  "actual": {
    "verified": true,
    "verification_status": "CURRENT",
    "expiry_date": "2027-01-15"
  },
  
  "context": {
    "shipment_id": "CB-2026-001",
    "exporter_id": "EXP-NG-001"
  },
  
  "linked_resources": {
    "lab_id": "LAB-NG-001"
  }
}
```

### 3. Dynamic Threshold Adjustment

```json
{
  "audit_id": "AUDIT-20260328102000-003",
  "shipment_id": "CB-2026-001",
  "timestamp": "2026-03-28T10:20:00Z",
  
  "component": "threshold",
  "component_version": "1.2.0",
  
  "result": "WARNING",
  "severity": "WARNING",
  
  "input": {
    "exporter_history": {
      "previous_blockers": 3,
      "previous_warnings": 2
    },
    "country_risk": {
      "salmonella": "HIGH",
      "aflatoxin": "MEDIUM"
    },
    "rasff_rejection_rate": {
      "salmonella": 0.85,
      "aflatoxin": 0.45
    }
  },
  "expected": {
    "base_threshold": 2.0,
    "threshold_version": "1.0.0"
  },
  "actual": {
    "adjusted_threshold": 1.0,
    "adjustment_factor": 0.5,
    "applied_rules": ["MAX_REDUCTION_CAP", "COUNTRY_RISK_HIGH"]
  },
  
  "context": {
    "shipment_id": "CB-2026-001",
    "exporter_id": "EXP-NG-001",
    "corridor": "NG-NL",
    "product_category": "sesame"
  },
  
  "linked_resources": {}
}
```

### 4. Document Validation

```json
{
  "audit_id": "AUDIT-20260328102500-004",
  "shipment_id": "CB-2026-001",
  "timestamp": "2026-03-28T10:25:00Z",
  
  "component": "document",
  "component_version": "1.2.0",
  
  "result": "PASS",
  "severity": "INFO",
  
  "input": {
    "document_id": "DOC-001",
    "document_type": "phytosanitary",
    "file_hash": "sha256:abc123...",
    "upload_date": "2026-03-20"
  },
  "expected": {
    "required_documents": ["phytosanitary", "certificate_of_origin", "lab_report"]
  },
  "actual": {
    "verified": true,
    "verification_method": "hash_match",
    "issuer_verified": true
  },
  
  "context": {
    "shipment_id": "CB-2026-001",
    "exporter_id": "EXP-NG-001"
  },
  
  "linked_resources": {
    "document_ids": ["DOC-001"]
  }
}
```

## Audit Log Retrieval

### Get all audit logs for a shipment
```
GET /shipments/{id}/audit
```

### Filter by component
```
GET /shipments/{id}/audit?component=rule
GET /shipments/{id}/audit?component=lab
GET /shipments/{id}/audit?component=threshold
```

### Filter by date range
```
GET /shipments/{id}/audit?from_date=2026-03-01&to_date=2026-03-31
```

## Regulatory Compliance

The audit log structure ensures:
- **Traceability**: Every decision linked to exact inputs and context
- **Determinism**: Same inputs → same audit trail
- **Auditability**: Regulators can trace any shipment's compliance journey
- **Legal Defense**: Complete evidence for compliance disputes

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2024-01-01 | Initial audit log structure |
| 1.1 | 2025-06-01 | Added threshold adjustment tracking |
| 1.2 | 2026-01-01 | Added dynamic threshold factors |