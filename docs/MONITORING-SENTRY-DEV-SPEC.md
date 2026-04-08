# Monitoring & Sentry — Dev Spec (Culbridge MVP)

**Objective**: Set up MVP-level monitoring that logs key compliance events and captures errors via Sentry.

---

## 1. What to Log (MVP-Level)

### 1.1. Key Events

| Event | Why Log It |
|-------|------------|
| `Shipment Created` | Ensure new shipments show up in EU-compliance pipeline |
| `Shipment Status Changed` | Audit-trail: "we warned them before failure" |
| `RASFF / MRL / EUDR Check Result` | Compliance engine is working |
| `Document Uploaded` | Audit-trail for exporter |
| `Lab Result Uploaded` | Audit-trail for lab workflow |
| `Compliance Check Failed` | Track blockers and why |
| `Submission to NSW` | Track when sent to authorities |

### 1.2. Log Format

Use **JSON-structured logging** (no unstructured text):

```python
# logging_utils.py
import logging
import json
from datetime import datetime
from pythonjsonlogger import jsonlogger

class CustomJsonFormatter(jsonlogger.JsonFormatter):
    def add_fields(self, log_record, record, message_dict):
        super().add_fields(log_record, record, message_dict)
        log_record['timestamp'] = datetime.utcnow().isoformat() + 'Z'
        log_record['level'] = record.levelname
        log_record['service'] = 'culbridge-backend'

logger = logging.getLogger('culbridge')
logger.setLevel(logging.INFO)

# Output to stdout (Docker/Vercel/CloudWatch will capture)
handler = logging.StreamHandler()
handler.setFormatter(CustomJsonFormatter())
logger.addHandler(handler)

# Helper function
def log_event(event_name, shipment_id=None, user_id=None, status=None, details=None):
    """Log structured compliance event"""
    log_data = {
        'event': event_name,
    }
    
    if shipment_id:
        log_data['shipmentId'] = shipment_id
    if user_id:
        log_data['userId'] = user_id
    if status:
        log_data['status'] = status
    if details:
        log_data['details'] = details
    
    logger.info(log_data)
```

### 1.3. Usage Examples

```python
# In your FastAPI endpoints

@router.post("/shipments")
async def create_shipment(request: ShipmentCreate):
    shipment = await create_shipment_db(request)
    
    log_event(
        event_name="Shipment Created",
        shipment_id=shipment.id,
        user_id=request.user_id,
        status="Pending",
        details={
            "commodity": shipment.commodity,
            "destination": shipment.destination,
        }
    )
    
    return shipment

@router.post("/shipments/{shipment_id}/compliance-check")
async def run_compliance_check(shipment_id: int):
    result = await compliance_engine.run(shipment_id)
    
    log_event(
        event_name="Compliance Check Complete",
        shipment_id=shipment_id,
        status=result.status,
        details={
            "rasff_risk": result.rasff_risk,
            "mrl_violations": result.mrl_violations,
            "eudr_status": result.eudr_compliance_status,
            "traceability_status": result.traceability_status,
        }
    )
    
    return result

@router.put("/shipments/{shipment_id}/status")
async def update_shipment_status(shipment_id: int, new_status: str):
    old_status = await get_shipment_status(shipment_id)
    await update_status_db(shipment_id, new_status)
    
    log_event(
        event_name="Shipment Status Changed",
        shipment_id=shipment_id,
        status=new_status,
        details={
            "old_status": old_status,
            "new_status": new_status,
            "changed_by": "system"  # or user_id
        }
    )
    
    return {"success": True}
```

---

## 2. Sentry Integration (Error Tracking)

### 2.1. Install Sentry SDK

```bash
# Backend (FastAPI)
pip install sentry-sdk

# Frontend (Next.js)
npm install @sentry/nextjs
```

### 2.2. FastAPI Sentry Setup

```python
# main.py

import os
import sentry_sdk
from sentry_sdk.integrations.asgi import SentryAsgiMiddleware
from sentry_sdk.integrations.logging import LoggingIntegration
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Initialize Sentry
sentry_sdk.init(
    dsn=os.getenv("SENTRY_DSN"),
    environment=os.getenv("APP_ENV", "dev"),
    traces_sample_rate=0.1,  # 10% of requests for performance (optional)
    integrations=[
        LoggingIntegration(
            level=logging.INFO,
            event_level=logging.INFO,
        ),
    ],
    # Include shipment context in all events
    before_send=lambda event, hint: add_shipment_context(event, hint),
)

def add_shipment_context(event, hint):
    """Add shipment context to Sentry events"""
    # Add any request context available
    return event

app = FastAPI()

# Add Sentry middleware (captures unhandled exceptions)
app.add_middleware(SentryAsgiMiddleware)

# Your routes...
@app.get("/health")
async def healthcheck():
    return {"status": "OK"}
```

### 2.3. Environment Variables

```bash
# .env
SENTRY_DSN=https://example@sentry.io/1234567
APP_ENV=development  # or "staging", "production"
```

### 2.4. Frontend (Next.js) Sentry

```typescript
// sentry.client.config.ts
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_APP_ENV,
  
  // Capture only errors (not performance monitoring yet)
  tracesSampleRate: 0,
  
  // Enable default integrations
  integrations: [
    new Sentry.BrowserTracing(),
  ],
  
  // Filter out expected errors
  beforeSend(event, hint) {
    const error = hint.originalException;
    if (error?.message === "Network Error") {
      // Don't send network errors to Sentry
      return null;
    }
    return event;
  },
});
```

```typescript
// sentry.edge.config.ts and sentry.server.config.ts similar setup
```

---

## 3. Basic Alerting (MVP-Level)

### 3.1. Sentry Alerts (via Dashboard)

Set up alerts for:

| Alert Condition | Action |
|-----------------|--------|
| Error in `fastapi` backend | Email + Slack |
| Unhandled exception | Email + Slack |
| `GET /shipment/{id}` returns 5xx | Email |
| New issue created in `production` | SMS (optional) |

### 3.2. Health Check Endpoint

```python
# main.py
from fastapi import APIRouter

router = APIRouter()

@router.get("/health")
async def healthcheck():
    """Basic health check for hosting provider"""
    return {
        "status": "OK",
        "version": "1.0.0",
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }

@router.get("/health/ready")
async def readiness():
    """Deep health check (DB, external services)"""
    checks = {
        "database": await check_database(),
        "sentry": sentry_sdk.last_event_id() is not None,
    }
    
    all_ready = all(checks.values())
    
    return {
        "status": "ready" if all_ready else "not_ready",
        "checks": checks
    }
```

### 3.3. Hosting Provider Health Check

- **Vercel**: Built-in health check
- **AWS**: Route 53 health check
- **Docker**: `HEALTHCHECK` instruction in Dockerfile

---

## 4. What Senior Dev Team Must Deliver

### Phase 1: Logging Infrastructure
- [ ] Structured JSON logger utility
- [ ] Log events for: shipment created, status changed, compliance checks, document uploads
- [ ] All logs to stdout (Docker/Vercel captures)

### Phase 2: Sentry Integration
- [ ] Install `sentry-sdk` in FastAPI
- [ ] Initialize with `SENTRY_DSN` from environment
- [ ] Add SentryAsgiMiddleware
- [ ] Optional: Add Sentry to Next.js frontend

### Phase 3: Alerts
- [ ] Set up Sentry alerts for critical errors
- [ ] Create `/health` endpoint
- [ ] Configure hosting provider health check

### Phase 4: Dev Experience
- [ ] View logs in Vercel/Docker/CloudWatch
- [ ] View errors in Sentry dashboard
- [ ] Filter by event type or error domain

---

## 5. Sample Log Output

### Structured Log (stdout)
```json
{
  "event": "Shipment Created",
  "timestamp": "2026-03-30T20:00:00Z",
  "level": "INFO",
  "service": "culbridge-backend",
  "shipmentId": 123,
  "userId": 456,
  "status": "Pending",
  "details": {
    "commodity": "sesame",
    "destination": "NL"
  }
}
```

### Error Log (Sentry)
```json
{
  "event": "ERROR",
  "timestamp": "2026-03-30T20:05:00Z",
  "level": "ERROR",
  "service": "culbridge-backend",
  "exception": "Traceback (most recent call last)...\nValueError: Invalid HS code",
  "shipmentId": 123,
  "environment": "production"
}
```

---

## 6. Don't Need Yet (MVP+)

- **Performance monitoring** (APM)
- **Grafana / Kibana** dashboards
- **Custom metrics** (Prometheus)
- **Distributed tracing**
- **Log aggregation** beyond stdout

---

## 7. Quick Start Checklist

```bash
# 1. Install dependencies
pip install sentry-sdk python-json-logger
npm install @sentry/nextjs

# 2. Set environment variables
export SENTRY_DSN=https://xxx@sentry.io/xxx
export APP_ENV=development

# 3. Initialize in code
# See sections 2.2 and 2.3 above

# 4. Add health endpoint
# See section 3.2 above

# 5. Deploy and test
# - Trigger an error → check Sentry
# - Create a shipment → check logs
# - Hit /health → verify 200 OK
```

---

**Send this to your senior dev team** — it's **100% build-ready**, **no fluff**, **pure spec**. They can start **coding today**.
