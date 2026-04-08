# Culbridge Core Compliance Infrastructure — Dev Blueprint

Goal: Build a deterministic, universal compliance engine for any commodity, corridor, lab result, or document. This is the backbone. Everything else (UI, dashboards, notifications) is secondary.

---

## 1. Core Principles (non-negotiable)

1.1 Backend is the source of truth
- Frontend only renders state + collects input
- All "validated," "ready," or "compliant" flags come from backend evaluation

1.2 Shipment = state machine
- States: DRAFT → PARTIAL → VALIDATING → READY → SUBMITTED → APPROVED/REJECTED
- Frontend never infers state

1.3 All modules are independent, idempotent, and return full state
```
POST /shipments/:id/evaluate      → Full shipment state
GET  /shipments/:id/compliance    → Full shipment state
GET  /shipments/:id/fees          → Full shipment state
GET  /shipments/:id/declaration   → Full shipment state
POST /corridor/submit             → Full shipment state
```
- Idempotency enforced via submissionToken

---

## 2. Canonical Shipment Object

```typescript
type Shipment = {
  id: string;
  status: 'DRAFT' | 'PARTIAL' | 'VALIDATING' | 'READY' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
  
  commodity: {
    description: string;
    hsCode: string;
    confidence: number;
  };
  
  labResults: {
    [key: string]: number | string | boolean; // e.g., ethylene_oxide, aflatoxin, salmonella
  };
  
  documents: {
    required: string[];
    uploaded: Document[];
    missing: string[];
  };
  
  traceability: {
    originChainComplete: boolean;
    additionalMetadata?: Record<string, any>;
  };
  
  compliance: {
    status: 'PASS' | 'WARNING' | 'BLOCKER';
    blockers: string[];
    warnings: string[];
  };
  
  risk: {
    rasffFlag: boolean;
    historicalIssues?: string[];
  };
  
  submission: {
    ready: boolean;
    errors: string[];
  };
};
```

> This object must handle any commodity, corridor, lab results, or documents. Every UI component or integration relies on this stable shape.

---

## 3. Rule Engine (pure functional core)

### 3.1 Rule Schema

```typescript
type Rule = {
  id: string;
  name: string;
  scope: {
    product?: string;        // optional → allows generic rules
    destination?: string;    // optional → allows corridor rules
  };
  condition: {
    field: string;           // e.g., labResults.ethylene_oxide
    operator: '>' | '<' | '==' | 'IN' | 'EXISTS';
    value: number | string | boolean;
  };
  effect: {
    type: 'BLOCKER' | 'WARNING';
    message: string;
  };
  source: {
    regulation: string;
    reference: string;
  };
};
```

### 3.2 Engine Behavior

**Input:** Shipment + array of Rule

**Output:** `{status, blockers[], warnings[], auditLog[]}`

**Execution:**
1. Evaluate each rule independently
2. BLOCKER > WARNING > PASS priority
3. Aggregate results into shipment.compliance
4. Log every rule evaluation for audit

---

## 4. Rule Ingestion Pipeline

Reality: Regulations are messy PDFs, semi-structured alerts, or legal text.

**Approach:**

1. **Extract** (semi-manual at first): substance, product, limit, condition
2. **Normalize**: units, field mappings, product/corridor mapping
3. **Map** to canonical rule schema
4. **Store** versioned JSON: `/rules/{corridor}/{commodity}.json`
5. **Deploy** to engine: `rulesEngine.load(rules)`

> No AI reading legal PDFs yet. Humans extract → encode → version → deploy.

---

## 5. Minimum data required to move DRAFT → READY

1. Commodity (description, HS code)
2. All required documents uploaded
3. Lab results for relevant substances
4. Traceability status
5. Risk profile (RASFF flags)
6. Engine evaluation shows no BLOCKERS

> Anything missing → cannot move to READY.

---

## 6. API Layer

```typescript
export const api = {
  getShipment: (id: string) => 
    apiCall(`/shipments/${id}`, { method: 'GET' }),
  
  evaluateShipment: (id: string, payload) =>
    apiCall(`/shipments/${id}/evaluate`, { 
      method: 'POST', 
      body: JSON.stringify(payload) 
    }),
  
  attachDocument: (shipmentId: string, documentId: string) =>
    apiCall(`/shipments/${shipmentId}/attach-document`, { 
      method: 'POST', 
      body: JSON.stringify({documentId}) 
    })
};
```

**All endpoints return full shipment state**
- Idempotency tokens enforced
- PATCH every step for offline recovery

---

## 7. Frontend Approach

- **React + React Query** for server-state only
- **No Redux**: unnecessary complexity
- Components render backend state only
- Input triggers evaluation; no local guessing
- Poll for status every 5–10s, WebSockets later

---

## 8. Build Sequence

| Phase | Deliverables |
|-------|--------------|
| **1. Core** | Auth, Shipment creation, Lab and document inputs, Core evaluation API |
| **2. Integration** | Compliance engine integration, Fees engine (if required), Submission readiness flag |
| **3. Submission** | Corridor submission, Dashboard for visibility, Audit logging |

> No fancy dashboards, notifications, or simulation before core deterministic engine works.

---

## 9. Real-world edge cases

| Scenario | Resolution |
|----------|------------|
| Missing lab results | BLOCKER or UNKNOWN |
| Multiple labs | Define resolution logic |
| Units mismatch | Normalize before evaluation |
| Rule conflicts | BLOCKER always overrides |

---

## 10. Success Criteria (for infrastructure, not UI)

1. Any commodity flows correctly through engine
2. Any corridor rules apply without code changes
3. Any lab/document input triggers deterministic compliance evaluation
4. Audit logs capture every decision
5. Frontend is a true state renderer; cannot override backend logic

---

## File Structure

```
engine/
  rule-engine.js        # Pure functional evaluation
  rules/
    sesame-nl.json       # Versioned rule sets
    cocoa-nl.json
    cashew-nl.json
  schemas/
    shipment.json       # Canonical object schema
    rule.json           # Rule schema
db/
  core-schema.sql       # Normalized tables
api/
  client.js             # Single API layer
```

---

## 11. Approved Labs Layer

### 11.1 Core Concept

**Definition:** An approved lab is a first-class entity in the system whose test results are trusted by authorities.

**Key implications:**
- Every lab result must point to a verified lab entity
- If lab is unverified/inactive → BLOCKER immediately
- Scales globally: lab entities can be added per corridor, per product

### 11.2 Lab Entity Schema

```typescript
type LabEntity = {
  id: string;
  name: string;
  country: string;           // e.g., NG, NL
  accreditation: string[];    // e.g., ["ISO/IEC 17025", "NAFDAC"]
  scopes: string[];          // tests: ["pesticide", "aflatoxin", "microbe"]
  verified: boolean;
  status: "ACTIVE" | "SUSPENDED" | "REVOKED";
  lastSynced: string;
};
```

### 11.3 Shipment Lab Integration

```typescript
type Shipment = {
  // ...
  labResults: {
    [substance: string]: {
      value: number;
      unit: string;           // normalized: mg/kg, μg/kg
      labId: string;          // reference to LabEntity.id
      testDate: string;
      reportHash: string;     // SHA256 hash for immutability
    };
  };
};
```

### 11.4 Lab Verification Logic

```javascript
function evaluateLabResult(result) {
  const lab = getLabEntity(result.labId);
  
  if (!lab || !lab.verified || lab.status !== "ACTIVE") {
    addFlag({ severity: "BLOCKER", code: "UNVERIFIED_LAB", ... });
    return;
  }
  checkSubstanceLimits(result);
}
```

### 11.5 Lab Ontology (Product → Required Tests)

| Commodity | Required Tests |
|-----------|----------------|
| Sesame | Aflatoxin, Pesticide, Microbe |
| Cocoa | Aflatoxin, Heavy Metal |
| Cashew | Aflatoxin, Heavy Metal |
| Fish | Mercury, Histamine |

### 11.6 Required Fields

```javascript
const requiredFields = ["labId", "value", "unit", "testDate", "reportHash"];
```

### 11.7 Files

| File | Purpose |
|------|---------|
| [`engine/schemas/lab.ts`](engine/schemas/lab.ts) | Lab entity + result schemas |
| [`engine/schemas/lab-ontology.ts`](engine/schemas/lab-ontology.ts) | Product→tests mapping + MRL thresholds |

---

## 12. Minimum Required Data Inputs

### 12.1 Core Concept

**Non-negotiable:** Missing mandatory data → BLOCKER → shipment cannot be evaluated.

### 12.2 Product Info (Mandatory)

```typescript
type ProductInfo = {
  name: string;        // e.g., "sesame seeds"
  hsCode: string;      // e.g., "120740"
  category: string;   // e.g., "plant", "food"
  batchId: string;    // e.g., "NG-SES-20260328"
};
```

### 12.3 Corridor (Mandatory)

```typescript
type Corridor = {
  originCountry: string;      // e.g., "NG"
  destinationCountry: string; // e.g., "NL", "DE"
};
```

### 12.4 Lab Results (Mandatory)

```typescript
type LabResult = {
  value: number;
  unit: string;
  labId: string;
  testDate: string;
  reportHash: string;  // SHA256 - non-negotiable for audit
  method?: string;
};
```

### 12.5 Documents (Required per corridor)

```typescript
type Document = {
  present: boolean;
  hash?: string;
};
```

### 12.6 Complete Shipment

```typescript
type Shipment = {
  id: string;
  product: ProductInfo;
  corridor: Corridor;
  labResults: Record<string, LabResult>;
  documents: Record<string, Document>;
  status: "DRAFT" | "VALIDATING" | "READY" | "REJECTED";
};
```

### 12.7 Corridor-Specific Example

**Netherlands (NL):**
- Sesame required lab tests: Ethylene Oxide, Aflatoxin, Salmonella
- Required documents: Phytosanitary, Certificate of Origin

**Germany (DE):**
- Sesame required lab tests: Ethylene Oxide, Aflatoxin, Salmonella
- Required documents: Phytosanitary (CoO optional)

### 12.8 Files

| File | Purpose |
|------|---------|
| [`engine/schemas/minimum-inputs.ts`](engine/schemas/minimum-inputs.ts) | Schema + pre-flight validation |

---

## 13. Document Validation

### 13.1 Core Principle

**Document validation is mandatory:** Any missing or invalid document is a BLOCKER.

Documents are product- and corridor-specific.

### 13.2 Document Entity Schema

```typescript
type Document = {
  present: boolean;
  type: string;
  issueDate?: string;
  expiryDate?: string;
  hash?: string;        // SHA256 for audit
};
```

### 13.3 Corridor-Specific Required Documents

| Destination | Product | Required Documents | Requirement |
|-------------|---------|---------------------|--------------|
| NL | Sesame | Phytosanitary, CoO | Both MANDATORY |
| NL | Cocoa | Phytosanitary, CoO, NAFDAC | All MANDATORY |
| NL | Cashew | Phytosanitary | MANDATORY, CoO OPTIONAL |
| NL | Fish | Phytosanitary, Export Health Cert | Both MANDATORY |
| DE | Sesame | Phytosanitary | MANDATORY, CoO OPTIONAL |
| DE | Cocoa | Phytosanitary, NAFDAC | Both MANDATORY |
| DE | Cashew | Phytosanitary | MANDATORY |
| BE | Sesame | Phytosanitary, CoO | Both MANDATORY |
| FR | Sesame | Phytosanitary, CoO | Both MANDATORY |

### 13.4 Rule Enforcement Logic

```typescript
function validateDocuments(shipment, product, destination) {
  const requiredDocs = getRequiredDocuments(product, destination);
  
  for (const docType of requiredDocs) {
    const doc = shipment.documents[docType];
    
    if (!doc?.present) {
      // MANDATORY → BLOCKER, OPTIONAL → WARNING
    }
    
    if (doc.expiryDate && isExpired(doc.expiryDate)) {
      // BLOCKER
    }
    
    if (!doc.hash) {
      // WARNING (audit incomplete)
    }
  }
}
```

### 13.5 Integration with Lab Results

**Full validation flow:**
```
Lab Results: verified → OK
Documents: Phytosanitary present → OK, CoO missing → BLOCKER

Result: shipment BLOCKED until all mandatory documents present
```

### 13.6 Files

| File | Purpose |
|------|---------|
| [`engine/schemas/document-validation.ts`](engine/schemas/document-validation.ts) | Document schema + validation |

---

## 14. Risk Profiling & Historical Data

### 14.1 Core Principle

**Risk profiling augments, not replaces lab results and document validation.**

Every shipment evaluation considers:
- Exporter history (past shipments, compliance flags)
- Country-of-origin risk (RASFF triggers, known contamination)
- Commodity-specific risk (susceptibility to hazards)

**Missing risk info → WARNING only, evaluation continues**

### 14.2 Risk Entity Schema

```typescript
type RiskProfile = {
  exporterId: string;
  previousShipments: Array<{
    shipmentId: string;
    date: string;
    outcome: "READY" | "BLOCKED" | "WARNING";
    blockedFields?: string[];
  }>;
  countryRiskFlags: Record<string, {
    hazard: string;
    severity: "LOW" | "MEDIUM" | "HIGH";
    lastReported: string;
  }>;
  riskScore: number;  // 0-100
};
```

### 14.3 Rule Engine Integration

**1. Exporter History Rules:**
```
if (last 3 shipments BLOCKED) → BLOCKER
if (last 2 shipments BLOCKED) → WARNING
```

**2. Country Risk Rules:**
```
if (countryRiskFlags[ hazard ].severity === "HIGH") → BLOCKER
if (countryRiskFlags[ hazard ].severity === "MEDIUM") → WARNING
```

**3. Commodity Risk Rules:**
```
if (riskScore > 70) → WARNING + stricter thresholds
```

### 14.4 MRL Threshold Adjustment

```typescript
function getAdjustedMRL(baseLimit, riskProfile) {
  if (!riskProfile || riskScore < 50) return baseLimit;
  // High risk = stricter limits
  return riskScore > 70 ? baseLimit * 0.6 : baseLimit * 0.8;
}
```

### 14.5 Files

| File | Purpose |
|------|---------|
| [`engine/schemas/risk-profiling.ts`](engine/schemas/risk-profiling.ts) | Risk schema + evaluation |

---

## 15. Unit Normalization & Ontology

### 15.1 Core Principle

**Lab heterogeneity is real:** Labs use different units, naming, and partial substance names.

**Canonicalization is mandatory:** Normalize units and map substance names to standard ontology.

**Failure to normalize → silent compliance errors (false passes or blocks).**

### 15.2 Substance Ontology

```typescript
type SubstanceEntity = {
  id: string;              // canonical: "ethylene_oxide"
  aliases: string[];        // ["EO", "EtO", "EthyleneOxide"]
  standardUnit: string;     // "mg/kg"
  hazardCategory: string;  // "pesticide", "mycotoxin", "microbe"
};
```

| ID | Aliases | Standard Unit | Category |
|----|---------|---------------|----------|
| ethylene_oxide | EO, EtO, EthyleneOxide | mg/kg | pesticide |
| aflatoxin_b1 | AFB1, Aflatoxin B1 | μg/kg | mycotoxin |
| salmonella | Salmonella spp. | cfu/25g | microbe |
| cadmium | Cd | mg/kg | heavy_metal |

### 15.3 Unit Normalization

```typescript
// Conversion table
const conversions = {
  "ppm->mg/kg": 1,
  "mg/kg->μg/kg": 1000,
  "ppb->mg/kg": 0.001
};

function normalizeUnit(value, fromUnit, toUnit) {
  return value * conversions[`${fromUnit}->${toUnit}`];
}
```

### 15.4 Product → Required Test Mapping

```typescript
const PRODUCT_TEST_MAPPING = [
  { product: 'sesame', requiredSubstances: ['ethylene_oxide', 'aflatoxin_b1', 'aflatoxin_total', 'salmonella'] },
  { product: 'cocoa', requiredSubstances: ['aflatoxin_b1', 'cadmium'] },
  { product: 'fish', requiredSubstances: ['mercury', 'histamine'] }
];
```

### 15.5 Normalization Flow

```
1. Receive raw lab result: { "substance": "EO", "value": 0.12, "unit": "ppm" }
2. Map to canonical: getSubstanceByAlias("EO") → "ethylene_oxide"
3. Normalize units: 0.12 ppm → 0.12 mg/kg
4. Store normalized: shipment.labResults["ethylene_oxide"] = { value: 0.12, unit: "mg/kg" }
5. Engine evaluates: compare against MRL thresholds in canonical units
```

### 15.6 Files

| File | Purpose |
|------|---------|
| [`engine/schemas/unit-normalization.ts`](engine/schemas/unit-normalization.ts) | Substance ontology + normalization |

---

## 16. Versioned Rules & Data

### 16.1 Core Principle

**Determinism requires immutability and versioning.**

Every rule, lab entity, and corridor mapping must be versioned.

Any change → audit-tracked; shipment evaluation must reference exact versions used.

Applies globally to all commodities, not just sesame, and all corridors, not just NL/DE.

### 16.2 Rule Versioning

Each rule has a unique ID and version:

```typescript
type ComplianceRule = {
  id: string;                // e.g., "EU_SESAME_EO_001"
  version: string;           // e.g., "v3"
  scope: {
    productCategory?: string; // optional, e.g., "plant"
    hazard?: string;          // e.g., "pesticide"
    corridor?: string;        // optional, e.g., "NL"
  };
  condition: object;         // JSON logic for evaluation
  effect: {
    type: "BLOCKER" | "WARNING";
    message: string;
  };
  createdAt: string;
  updatedAt: string;
};
```

**Examples:**

| id | version | scope | effect |
|----|---------|-------|--------|
| EU_GENERIC_PEST_001 | v2 | productCategory: plant, corridor: NL | BLOCKER |
| DE_CASHEW_AF_003 | v1 | productCategory: cashew, corridor: DE | BLOCKER |
| NL_GINGER_CD_001 | v1 | productCategory: spice, corridor: NL | BLOCKER |

**Usage:**

- Engine evaluates rules against the exact version referenced
- New versions → do not overwrite old rules; old shipments continue to reference previous version

### 16.3 Lab Entity Versioning

Lab registry must track versioned metadata:

```typescript
type LabEntity = {
  id: string;
  version: string;           // e.g., "v4"
  name: string;
  country: string;
  accreditation: string[];
  scopes: string[];
  verified: boolean;
  status: "ACTIVE" | "SUSPENDED" | "REVOKED";
  lastSynced: string;        // timestamp of last authoritative check
};
```

**Versioning Implications:**

- If lab accreditation or status changes → new version created
- Engine references lab version used at shipment evaluation for deterministic compliance
- Historical audit can reconstruct exactly which lab data was used

### 16.4 Corridor & Product Mapping Versioning

Map product category → required tests/documents → corridor with versioning:

```typescript
type ProductCorridorMapping = {
  id: string;
  version: string;
  productCategory: string;        // e.g., "plant", "seafood"
  corridor: string;               // e.g., "NL", "DE"
  requiredSubstances: string[];   // canonical SubstanceEntity.id
  requiredDocuments: string[];    // canonical Document.type
  createdAt: string;
  updatedAt: string;
};
```

**Usage:**

- Adding a new country or product → create a new mapping version
- Engine dynamically selects version based on shipment date or mapping snapshot
- Historical shipments always tie to exact mapping version used

### 16.5 Shipment-Level Version Tracking

Every shipment must record the versions of all critical data used for evaluation:

```typescript
type ShipmentEvaluationMetadata = {
  ruleVersions: Record<string, string>;    // { "EU_GENERIC_PEST_001": "v2", ... }
  labVersions: Record<string, string>;     // { "lab_123": "v4", ... }
  corridorMappingVersion: string;          // e.g., "v3"
  substanceOntologyVersion: string;        // version of SubstanceEntity registry
  evaluatedAt: string;                     // timestamp
};
```

**Engine stores this metadata with each shipment → full audit trail.**

### 16.6 Enforcement Flow

```
1. Load shipment → include lab results, documents, product, corridor.
2. Fetch latest applicable rule versions for shipment.product.category & corridor.
3. Validate lab entity versions → must reference active, verified version.
4. Evaluate rules → reference exact rule versions.
5. Attach evaluation metadata to shipment → includes rule versions, lab versions, mapping versions.
6. Auditability → regulator or internal review can reconstruct exactly which rules and lab data produced the outcome.
```

### 16.7 Scalable Architecture

- Rules, labs, mappings are all versioned tables → append-only for audit
- Engine selects versions dynamically based on shipment date, corridor, and product category
- Adding new commodities, countries, or lab updates → create new versions, no engine rewrite required
- Supports global expansion while preserving deterministic compliance

### 16.8 Audit & Compliance

- Historical shipments cannot silently inherit new rule/lab versions → deterministic defense
- Regulators (NL: NVWA, DE: BVL, EU EFSA) can reconstruct exact compliance evaluation
- Any change (rules, lab status, mapping) → creates new version with timestamp, ensuring full traceability

### 16.9 Dev Directive – Versioned Rules & Data

1. Every rule must have a unique id + version
2. Lab entity registry must be versioned
3. Product/corridor mapping must be versioned
4. Engine references exact versions for each shipment
5. Store shipment evaluation metadata → all rule/lab/mapping versions
6. Add append-only audit logging → deterministic, reconstructable compliance
7. Ensure global scalability → all commodities, corridors, and labs follow same versioning logic

### 16.10 Files

| File | Purpose |
|------|---------|
| [`engine/schemas/versioned-rules.ts`](engine/schemas/versioned-rules.ts) | ComplianceRule schema + versioning |
| [`engine/schemas/versioned-lab.ts`](engine/schemas/versioned-lab.ts) | LabEntity versioned schema |
| [`engine/schemas/versioned-mapping.ts`](engine/schemas/versioned-mapping.ts) | ProductCorridorMapping versioned schema |
| [`engine/schemas/evaluation-metadata.ts`](engine/schemas/evaluation-metadata.ts) | ShipmentEvaluationMetadata schema |
| [`engine/schemas/unit-normalization.ts`](engine/schemas/unit-normalization.ts) | Substance ontology + normalization |

---

## 17. Engine Output & Audit Log

### 17.1 Core Principle

**Deterministic outputs:** the engine must produce the same result for the same shipment data and versions.

**Full auditability:** every BLOCKER or WARNING must be traceable to rule version, lab version, document, and shipment data.

**Legal & regulatory defensibility:** regulators (NL: NVWA, DE: BVL, EU: EFSA) or courts must be able to reconstruct exactly why a shipment was blocked.

**Key insight:** the output is not just a status, it is a forensic record.

### 17.2 Engine Output Schema

```typescript
type EngineOutput = {
  shipmentId: string;
  status: "REJECTED" | "READY" | "VALIDATING";
  
  blockers: Array<{
    ruleId: string;               // rule evaluated
    ruleVersion: string;          // exact version used
    field: string;                // field that triggered the rule
    value: any;                   // actual value observed
    labId?: string;               // optional lab entity ID
    labVersion?: string;          // optional lab version
    documentType?: string;        // optional document
    reportHash?: string;          // optional SHA256 hash of lab report
    message: string;              // descriptive message
    timestamp: string;            // ISO timestamp of evaluation
  }>;
  
  warnings: Array<{
    ruleId: string;
    ruleVersion: string;
    field: string;
    value: any;
    labId?: string;
    labVersion?: string;
    documentType?: string;
    reportHash?: string;
    message: string;
    timestamp: string;
  }>;
  
  auditLog: Array<{
    step: string;                 // e.g., "Lab Validation", "Document Validation"
    ruleId?: string;              // applicable if step triggered a rule
    ruleVersion?: string;
    inputData: any;               // raw data evaluated (lab result, document, shipment field)
    output: "PASS" | "BLOCKER" | "WARNING";
    timestamp: string;
  }>;
};
```

**Implications for Dev Team:**

1. Every BLOCKER/WARNING must be explicitly tied to a rule, version, and input field
2. Lab results and document hashes are directly recorded in the log → immutable audit trail
3. Timestamp all evaluations → reconstruct exact sequence

### 17.3 Example JSON Output (Sesame → NL)

```json
{
  "shipmentId": "shipment_001",
  "status": "REJECTED",
  "blockers": [
    {
      "ruleId": "EU_SESAME_EO_001",
      "ruleVersion": "v3",
      "field": "labResults.ethylene_oxide.value",
      "value": 0.12,
      "labId": "lab_123",
      "labVersion": "v4",
      "reportHash": "sha256:abcd1234",
      "message": "Ethylene Oxide exceeds EU MRL limit",
      "timestamp": "2026-03-28T10:34:12Z"
    },
    {
      "ruleId": "MISSING_DOCUMENT_001",
      "ruleVersion": "v2",
      "field": "documents.certificate_of_origin.present",
      "value": false,
      "documentType": "certificate_of_origin",
      "message": "Certificate of Origin missing for NL corridor",
      "timestamp": "2026-03-28T10:34:12Z"
    }
  ],
  "warnings": [],
  "auditLog": [
    {
      "step": "Lab Validation",
      "ruleId": "EU_SESAME_EO_001",
      "ruleVersion": "v3",
      "inputData": { "value": 0.12, "unit": "mg/kg", "labId": "lab_123" },
      "output": "BLOCKER",
      "timestamp": "2026-03-28T10:34:12Z"
    },
    {
      "step": "Document Validation",
      "ruleId": "MISSING_DOCUMENT_001",
      "ruleVersion": "v2",
      "inputData": { "certificate_of_origin": { "present": false } },
      "output": "BLOCKER",
      "timestamp": "2026-03-28T10:34:12Z"
    }
  ]
}
```

**Observations:**

- BLOCKERS clearly show what failed and why
- Lab hashes tie results to verified labs
- Rule versions ensure deterministic compliance — even if rules change tomorrow, this shipment's evaluation remains verifiable
- Audit log reconstructs step-by-step evaluation, not just summary

### 17.4 Dev Implementation Notes

**1. Engine Layer:**

- Evaluate rules sequentially or in parallel, but log every evaluation step
- For each lab result → store labId + labVersion + reportHash
- For each document → store documentType + hash + issue/expiry dates
- Append audit entries for PASS, BLOCKER, WARNING

**2. Audit Layer:**

- Immutable storage (append-only) for blockers, warnings, audit log
- Include timestamps, rule versions, lab versions, document hashes
- Optional: store in encrypted database to prevent tampering

**3. Frontend / Reporting:**

- Show shipment status (READY / REJECTED)
- Provide full list of BLOCKERS with messages
- Include audit trail download → regulator-friendly PDF or JSON

**4. Scalability:**

- Works for all products, all corridors, any number of lab results/documents
- No hard-coded commodities or countries
- Dynamic mapping tables drive required fields
- Adding new commodities/countries → new rules + versioned mapping → auditable automatically

### 17.5 Key Takeaways

**BLOCKER ≠ guess; every BLOCKER is tied to:**
- Rule ID + version
- Lab ID + version + report hash
- Document type + hash
- Input field + value

**Deterministic compliance:** engine output reproducible at any future point.

**Regulatory defensibility:** auditLog explains exactly why shipment was rejected.

**Scalable & global:** supports all commodities and corridors without engine rewrite.

### 17.6 Files

| File | Purpose |
|------|---------|
| [`engine/schemas/engine-output.ts`](engine/schemas/engine-output.ts) | EngineOutput schema + audit log |

---

## 18. Optional Features & Integration Layer

### 18.1 Minimum Dataset Enforcement — Core Principle

**Every shipment must have all mandatory fields before engine evaluation:**

- Product info: name, hsCode, category, batchId
- Corridor info: originCountry, destinationCountry
- Lab results: all required tests per product + corridor
- Documents: all required per product + corridor

**Enforcement:** Missing any required field → BLOCKER.

**Engine cannot guess values; determinism requires complete input.**

```typescript
function enforceMinimumDataset(shipment: Shipment) {
  const requiredFields = [
    "product.name",
    "product.hsCode",
    "product.category",
    "product.batchId",
    "corridor.originCountry",
    "corridor.destinationCountry",
    "labResults",
    "documents"
  ];

  for (const field of requiredFields) {
    if (!getField(shipment, field)) {
      throw new Error(`BLOCKER: Required field missing -> ${field}`);
    }
  }
}
```

**Key takeaway:** Pre-validation ensures engine never processes incomplete shipments.

### 18.2 Optional but Recommended Features

#### A. Pre-Notification Hooks

- **API endpoint:** `/precheck-shipment`
- **Purpose:** Exporter can submit shipment data before sending to customs → get BLOCKERS/WARNINGS
- **Returns:** engine output + audit log
- **Ensures:** Early detection of issues, reduces rejected shipments at ports

```typescript
app.post("/precheck-shipment", (req, res) => {
  const shipment = req.body;
  enforceMinimumDataset(shipment);
  const engineOutput = runComplianceEngine(shipment);
  res.json(engineOutput);
});
```

#### B. Alerting System

- **Trigger:** Whenever engine flags a BLOCKER or critical WARNING
- **Mediums:** Email, SMS, in-app notification
- **Payload:** shipmentId, status, list of BLOCKERS/WARNINGS, audit log link

```typescript
function notifyExporter(engineOutput: EngineOutput) {
  if (engineOutput.blockers.length > 0) {
    sendNotification({
      recipient: shipment.exporterId,
      subject: `Shipment BLOCKED: ${engineOutput.shipmentId}`,
      body: JSON.stringify(engineOutput.blockers)
    });
  }
}
```

#### C. Admin Dashboard

- Show active shipments, lab status, document compliance, and risk profiles
- Filter by: product category, corridor, exporter, rule version
- Allows admins to:
  - Audit engine decisions
  - Track lab approvals
  - Review BLOCKERS/WARNINGS

**Core components:**

| Module | Purpose |
|--------|---------|
| Shipments Table | Status, BLOCKERS/WARNINGS, last audit timestamp |
| Lab Registry | Verified labs, accreditation, last synced |
| Rule Tracker | Rule ID, version, active status |
| Risk Profiles | Exporter risk score, previous shipment alerts |

#### D. Simulation Mode

- **Purpose:** Test new rules or updates against historical shipments without affecting live status
- **Functionality:**
  - Pull historical shipment data
  - Evaluate against new or updated rules
  - Produce audit log + BLOCKER/WARNING report
- **Ensures:** Deterministic evaluation before rules go live

```typescript
function simulateRules(historicalShipments, newRules) {
  return historicalShipments.map(shipment => runComplianceEngine(shipment, newRules));
}
```

### 18.3 Integration With Existing Layers

```
Lab Validation → Engine references verified lab IDs + hashes
        │
        ▼
Document Validation → Engine checks mandatory docs per product/corridor
        │
        ▼
Risk Profiling → Engine applies stricter thresholds if exporter/corridor flagged
        │
        ▼
Unit Normalization & Ontology → Engine uses canonical substance IDs and normalized units
        │
        ▼
Versioned Rules → Every output references rule version + lab version + document version
        │
        ▼
Audit log → Complete deterministic record
```

**Flow:**

1. Pre-flight dataset enforcement → BLOCKER if any required field missing
2. Lab validation + document validation → BLOCKERS/WARNINGS
3. Risk profiling applied → adjust rules dynamically
4. Engine evaluates rules → output deterministic JSON + audit log
5. Optional: Pre-notification API, alerting, dashboard, simulation

### 18.4 High-Level Architecture

```
[Exporter Submission]
        │
        ▼
[Pre-Flight Dataset Enforcement]
        │
        ├─ Verify Product Info (name, hsCode, category, batchId)
        ├─ Verify Corridor (originCountry, destinationCountry)
        ├─ Verify Lab Results (all required per product/corridor)
        └─ Verify Documents (mandatory per product/corridor)
        │
        ▼
[Lab & Document Registries] ←───────────┐
        │                               │
        │                               │
        ▼                               │
[Unit Normalization & Ontology Mapping] │
        │                               │
        ▼                               │
[Risk Profiling Layer]                   │
  ├─ Exporter historical BLOCKERS       │
  ├─ Country risk flags                  │
  └─ RASFF alerts                        │
        │                               │
        ▼                               │
[Rule Engine – Versioned]                 │
  ├─ Lab rules (thresholds, MRLs)       │
  ├─ Document rules (presence, expiry)  │
  ├─ Risk-adjusted rules                 │
  ├─ Product/corridor-aware             │
  └─ References rule version + lab version
        │                               │
        ▼                               │
[Engine Output + Audit Log]               │
  ├─ shipmentId                          │
  ├─ status: READY / REJECTED           │
  ├─ blockers[]                          │
  ├─ warnings[]                          │
  └─ auditLog[]                          │
        │                               │
        ▼                               │
[Optional Features]                       │
  ├─ Pre-notification API                │
  ├─ Alerting System                     │
  ├─ Admin Dashboard                     │
  └─ Simulation Mode                     │
```

### 18.5 Scalability & Determinism

- **Commodity-agnostic:** rules, documents, and lab checks are data-driven → can add new products without code change
- **Corridor-agnostic:** NL, DE, or any future country → system loads rules/document requirements dynamically
- **Versioned rules & data:** every shipment audit references exact version of:
  - Lab registry
  - Document registry
  - Compliance rules
- **Deterministic engine:** same inputs → same outputs; no guessing or defaults

### 18.6 Bottom Line for Dev Team

1. **Mandatory enforcement first:** missing fields → BLOCKER
2. **Optional features enhance usability, visibility, and early detection**
3. **Auditability & determinism are core:** every optional feature must not bypass engine logic
4. **Scalable architecture:** all features are commodity-agnostic and corridor-agnostic, ready for NL, DE, and any future countries
5. **Simulation + dashboard + alerts improve operational efficiency but cannot replace dataset completeness enforcement**

### 18.7 Files

| File | Purpose |
|------|---------|
| [`engine/schemas/minimum-inputs.ts`](engine/schemas/minimum-inputs.ts) | Pre-flight dataset enforcement |
| [`engine/schemas/simulation.ts`](engine/schemas/simulation.ts) | Simulation mode for rule testing |

---

## 19. Auditable Data Layer & Implementation Checklist

### 19.1 Data Layer – Auditable, Immutable Fields

**Goal:** Every piece of critical data (labs, documents, shipment info, rules) must be immutable and traceable.

**Schemas / Tables:**

```typescript
type AuditableField<T> = {
  value: T;
  hash: string;          // SHA256 hash of value
  createdAt: string;     // ISO timestamp
  modifiedAt?: string;
  sourceVersion: string; // rule, lab, or document version
};

type Shipment = {
  id: string;
  product: ProductInfo;
  corridor: Corridor;
  labResults: Record<string, AuditableField<LabResult>>;
  documents: Record<string, AuditableField<Document>>;
  riskProfile?: RiskProfile;
  status: "DRAFT" | "VALIDATING" | "READY" | "REJECTED";
  auditLog: AuditLogEntry[];
};
```

**Implementation Steps:**

1. Compute SHA256 hash for every input at ingestion
2. Store creation/modification timestamps and the source version
3. Any update → append a new AuditableField, don't overwrite

### 19.2 Deterministic Rule Engine

**Goal:** Ensure identical input → identical output. No guessing.

**Engine Steps:**

1. **Pre-flight Validation:** Check all mandatory fields. Missing → BLOCKER
2. **Unit Normalization:** Convert all lab units to standard (mg/kg, μg/kg)
3. **Ontology Mapping:** Map substances to canonical identifiers (EO → ethylene_oxide)
4. **Rule Evaluation:**
   - Pull all applicable rules based on product category + corridor
   - Apply thresholds dynamically (see risk layer)
5. **Audit Logging:** Store every evaluation step with rule ID, input, result, timestamp, and applied thresholds

```typescript
function evaluateShipment(shipment: Shipment) {
  preFlightValidate(shipment);   // BLOCKER if missing data
  normalizeUnits(shipment.labResults);
  mapOntology(shipment.labResults);
  
  const rules = getRules(shipment.product.category, shipment.corridor.destinationCountry);
  for (const rule of rules) {
    const result = evaluateRule(rule, shipment);
    shipment.auditLog.push({
      ruleId: rule.id,
      input: rule.inputSnapshot,
      result,
      timestamp: new Date().toISOString(),
      ruleVersion: rule.version
    });
    if (result === "BLOCKER") shipment.status = "REJECTED";
  }
}
```

### 19.3 Risk Layer / Historical Data

**Goal:** Adjust rules dynamically based on exporter/country history.

**Implementation:**

Maintain ExporterRiskProfile table:

```typescript
type ExporterRiskProfile = {
  exporterId: string;
  recentBlockers: number;
  recentWarnings: number;
  flaggedCountries: Record<string, "HIGH" | "MEDIUM" | "LOW">;
};
```

**Pre-load risk profile before rule evaluation.**

**Dynamically adjust thresholds:**

```typescript
if (exporter.recentBlockers >= 3) {
  increaseScrutiny();
  addWarning("High risk exporter, stricter thresholds applied");
}
```

**Audit log stores exact applied thresholds for each shipment.**

### 19.4 Shipment Traceability / Audit Log

**Goal:** Every BLOCKER/WARNING must be explainable to customs/regulators.

**Audit Log Entry:**

```typescript
type AuditLogEntry = {
  ruleId: string;
  input: any;
  result: "BLOCKER" | "WARNING" | "PASS";
  timestamp: string;
  appliedThresholds?: Record<string, number>;
  labReportHash?: string;
  documentHash?: string;
  ruleVersion: string;
};
```

**Requirements:**

- Append logs at every rule evaluation
- Must include lab report hash, document hash, thresholds applied, and rule version
- Logs immutable. Do not delete or overwrite.

### 19.5 Error Handling & BLOCKER Logic

- **BLOCKER:** Missing/invalid lab result, missing/expired document, unverified lab, unit mismatch, failed thresholds. **Stops shipment.**
- **WARNING:** Optional issues (hash missing, optional document missing, minor deviations). Engine continues but logs.
- **Engine must never escalate shipment to READY if any BLOCKER exists.**

### 19.6 Versioning & Change Management

Every rule, lab entity, document mapping, corridor definition versioned.

Maintain Changelog table:

```typescript
type ChangelogEntry = {
  entityType: "RULE" | "LAB" | "DOCUMENT" | "CORRIDOR";
  entityId: string;
  previousVersion: string;
  newVersion: string;
  updatedBy: string;
  timestamp: string;
  description: string;
};
```

**Shipments store applied version references → legal traceability.**

### 19.7 Scalability – Corridors / Commodities

- **Product ontology:** dynamic mapping → category → required lab tests + required documents
- **Corridor mapping:** dynamic → destination country → required docs + MRLs
- **Unit normalization rules:** global, extendable to any country/lab combination
- **No hard-coded logic.** Engine reads dynamic tables.

### 19.8 Dev Team Build Checklist

| # | Item | Status |
|---|------|--------|
| 1 | Tables/Schemas: Shipments, Lab Entities, Document Entities, Rules, Exporter Risk, Changelog, Audit Log | ✅ |
| 2 | Pre-flight Validation Layer: Ensure all required fields, lab verification, document presence | ✅ |
| 3 | Unit Normalization & Ontology Mapping Module | ✅ |
| 4 | Deterministic Rule Engine: Apply rules with versioned data, risk-aware thresholds | ✅ |
| 5 | Audit Log Writer: Capture immutable evaluation steps with hash references | ✅ |
| 6 | Version Control: Rules, labs, documents, corridors. Record applied versions per shipment | ✅ |
| 7 | Error/BLOCKER Handling: Engine stops evaluation and flags shipment if any mandatory data missing or rule fails | ✅ |
| 8 | Dynamic Mapping: Product → lab tests, Product/Corridor → required documents | ✅ |
| 9 | Optional Efficiency Layer: Precheck API, alerts, simulation mode, dashboards | ✅ |

### 19.9 Bottom Line

**If any of these layers are missing, Culbridge is legally useless.**

- Determinism, auditability, versioning, BLOCKER logic, and risk-awareness are non-negotiable
- Everything is data-driven: adding new products or corridors requires no engine rewrite
- Legal defensibility: regulators (NL: NVWA, DE: BVL, EU: EFSA) can reconstruct exact compliance evaluation

---

| File | Purpose |
|------|---------|
| [`engine/schemas/auditable-shipment.ts`](engine/schemas/auditable-shipment.ts) | Auditable shipment with hash integrity |

---

*End of Dev Blueprint*