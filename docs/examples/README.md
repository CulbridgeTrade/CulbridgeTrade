# Auto-Generated Sample Payloads

This directory contains auto-generated sample JSON payloads for testing and development.

## Available Examples

### Shipments

| File | Description |
|------|-------------|
| [sesame-nl-pass.json](shipments/sesame-nl-pass.json) | Sesame → NL, all tests pass |
| [sesame-nl-blocker.json](shipments/sesame-nl-blocker.json) | Sesame → NL, EtO BLOCKER |
| [cocoa-nl-pass.json](shipments/cocoa-nl-pass.json) | Cocoa → NL, all tests pass |
| [groundnuts-nl-warning.json](shipments/groundnuts-nl-warning.json) | Groundnuts → NL, warning |

### Lab Results

| File | Description |
|------|-------------|
| [sesame-lab-pass.json](labs/sesame-lab-pass.json) | Sesame lab results within limits |
| [sesame-lab-fail.json](labs/sesame-lab-fail.json) | Sesame lab results exceeding MRL |
| [cocoa-lab-pass.json](labs/cocoa-lab-pass.json) | Cocoa lab results within limits |

### Documents

| File | Description |
|------|-------------|
| [complete-documents.json](documents/complete-documents.json) | All required documents |
| [missing-documents.json](documents/missing-documents.json) | Missing required documents |

### Engine Outputs

| File | Description |
|------|-------------|
| [evaluation-pass.json](engine-outputs/evaluation-pass.json) | Evaluation result - PASS |
| [evaluation-warning.json](engine-outputs/evaluation-warning.json) | Evaluation result - WARNING |
| [evaluation-blocker.json](engine-outputs/evaluation-blocker.json) | Evaluation result - BLOCKER |

## Sample: Sesame → NL (Pass)

```json
{
  "shipment_id": "CB-2026-001",
  "status": "DRAFT",
  "product": "sesame seeds",
  "category": "sesame",
  "hs_code": "1207.40.10",
  "origin_country": "NG",
  "destination_country": "NL",
  "batch_number": "CB-2026-001",
  "quantity_kg": 25000,
  "exporter_id": "EXP-NG-001",
  
  "lab_results": {
    "aflatoxinB1": 1.2,
    "aflatoxinTotal": 2.5,
    "ethyleneOxide": 0.05,
    "salmonella": 0
  },
  
  "documents": {
    "required": ["phytosanitary", "certificate_of_origin", "lab_report"],
    "uploaded": [
      {
        "type": "phytosanitary",
        "status": "VALID",
        "uploaded_at": "2026-03-20T10:00:00Z"
      },
      {
        "type": "certificate_of_origin",
        "status": "VALID",
        "uploaded_at": "2026-03-20T10:05:00Z"
      },
      {
        "type": "lab_report",
        "status": "VALID",
        "uploaded_at": "2026-03-20T10:10:00Z"
      }
    ]
  },
  
  "traceability": {
    "origin_chain_complete": true,
    "geolocation": [
      { "lat": 9.082, "lng": 8.675, "timestamp": "2026-01-15T08:00:00Z" }
    ]
  }
}
```

## Sample: Evaluation Result (BLOCKER)

```json
{
  "shipment_id": "CB-2026-002",
  "status": "REJECTED",
  "final_decision": "BLOCKED",
  "score": 35,
  
  "blockers": [
    {
      "rule_id": "EU_SESAME_EO_001_v3",
      "severity": "BLOCKER",
      "code": "ETHYLENE_OXIDE_EXCEEDS_LIMIT",
      "message": "Ethylene oxide 0.15 mg/kg exceeds EU limit of 0.1 mg/kg",
      "input_value": 0.15,
      "threshold": 0.1,
      "unit": "mg/kg"
    }
  ],
  
  "warnings": [],
  
  "audit_log": [
    {
      "audit_id": "AUDIT-20260328102300-001",
      "rule_id": "EU_SESAME_EO_001_v3",
      "input": { "value": 0.15, "unit": "mg/kg" },
      "result": "BLOCKER",
      "timestamp": "2026-03-28T10:23:00Z"
    }
  ],
  
  "engine_version": "1.2.0",
  "evaluated_at": "2026-03-28T10:23:00Z"
}
```

## Usage

These examples can be used for:
- **Testing**: Import into Postman or similar
- **Development**: Quick setup for local testing
- **Documentation**: Reference for API consumers
- **Training**: Onboarding new team members

## Regeneration

To regenerate examples with current engine version:
```bash
node engine/test-runner.js --generate-examples