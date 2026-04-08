# RASFF (Rapid Alert System for Food and Feed) — Technical Specification

## Overview

This document explains how to build the RASFF-checking subsystem for the Culbridge Trade Compliance Platform. RASFF is the EU's real-time early-warning network for food safety incidents, and Nigerian exporters must be aware of active alerts for their commodity/destination combinations.

---

## What RASFF Is (From a Dev Perspective)

### RASFF in 1 Sentence

> **RASFF is a database of EU food safety alerts** — every alert is a structured record containing:
> - `PRODUCT` (e.g., "Sesame", "Cocoa")
> - `ORIGIN` (Nigeria)
> - `DESTINATION` (Netherlands, Germany)
> - `ANALYSIS` (aflatoxin, pesticide, Salmonella, etc.)
> - `RESULT` (failed, excessive, contaminated)
> - `DATE` (when issued)

### Why It Matters for Nigerian Exports

- Dutch (NVWA) and German (BVL, LAVES) authorities check shipments at Rotterdam/Hamburg
- Common triggers: aflatoxin in sesame/peanut/cocoa, pesticide > MRL, microbiological contamination
- Alerts block shipments at port → re-inspection, destruction, or return of cargo

---

## Data Source

### EU RASFF Bulk Data

- EU publishes RASFF data as CSV/JSON (authenticated via RASFF portal API)
- Download and ingest periodically (daily/weekly cron job)

**Ingest Server Requirements:**
1. Download latest RASFF file (authenticated)
2. Parse CSV and insert into database
3. Index on: product, origin, destination, analysis, date

---

## Data Models

### 1. RASFFRecord (Reference Table)

Stores historical and current RASFF alerts.

```javascript
{
  id: Number,
  referenceNumber: String,        // e.g., "RASFF/2024/0012"
  product: String,                 // "sesame", "cocoa", "ginger"
  productCategory: String,        // "nuts", "spices", "cocoa"
  origin: String,                 // "Nigeria"
  destination: String,            // "NL", "DE"
  analysis: String,               // "aflatoxin", "pesticide", "Salmonella"
  result: String,                 // "failed", "excessive", "contaminated"
  riskLevel: "high" | "medium" | "low",
  distribution: String,           // "distribution", "border rejection", "recall"
  issuedAt: Date,
  createdAt: DateTime,
}
```

**Indices needed:**
- `(origin, destination, product)` — for shipment risk lookup
- `(issuedAt)` — for time-window queries
- `(product, analysis)` — for commodity-specific alerts

### 2. Shipment RASFF Analysis (Computed)

Aggregates RASFF risk for a shipment.

```javascript
{
  id: Number,
  shipmentId: Number,
  alertsLast365Days: Number,       // Count of alerts for this commodity/destination
  alertsLast90Days: Number,       // Count in last quarter
  riskLevel: "low" | "medium" | "high",
  lastAlertDate: Date | null,
  lastAlertProduct: String | null,
  alertDetails: [
    { referenceNumber, analysis, result, riskLevel, issuedAt },
    ...
  ],
  computedAt: DateTime,
}
```

---

## Business Logic (Rule Engine)

### Step 1: Query RASFF Alerts

```javascript
function getRASFFAlerts(product, destination, daysBack = 365) {
  return db.query(`
    SELECT * FROM rasff_records
    WHERE origin = 'Nigeria'
      AND destination = ?
      AND product = ?
      AND issuedAt >= DATE_SUB(NOW(), INTERVAL ? DAY)
    ORDER BY issuedAt DESC
  `, [destination, product, daysBack]);
}
```

### Step 2: Calculate Risk Level

```javascript
function calculateRASFFRisk(product, destination) {
  const alerts365 = getRASFFAlerts(product, destination, 365);
  const alerts90 = getRASFFAlerts(product, destination, 90);
  
  const count365 = alerts365.length;
  const count90 = alerts90.length;
  
  // Risk classification rules
  let riskLevel = "low";
  
  if (count365 > 10 || count90 > 5) {
    riskLevel = "high";
  } else if (count365 > 3 || count90 > 1) {
    riskLevel = "medium";
  }
  
  return {
    alertsLast365Days: count365,
    alertsLast90Days: count90,
    riskLevel,
    lastAlertDate: alerts365[0]?.issuedAt || null,
    lastAlertProduct: alerts365[0]?.product || null,
    alertDetails: alerts365.slice(0, 10), // Last 10 alerts
  };
}
```

### Step 3: Determine Shipment Action

```javascript
function determineRASFFAction(rasffRisk) {
  if (rasffRisk.riskLevel === "high") {
    return {
      status: "Blocked",
      reason: `High RASFF risk: ${rasffRisk.alertsLast365Days} alerts in last year`,
      requiresReview: true,
    };
  } else if (rasffRisk.riskLevel === "medium") {
    return {
      status: "Warning",
      reason: `Medium RASFF risk: ${rasffRisk.alertsLast365Days} alerts in last year`,
      requiresReview: true,
    };
  } else {
    return {
      status: "OK",
      reason: "Low RASFF risk: No recent alerts for this commodity/destination",
      requiresReview: false,
    };
  }
}
```

### Step 4: Integrate with Compliance Engine

```javascript
function calculateComplianceStatus(shipment) {
  // RASFF check
  const rasffRisk = calculateRASFFRisk(shipment.commodity, shipment.destination);
  const rasffAction = determineRASFFAction(rasffRisk);
  
  // Other checks (MRL, documentation, etc.)
  const mrlStatus = calculateMLRStatus(shipment);
  const docStatus = calculateDocumentationStatus(shipment);
  
  // Final status
  let finalStatus = "Ready";
  const blockers = [];
  const warnings = [];
  
  if (rasffAction.status === "Blocked") {
    finalStatus = "Blocked";
    blockers.push({
      code: "RASFF_HIGH_RISK",
      message: rasffAction.reason,
      details: rasffRisk.alertDetails,
    });
  } else if (rasffAction.status === "Warning") {
    finalStatus = "Warning";
    warnings.push({
      code: "RASFF_MEDIUM_RISK",
      message: rasffAction.reason,
    });
  }
  
  if (mrlStatus === "Blocked") {
    finalStatus = "Blocked";
    blockers.push({ code: "MRL_BLOCKED", message: "MRL violations detected" });
  }
  
  if (docStatus === "Blocked") {
    finalStatus = "Blocked";
    blockers.push({ code: "DOCS_MISSING", message: "Required documents missing" });
  }
  
  return {
    status: finalStatus,
    rasffRisk,
    blockers,
    warnings,
  };
}
```

---

## API Endpoints

### GET /rasff/alerts

Returns RASFF alerts with filtering.

```javascript
// GET /api/v1/rasff/alerts?product=cocoa&destination=NL&daysBack=90
{
  alerts: [
    {
      referenceNumber: "RASFF/2024/0123",
      product: "cocoa",
      origin: "Nigeria",
      destination: "NL",
      analysis: "aflatoxin",
      result: "excessive",
      riskLevel: "high",
      issuedAt: "2024-06-15",
    },
    ...
  ],
  summary: {
    totalAlerts: 15,
    highRisk: 3,
    mediumRisk: 5,
    lowRisk: 7,
  }
}
```

### POST /rasff/ingest

Admin endpoint to ingest RASFF data from EU source.

```javascript
// POST /api/v1/rasff/ingest
// Body: CSV or JSON from EU RASFF portal
{
  inserted: 234,
  updated: 45,
  errors: [],
  lastUpdated: "2024-07-01T12:00:00Z"
}
```

### GET /shipments/:id/rasff-check

Returns RASFF risk analysis for a shipment.

```javascript
// GET /api/v1/shipments/123/rasff-check
{
  shipmentId: 123,
  commodity: "sesame",
  destination: "NL",
  alertsLast365Days: 12,
  alertsLast90Days: 4,
  riskLevel: "high",
  lastAlertDate: "2024-05-20",
  lastAlertProduct: "sesame",
  alertDetails: [
    { referenceNumber: "RASFF/2024/0089", analysis: "aflatoxin", riskLevel: "high" },
    ...
  ]
}
```

---

## Database Schema (PostgreSQL)

```sql
-- RASFF Records Reference Table
CREATE TABLE rasff_records (
  id SERIAL PRIMARY KEY,
  reference_number VARCHAR(50) UNIQUE NOT NULL,
  product VARCHAR(100) NOT NULL,
  product_category VARCHAR(50),
  origin VARCHAR(100) NOT NULL,
  destination VARCHAR(2) NOT NULL,
  analysis VARCHAR(100) NOT NULL,
  result VARCHAR(50) NOT NULL,
  risk_level VARCHAR(10) NOT NULL,
  distribution VARCHAR(50),
  issued_at DATE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT chk_risk_level CHECK (risk_level IN ('high', 'medium', 'low'))
);

CREATE INDEX idx_rasff_origin_dest_product ON rasff_records(origin, destination, product);
CREATE INDEX idx_rasff_issued_at ON rasff_records(issued_at);
CREATE INDEX idx_rasff_product_analysis ON rasff_records(product, analysis);

-- Shipment RASFF Analysis (computed)
CREATE TABLE shipment_rasff_analysis (
  id SERIAL PRIMARY KEY,
  shipment_id INTEGER NOT NULL REFERENCES shipments(id),
  alerts_last_365_days INTEGER DEFAULT 0,
  alerts_last_90_days INTEGER DEFAULT 0,
  risk_level VARCHAR(10) NOT NULL,
  last_alert_date DATE,
  last_alert_product VARCHAR(100),
  alert_details JSONB,
  computed_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT uq_shipment_rasff UNIQUE (shipment_id),
  CONSTRAINT chk_shipment_risk CHECK (risk_level IN ('high', 'medium', 'low'))
);

CREATE INDEX idx_shipment_rasff_risk ON shipment_rasff_analysis(risk_level);
```

---

## RASFF Ingest Service

### Python Example (CLI Script)

```python
#!/usr/bin/env python3
"""
RASFF Data Ingest Service
Downloads and parses EU RASFF bulk data into database.
"""

import csv
import requests
from datetime import datetime
from db import Database

# EU RASFF Portal (authenticated)
RASFF_API_URL = "https://rasff-out.izadmin.eu/api/v1/notifications"

class RASFFIngestService:
    def __init__(self, db: Database):
        self.db = db
    
    def fetch_rasff_data(self):
        # Download latest RASFF export
        response = requests.get(RASFF_API_URL, auth=(API_KEY, API_SECRET))
        response.raise_for_status()
        return response.json()
    
    def parse_and_insert(self, data):
        inserted = 0
        updated = 0
        errors = []
        
        for record in data.get('notifications', []):
            try:
                # Map RASFF fields to our schema
                parsed = {
                    'reference_number': record.get('reference_number'),
                    'product': self.normalize_product(record.get('product')),
                    'product_category': record.get('product_category'),
                    'origin': record.get('country_of_origin'),
                    'destination': record.get('country_of_origin'),
                    'analysis': record.get('type_of_hazard'),
                    'result': record.get('hazard_result'),
                    'risk_level': record.get('risk_decision', 'low'),
                    'distribution': record.get('distribution_status'),
                    'issued_at': record.get('date_of_case'),
                }
                
                # Upsert
                result = self.db.query("""
                    INSERT INTO rasff_records (reference_number, product, product_category, 
                                              origin, destination, analysis, result, risk_level, 
                                              distribution, issued_at)
                    VALUES (%(reference_number)s, %(product)s, %(product_category)s,
                            %(origin)s, %(destination)s, %(analysis)s, %(result)s,
                            %(risk_level)s, %(distribution)s, %(issued_at)s)
                    ON CONFLICT (reference_number) DO UPDATE SET
                        risk_level = EXCLUDED.risk_level,
                        distribution = EXCLUDED.distribution
                    RETURNING id, xmax = 0 AS inserted
                """, parsed)
                
                if result[0]['inserted']:
                    inserted += 1
                else:
                    updated += 1
                    
            except Exception as e:
                errors.append(f"{record.get('reference_number')}: {str(e)}")
        
        return {'inserted': inserted, 'updated': updated, 'errors': errors}
    
    def normalize_product(self, product_name):
        # Map RASFF product names to our commodity codes
        mapping = {
            'sesame seeds': 'sesame',
            'groundnuts (peanuts)': 'groundnuts',
            'cocoa beans': 'cocoa',
            'ginger': 'ginger',
        }
        return mapping.get(product_name.lower(), product_name.lower())


if __name__ == "__main__":
    service = RASFFIngestService(Database())
    data = service.fetch_rasff_data()
    result = service.parse_and_insert(data)
    print(f"Inserted: {result['inserted']}, Updated: {result['updated']}, Errors: {len(result['errors'])}")
```

---

## What Senior Devs Need to Build

### Phase 1: Core Infrastructure
1. **rasff_records table** + ingest script (from EU RASFF portal)
2. **shipment_rasff_analysis table** for computed results
3. **Cron job** to ingest RASFF data daily/weekly

### Phase 2: Rule Engine
4. `getRASFFAlerts()` — Query alerts by commodity/destination/time
5. `calculateRASFFRisk()` — Classify risk (Low/Medium/High)
6. `determineRASFFAction()` — Map risk to shipment action

### Phase 3: Integration
7. Hook into existing compliance engine
8. Add RASFF risk to API response
9. Display in UI (ShipmentTable + DetailView)

### Phase 4: Polish
10. Add "Active RASFF Alerts" section in shipment details
11. Show trend: "3 more alerts than last quarter"
12. Color-coding: Red (High), Yellow (Medium), Green (Low)

---

## Sample Risk Rules

| Commodity | Destination | Alerts (365 days) | Risk Level | Action |
|-----------|-------------|-------------------|------------|--------|
| Sesame | NL | 0 | Low | OK |
| Sesame | NL | 2 | Medium | Warning |
| Sesame | NL | 8 | High | Block |
| Cocoa | DE | 1 | Low | OK |
| Groundnuts | NL | 12 | High | Block |
| Ginger | DE | 0 | Low | OK |

---

## FAQ

**Q: How often should we ingest RASFF data?**
A: Daily is recommended. Set up a cron job that runs at 2 AM UTC.

**Q: What if RASFF has no alerts for our commodity?**
A: Default to Low risk (0 alerts = Low).

**Q: Can we override RASFF blocking?**
A: No. This is a regulatory requirement. The shipment must be reviewed by compliance team.

**Q: What about "border rejection" vs "distribution" alerts?**
A: Border rejections are more severe. Weight them 2x in risk calculation.

**Q: How do we handle product name mismatches?**
A: Create a mapping table: RASFF product name → Culbridge commodity code.

---

## Integration with Existing Engine

The RASFF engine should run alongside the MRL engine in your existing compliance flow:

```
Shipment Submission
       ↓
┌──────────────────┐
│  Fetch Requirements │
│  (GET /requirements) │
└────────┬─────────┘
         ↓
┌──────────────────┐
│  Upload Documents │
│  & Lab Results    │
└────────┬─────────┘
         ↓
┌──────────────────┐
│  Compliance Engine │ ←── Central orchestrator
└────────┬─────────┘
         ↓
   ┌─────┼─────┬──────────┐
   ↓     ↓     ↓          ↓
┌─────┐ ┌─────┐ ┌──────┐ ┌──────┐
│RASFF│ │ MRL │ │ Docs │ │ Other│
│Check│ │Check│ │Check │ │Check │
└─────┘ └─────┘ └──────┘ └──────┘
   ↓     ↓     ↓          ↓
   └─────┼─────┴──────────┘
         ↓
┌──────────────────┐
│  Calculate Final  │
│  Compliance Status│
└────────┬─────────┘
         ↓
┌──────────────────┐
│  Return Result   │
│  Ready/Warning/  │
│  Blocked         │
└──────────────────┘
```
