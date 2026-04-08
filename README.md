# Culbridge Trade Compliance Platform

Deterministic export compliance validation engine for Nigerian agricultural exporters (sesame, cocoa, cashew, ginger) shipping to EU regulators (NVWA/BVL).

## What This Does

Culbridge evaluates shipment data against MRL (Maximum Residue Limits), phytosanitary, and RASFF (Rapid Alert System for Food and Feed) rules. Returns a structured PASS/FAIL decision with traceable compliance flags.

## Supported Commodities & Markets

| Commodity | Origin | Destination | Regulation |
|-----------|--------|--------------|------------|
| Sesame | Nigeria | Netherlands | NL rules |
| Sesame | Nigeria | Germany | DE rules |
| Cocoa | Nigeria | Netherlands | NL cocoa rules |
| Cocoa | Nigeria | Germany | DE cocoa rules |
| Cashew | Nigeria | EU | EU cashew rules |
| Ginger | Nigeria | EU | EU ginger rules |

## Tech Stack

- **Runtime**: Node.js 18+
- **Web Framework**: Express.js / Fastify
- **Database**: SQLite (default), PostgreSQL (production)
- **LLM Integration**: Ollama (Qwen2.5-7B, DeepSeek, LLaMA3.1)
- **Rule Engine**: JSON Rules Engine + Deterministic Engine
- **Audit**: Immutable blockchain-timestamped logs

## Quick Start

```bash
# Clone the repository
git clone https://github.com/CulbridgeTrade/culbridge.git
cd culbridge

# Install dependencies
npm install

# Setup environment
cp config/production.env.example .env

# Start the server
npm start
```

Server runs at: http://localhost:3000

## API Endpoints

### Health Check
```
GET /health
```

### Shipments

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /labs | List accredited labs |
| GET | /shipments/:id/evaluations | Get shipment evaluation history |
| POST | /api/v1/validate | Pre-shipment compliance check |
| POST | /api/v1/emergency-check | Post-shipment crisis triage |

### LLM Services

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /llm/extract | Document parsing (Qwen2.5-7B) |
| POST | /llm/conflict | Conflict validation (DeepSeek) |
| POST | /llm/explain | Explanation generation (LLaMA3.1) |

### Test Pipeline

```bash
# 1. Test document extraction
curl -X POST http://localhost:3000/llm/extract \
  -H "Content-Type: application/json" \
  -d '{"document_type":"COO","raw_content":"text"}'

# 2. Evaluate shipment
curl -X POST http://localhost:3000/shipments/CB-002/evaluate

# 3. Get explanation
curl -X POST http://localhost:3000/llm/explain \
  -H "Content-Type: application/json" \
  -d '{"shipment_id":"CB-002","evaluation_snapshot":{}}'
```

## Project Structure

```
culbridge/
├── backend/           # Backend services
├── config/             # Environment configs
├── db/                 # Database schemas (SQL)
│   ├── sesame-lab-schema.sql
│   ├── cocoa-lab-schema.sql
│   ├── cashew-lab-schema.sql
│   └── ginger-lab-schema.sql
├── docs/               # Documentation
├── engine/             # Rule engines
│   ├── deterministic-engine.js
│   ├── compliance-engine.js
│   └── rules-*.json    # Country/commodity rules
├── extractor/          # Document extraction mappings
├── frontend/           # React admin dashboard
│   ├── CulbridgeSubmissionForm.jsx
│   ├── CulbridgeAdminDashboard.jsx
│   └── CulbridgeExporterDashboard.jsx
├── routes/             # API route handlers
├── services/           # External integrations
│   ├── rasff-ingestion.js
│   ├── rasff-scraper.js
│   └── pdf-generator.js
├── src/                # Core source code
├── tests/              # Test suites
├── utils/              # Utility modules
├── server.js           # Main entry point
└── package.json
```

## Database Schema

### Core Tables

- **Shipments**: Export shipment records
- **ShipmentEvaluations**: Compliance evaluation results
- **RuleLogs**: Immutable audit trail
- **Labs**: Accredited laboratory registry with reliability scores
- **SesameLabReports**, **CocoaLabReports**, etc.: Commodity-specific lab data

### Lab Trust Scoring

Labs are scored 0-100 based on:
- Accreditation (ISO17025, ILAC)
- Historical accuracy
- Traceability chain completeness
- Metadata validation

## Rule Engine

### Deterministic Rules

The engine evaluates shipments against:

1. **Aflatoxin Limits** (EU MRL)
   - Aflatoxin B1: ≤ 4.0 μg/kg
   - Total Aflatoxins: ≤ 10.0 μg/kg

2. **Microbiological**
   - Salmonella: Must not be present

3. **Moisture Content**
   - Sesame: ≤ 7%

4. **Botanical Verification**
   - Species: Sesamum indicum

5. **Document Completeness**
   - Certificate of Origin
   - Phytosanitary Certificate
   - Lab Reports

### Enforcement Levels

| Level | Description |
|-------|-------------|
| HARD_BLOCKER | Rejects shipment automatically |
| CRITICAL_PENALTY | Significant score penalty |
| MODERATE_PENALTY | Minor score penalty |
| PASS | All checks cleared |

## Environment Variables

```bash
# Application
NODE_ENV=development
PORT=3000

# Database
DATABASE_URL=./culbridge.db
DB_POOL_SIZE=10

# Authentication
JWT_SECRET=your-secret-key
JWT_EXPIRY=24h

# API Keys
SENTRY_DSN=
RASFF_API_KEY=
TRACES_API_KEY=

# External Services
HYPERLEDGER_URL=http://localhost:7051
ODOO_URL=http://localhost:8069

# Rate Limiting
RATE_LIMIT_WINDOW=15m
RATE_LIMIT_MAX_REQUESTS=100
```

## Running Tests

```bash
npm test
```

## Docker

```bash
# Build
docker build -t culbridge .

# Run
docker run -p 3000:3000 culbridge
```

Or use Docker Compose:

```bash
docker-compose up
```

## Example Output

### Successful Validation

```json
{
  "shipment_id": "CLB-001",
  "status": "PASS",
  "compliance_score": 100,
  "flags": [],
  "enforcement_level": "PASS",
  "evaluated_at": "2024-03-28T10:30:00Z"
}
```

### Failed Validation

```json
{
  "shipment_id": "CLB-002",
  "status": "FAIL",
  "compliance_score": 45,
  "flags": [
    {
      "rule": "aflatoxin_b1",
      "expected": "<= 4.0",
      "actual": "8.2",
      "severity": "HARD_BLOCKER"
    }
  ],
  "enforcement_level": "HARD_BLOCKER",
  "evaluated_at": "2024-03-28T10:30:00Z"
}
```

Culbridge MVP — Engineering & Deployment Checklist
1. Core Principle
Build one deterministic validation engine with two entry points:
/validate → pre-shipment
/emergency-check → crisis entry
Nothing else. No workflows, no post-shipment, no document generation, no tracking.
2. Ground Truth (Non-Negotiable)
Single source of truth: One pipeline, one ruleset, one decision model
Deterministic output: OK / WARNING / BLOCK + reason + actions + confidence
Emergency entry = just another trigger into the same engine, not a new system
3. System Architecture
Copy code

INPUT → OCR/PARSE → NORMALIZE → VALIDATE → DECISION → OUTPUT
OCR/PARSE: extract text, return {text, confidence}
NORMALIZE: standardize commodity names, chemical names, units (mg/kg, ppm)
VALIDATE: rules: lab/MRL checks, document presence, exporter validity, risk flags
DECISION: map violations → OK/WARNING/BLOCK, generate precise actions
4. API Endpoints
Pre-shipment
Copy code

POST /api/v1/validate
{
  "commodity": "sesame",
  "destination": "EU",
  "documents": [...],
  "lab_results": {...}
}
Emergency Entry
Copy code

POST /api/v1/emergency-check
{
  "file": "image/pdf",
  "commodity": "optional",
  "destination": "optional"
}
Both call the same shared logic.
5. Frontend
Button: Shipment Issue? Check Now
Modal: upload file, optional commodity/destination
Reuse existing validation dashboard for result:
Copy code

❌ BLOCKED
Reason: Chlorpyrifos above EU limit
Action:
- Do NOT proceed with shipment
- Re-test at accredited lab
Confidence: HIGH
6. Testing (Mandatory)
20+ real/messy samples (blurry, partial, incomplete)
Validate:
OCR confidence behavior
Correct normalization
Decision correctness
Clarity of reason/action
7. Observability & Deployment
MVP Minimum:
Minimal logging for /validate & /emergency-check
Manual error monitoring
Docker ready
Manual deployment instructions
Deferred / Optional (Open Source Only)
Prometheus + Grafana metrics
ELK log aggregation
Full CI/CD, rollback strategy
Kubernetes manifests
8. Security & Dependencies
MVP Minimum:
SECURITY.md → “Report vulnerabilities via email”
Open-source dependency audit (npm audit, pip-audit)
Sanitize all inputs
Deferred: OWASP full compliance, advanced scanning
9. Code Quality
MVP Minimum:
ESLint + Prettier
Manual code review
Pre-commit hooks optional
Deferred: SonarQube, CodeClimate, automated checks
10. Definition of DONE
/validate functional end-to-end
/emergency-check triggers same pipeline
Output is consistent, actionable, and safe
Handles messy inputs
Deployed & tested with ≥1 real case
11. Anti-Patterns (Do Not Do)
Separate emergency logic
“Smart” recommendations / ML predictions
Over-structured input
Expanding scope beyond pre-shipment + emergency entry
12. Final Rule
If unsure about a feature:
“Does this improve accuracy or clarity of the decision?”
Yes → build | No → out of scope

## External Integrations

- **RASFF**: Real-time alert monitoring
- **TRACES**: EU trade control system
- **Hyperledger Fabric**: Immutable audit logs
- **Odoo WMS**: Warehouse management
- **OpenLMIS**: Logistics management

## License

MIT
