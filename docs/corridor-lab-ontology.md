# Corridor & Lab Ontology Mapping

This document provides the complete mapping of products to required lab tests and documents per corridor.

## Overview

The mapping is versioned and auto-generated from the engine's rule definitions. Updates to rules automatically reflect here.

## Product → Corridor → Labs → Documents Mapping

### Sesame Seeds

| Corridor | Origin | Destination | Required Labs | Required Documents |
|----------|--------|-------------|---------------|---------------------|
| NG-NL | Nigeria | Netherlands | Ethylene Oxide, Aflatoxin B1, Aflatoxin Total, Salmonella | Phytosanitary, CoO, Lab Report |
| NG-DE | Nigeria | Germany | Ethylene Oxide, Aflatoxin B1, Aflatoxin Total, Salmonella | Phytosanitary, CoO, Lab Report |
| GH-NL | Ghana | Netherlands | Aflatoxin B1, Aflatoxin Total | Phytosanitary, CoO, Lab Report |
| ET-NL | Ethiopia | Netherlands | Aflatoxin B1, Salmonella | Phytosanitary, CoO, Lab Report |

### Cocoa Beans

| Corridor | Origin | Destination | Required Labs | Required Documents |
|----------|--------|-------------|---------------|---------------------|
| NG-NL | Nigeria | Netherlands | Aflatoxin B1, Cadmium, Heavy Metals | Phytosanitary, CoO, EUDR, Lab Report |
| NG-DE | Nigeria | Germany | Aflatoxin B1, Cadmium, Pesticides | Phytosanitary, CoO, EUDR, Lab Report |
| GH-NL | Ghana | Netherlands | Aflatoxin B1, Cadmium | Phytosanitary, CoO, EUDR, Lab Report |

### Groundnuts/Peanuts

| Corridor | Origin | Destination | Required Labs | Required Documents |
|----------|--------|-------------|---------------|---------------------|
| NG-NL | Nigeria | Netherlands | Aflatoxin B1, Aflatoxin Total | Phytosanitary, CoO, Lab Report |
| GH-NL | Ghana | Netherlands | Aflatoxin B1 | Phytosanitary, CoO, Lab Report |

### Cashew Nuts

| Corridor | Origin | Destination | Required Labs | Required Documents |
|----------|--------|-------------|---------------|---------------------|
| NG-NL | Nigeria | Netherlands | Aflatoxin B1, Aflatoxin Total, Pesticides | Phytosanitary, CoO, Lab Report |
| NG-DE | Nigeria | Germany | Aflatoxin B1, Aflatoxin Total, Pesticides | Phytosanitary, CoO, Lab Report |

### Ginger

| Corridor | Origin | Destination | Required Labs | Required Documents |
|----------|--------|-------------|---------------|---------------------|
| NG-NL | Nigeria | Netherlands | Pesticides (multi-residue), Salmonella | Phytosanitary, CoO, Lab Report |
| NG-DE | Nigeria | Germany | Pesticides (multi-residue), Heavy Metals | Phytosanitary, CoO, Lab Report |

## Lab Entity Schema

```json
{
  "lab_id": "string",
  "name": "string",
  "country": "string",
  "accreditation": "ISO 17025 | ISO 15189 | Other",
  "accreditation_body": "string",
  "scope": ["aflatoxin", "pesticides", "ethylene_oxide", "salmonella", "heavy_metals", "mycotoxins"],
  "verification_status": "CURRENT | PENDING | EXPIRED",
  "verified_at": "ISO8601",
  "expires_at": "ISO8601",
  "tier": 1 | 2 | 3,
  "contact": {
    "email": "string",
    "phone": "string"
  }
}
```

## Lab Tier System

| Tier | Description | Trust Level | Auto-Accept |
|------|-------------|-------------|--------------|
| 1 | Internationally accredited (ISO 17025), high volume | Highest | Yes |
| 2 | Nationally accredited, verified scope | Medium | Yes (with manual review) |
| 3 | Other verified labs | Lower | No (manual review) |

## Lab Ontology - Hazard Mapping

| Hazard | Test Method | Unit | EU MRL ( Sesame) | EU MRL (Cocoa) |
|--------|-------------|------|------------------|----------------|
| Aflatoxin B1 | HPLC-FLD | μg/kg | 2.0 | 5.0 |
| Aflatoxin Total | HPLC-FLD | μg/kg | 4.0 | - |
| Ethylene Oxide | GC-MS | mg/kg | 0.1 | - |
| Salmonella | PCR | cfu/25g | 0 (ZT) | - |
| Cadmium | ICP-MS | mg/kg | - | 0.5 |
| Pesticides | GC-MS/MS | mg/kg | 0.05 (per substance) | 0.05 |

ZT = Zero Tolerance

## Document Types

| Document Type | Description | Required For |
|---------------|-------------|--------------|
| `phytosanitary` | Phytosanitary certificate from origin country | All corridors |
| `certificate_of_origin` | Certificate of Origin (CoO) | All corridors |
| `lab_report` | Laboratory test results | All corridors |
| `eudr` | EU Deforestation Regulation proof | EU destinations (since Dec 2024) |
| `packing_list` | Packing list with batch details | Optional |
| `invoice` | Commercial invoice | Optional |

## Dynamic Mapping Support

The mapping system supports dynamic adjustments based on:
- **RASFF Alerts**: If corridor has recent rejections, stricter requirements apply
- **Exporter History**: Problematic exporters may require additional tests
- **Risk Score**: Elevated risk triggers additional document requirements

## Update Process

1. Rule engine updates threshold → mapping auto-generates new MRL values
2. Lab registry adds new lab → mapping auto-includes in valid labs
3. Corridor rules change → mapping updates required documents

## Version Information

- **Last Updated**: 2026-03-31
- **Mapping Version**: 1.2.0
- **Source**: Engine rule definitions v1.2.0