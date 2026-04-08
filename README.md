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

## External Integrations

- **RASFF**: Real-time alert monitoring
- **TRACES**: EU trade control system
- **Hyperledger Fabric**: Immutable audit logs
- **Odoo WMS**: Warehouse management
- **OpenLMIS**: Logistics management

## License

MIT
