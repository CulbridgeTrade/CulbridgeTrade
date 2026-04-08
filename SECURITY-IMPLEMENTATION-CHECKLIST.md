# Culbridge Security Implementation Checklist
## Production-Ready, Infrastructure-Grade, Adversarial-First

This document provides the senior dev team with a prescriptive, step-by-step implementation plan for securing the Culbridge Headless Results API. Every step specifies what to build, how to build it, why it matters, and how to validate it.

---

## Phase 1: Critical Security Implementation (Week 1-2)

### 1.1 Identity & Access Management (IAM)

| Task | Implementation | Why It Matters | Validation |
|------|----------------|----------------|------------|
| RBAC Roles | Define: Admin, Finance, Compliance, API, Worker | Limits lateral movement | Attempt privilege escalation → must fail |
| MFA Enforcement | TOTP (otplib) + Hardware Key (YubiKey/FIDO2) | Prevent credential compromise | Login with stolen password → blocked |
| Service Account mTLS | Node.js https with cert verification | Secure microservice communication | Intercept TLS → connection rejected |
| Secrets Management | HashiCorp Vault / AWS KMS with auto-rotation | Prevent key leakage | Rotate secrets → all services update |

#### Implementation Details:

```javascript
// RBAC Middleware (security/rbac.js)
const { Enforcer } = require('casbin');

const enforcer = await Enforcer.newEnforcer('./rbac-model.conf', './rbac-policy.csv');

function authorize(role, action, object) {
  return async (req, res, next) => {
    const hasPermission = await enforcer.enforce(req.user.role, action, object);
    if (!hasPermission) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}
```

#### Tools:
- Casbin: https://casbin.org
- Open Policy Agent (OPA): https://www.openpolicyagent.org
- Passport.js: https://www.passportjs.org
- otplib: https://github.com/yeojz/otplib

---

### 1.2 API & Endpoint Security

| Task | Implementation | Why It Matters | Validation |
|------|----------------|----------------|------------|
| HMAC + Bearer | All endpoints require HMAC signed payload | Prevent tampering & replay | Attempt replay with old signature → rejected |
| Nonce + Timestamp | Bind every API request with 5-min TTL | Stop replay attacks | Send request outside TTL → rejected |
| Rate Limiting | Per user/IP/service (100 req/min) | Prevent brute force & DOS | Simulate high request rate → throttled |
| Input Validation | Zod schema + cross-field checks | Stop malicious payload injection | Send invalid/malicious payload → rejected |
| API Gateway/WAF | Nginx + ModSecurity | First defense layer | Penetration test → blocked |

#### Implementation Details:

```javascript
// HMAC Signature Validation (security/hmac.js)
const crypto = require('crypto');
const HMAC_SECRET = process.env.HMAC_SECRET;
const SIGNATURE_TTL = 5 * 60 * 1000; // 5 minutes

function validateHMAC(req, res, next) {
  const { signature, timestamp, nonce } = req.headers;
  
  // Check timestamp TTL
  if (Date.now() - parseInt(timestamp) > SIGNATURE_TTL) {
    return res.status(401).json({ error: 'Signature expired' });
  }
  
  // Check nonce uniqueness (store in Redis)
  if (redis.exists(`nonce:${nonce}`)) {
    return res.status(401).json({ error: 'Nonce already used' });
  }
  
  // Verify HMAC
  const payload = JSON.stringify(req.body);
  const expected = crypto
    .createHmac('sha256', HMAC_SECRET)
    .update(`${timestamp}:${nonce}:${payload}`)
    .digest('hex');
    
  if (signature !== expected) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  // Store nonce
  await redis.setex(`nonce:${nonce}`, SIGNATURE_TTL, '1');
  next();
}
```

#### Tools:
- express-rate-limit: https://www.npmjs.com/package/express-rate-limit
- Zod: https://github.com/colinhacks/zod
- Nginx + ModSecurity: https://modsecurity.org

---

### 1.3 Database Security

| Task | Implementation | Why It Matters | Validation |
|------|----------------|----------------|------------|
| Encryption at Rest | AES-256 + env-separated keys | Protect sensitive data if storage compromised | Attempt raw DB read → unreadable |
| Field-Level Encryption | PII, financial amounts, HS codes | Protect high-risk data | Read encrypted field → unreadable |
| Parameterized Queries | No string concatenation | Prevent SQL injection | Inject malicious query → blocked |
| Immutable Audit Log | Chained, tamper-proof | Detect insider tampering | Alter log → detection triggered |
| DB Constraints | Unique keys, FK, invariants | Enforce system invariants | Insert invalid shipment → rejected |

#### Implementation Details:

```javascript
// Field-Level Encryption (security/encryption.js)
const crypto = require('crypto');
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY; // 32 bytes

function encryptField(plaintext) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decryptField(encrypted) {
  const [ivHex, encryptedData] = encrypted.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
```

```sql
-- Immutable Audit Log with Hash Chaining (schema)
CREATE TABLE ImmutableAuditLog (
  id INTEGER PRIMARY KEY,
  shipment_id TEXT NOT NULL,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  outcome TEXT NOT NULL,
  details JSON,
  previous_hash TEXT NOT NULL,
  current_hash TEXT NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT hash_chained CHECK (
    current_hash = SHA256(
      id || shipment_id || module || action || actor || outcome || previous_hash || timestamp
    )
  )
);
```

#### Tools:
- PostgreSQL/MySQL (open-source)
- Prisma/TypeORM (parameterized queries)
- Node.js crypto (built-in)

---

### 1.4 Signature & Cryptography

| Task | Implementation | Why It Matters | Validation |
|------|----------------|----------------|------------|
| Bind Signature | payload_hash + timestamp + nonce + system_version | Prevent replay & impersonation | Replay old signature → rejected |
| Post-Signature Immutability | Lock payload in DB/middleware | Prevent data tampering | Attempt mutation → blocked |
| Trust Store | Trusted CAs + revoked certs | Ensure legitimate signers | Use revoked cert → rejected |
| Signature Expiry | 5-min validity window | Reduce replay window | Expired signature → rejected |
| Key Rotation | Hardware-backed, periodic | Limit compromise impact | Rotate key → signatures still valid |

#### Implementation Details:

```javascript
// Signature Binding with Nonce + Timestamp (security/signature.js)
const crypto = require('crypto');

function createBoundSignature(payload, systemVersion = '2026.1') {
  const timestamp = Date.now();
  const nonce = crypto.randomBytes(16).toString('hex');
  
  // Create payload hash
  const payloadHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex');
  
  // Bind all components
  const signatureData = `${payloadHash}:${timestamp}:${nonce}:${systemVersion}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(signatureData), privateKey);
  
  return {
    signature: signature.toString('base64'),
    payload_hash: payloadHash,
    timestamp,
    nonce,
    system_version: systemVersion
  };
}

// Post-Signature Immutability Check
function verifyImmutable(shipmentId) {
  return async (req, res, next) => {
    const signatureResult = await get(`SELECT * FROM DigitalSignatureResults WHERE shipment_id = ?`, [shipmentId]);
    if (signatureResult) {
      const immutableCheck = await get(`SELECT immutable_lock FROM Shipments WHERE id = ?`, [shipmentId]);
      if (!immutableCheck.immutable_lock) {
        return res.status(409).json({ error: 'Payload not immutable - signature applied' });
      }
    }
    next();
  };
}
```

#### Tools:
- Node.js crypto (built-in)
- jsonwebtoken: https://github.com/auth0/node-jsonwebtoken

---

## Phase 2: Financial & Payment Security (Week 2-3)

### 2.1 Ledger System

| Task | Implementation | Why It Matters | Validation |
|------|----------------|----------------|------------|
| Double-Entry Ledger | Debit & credit per transaction | Prevent fraud & silent discrepancies | Ledger sum ≠ external payment → alert |
| Execution Ledger + Locks | Exactly-once per shipment | Prevent duplicate submissions | Duplicate operation → rejected |
| FX Rate Locking | Capture rate at calculation | Prevent stale / manipulated rates | Submit mismatched FX → rejected |
| Reconciliation | Automated + manual | Detect inconsistencies early | Compare ledger vs bank → mismatch triggers alert |
| Payment Alerting | Any mismatch → hold | Prevent financial exposure | Partial payment → submission blocked |

#### Implementation Details:

```sql
-- Double-Entry Ledger Schema
CREATE TABLE LedgerEntries (
  id INTEGER PRIMARY KEY,
  transaction_id TEXT NOT NULL,
  shipment_id TEXT,
  account_type TEXT NOT NULL, -- 'ASSET', 'LIABILITY', 'REVENUE', 'EXPENSE'
  entry_type TEXT NOT NULL, -- 'DEBIT', 'CREDIT'
  amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL,
  fx_rate NUMERIC(18,8),
  fx_snapshot_at DATETIME,
  reference TEXT,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Trigger to ensure debit = credit per transaction
CREATE TRIGGER check_double_entry
AFTER INSERT ON LedgerEntries
BEGIN
  SELECT CASE
    WHEN (SELECT SUM(amount) FROM LedgerEntries WHERE transaction_id = NEW.transaction_id AND entry_type = 'DEBIT') !=
         (SELECT SUM(amount) FROM LedgerEntries WHERE transaction_id = NEW.transaction_id AND entry_type = 'CREDIT')
    THEN RAISE(ABORT, 'Double-entry violation')
  END;
END;
```

```javascript
// FX Rate Locking (services/fx-locker.js)
async function lockFXRate(shipmentId, amount, currency) {
  const fxRate = await getCurrentFXRate(currency, 'NGN'); // Fetch from reliable source
  
  await run(
    `INSERT INTO FXSnapshots (shipment_id, from_currency, to_currency, rate, locked_at) VALUES (?, ?, ?, ?, ?)`,
    [shipmentId, currency, 'NGN', fxRate, new Date().toISOString()]
  );
  
  return fxRate;
}

async function validateFXRate(shipmentId, submittedRate) {
  const snapshot = await get(`SELECT rate FROM FXSnapshots WHERE shipment_id = ?`, [shipmentId]);
  if (snapshot && parseFloat(submittedRate) !== snapshot.rate) {
    throw new Error('FX rate mismatch - stale or manipulated rate rejected');
  }
  return true;
}
```

---

## Phase 3: External Dependencies & Resilience (Week 3-4)

### 3.1 Adapter Layer with Circuit Breakers

| Task | Implementation | Why It Matters | Validation |
|------|----------------|----------------|------------|
| Adapter Pattern | Wrap every external system (NSW, Remita, NAQS, NAFDAC) | Standardize error handling | Adapter failure → isolated |
| Circuit Breaker | opossum - open after X failures | Prevent cascade failures | Kill dependency → fallback triggered |
| Bulkhead Isolation | Separate pipelines per dependency | Contain failure | One dependency failure → others unaffected |
| Retry with Backoff | Exponential backoff, max retries | Handle transient failures | Service returns 503 → retried |

#### Implementation Details:

```javascript
// Circuit Breaker Implementation (resilience/circuit-breaker.js)
const CircuitBreaker = require('opossum');

const options = {
  timeout: 3000, // If request takes longer than 3s, trigger failure
  errorThresholdPercentage: 50, // Open circuit if 50% of requests fail
  resetTimeout: 30000, // Try again after 30s
  volumeThreshold: 10 // Minimum requests before evaluating
};

const breaker = new CircuitBreaker(async (request) => {
  return await axios(request);
}, options);

breaker.on('open', () => console.log('Circuit breaker OPEN - using fallback'));
breaker.on('halfOpen', () => console.log('Circuit breaker HALF-OPEN - testing'));
breaker.on('close', () => console.log('Circuit breaker CLOSED - normal operation'));

breaker.fallback(() => ({
  error: 'Service temporarily unavailable',
  fallback: true,
  cachedResponse: await getCachedResponse()
}));

module.exports = breaker;
```

```javascript
// Bulkhead Pattern - Isolated Pipelines (resilience/bulkhead.js)
const { createPool } = require('generic-pool');

// Separate pools for each external service
const nswPool = createPool({
  acquire: async () => ({ client: 'nsw', status: 'ready' }),
  destroy: async () => {}
}, { max: 10, min: 2 });

const naqsPool = createPool({
  acquire: async () => ({ client: 'naqs', status: 'ready' }),
  destroy: async () => {}
}, { max: 10, min: 2 });

const remitaPool = createPool({
  acquire: async () => ({ client: 'remita', status: 'ready' }),
  destroy: async () => {}
}, { max: 5, min: 1 });

// Usage
async function callNSW(endpoint, payload) {
  const resource = await nswPool.acquire();
  try {
    return await nswClient.request(endpoint, payload);
  } finally {
    nswPool.release(resource);
  }
}
```

#### Tools:
- opossum: https://nodeshift.github.io/opossum
- axios + retry-axios: https://github.com/axios/axios

---

## Phase 4: Event System Security (Week 4)

### 4.1 Event Ledger & Sequencing

| Task | Implementation | Why It Matters | Validation |
|------|----------------|----------------|------------|
| Event Ledger | Hash-chained, immutable | Prevent tampering & lost events | Tamper with event → detection triggered |
| Replay Protection | Nonce + event_id | Stop duplicate processing | Replay event → rejected |
| Dead Letter Queue | Manual/automated resolution | Handle failures safely | Inject failing event → goes to DLQ |
| Signed Queue Messages | Verify before processing | Stop injection attacks | Tampered message → rejected |
| Sequence Enforcement | C100 → C101 → C102 → C103 → C104 → C105 | Ensure valid state transitions | Fire invalid sequence → rejected |

#### Implementation Details (already in engine/event-system.js):

```javascript
// Event Sequence Validation
const VALID_EVENT_SEQUENCE = {
  'C100': ['C101'],
  'C101': ['C102', 'C103'],
  'C102': ['C104', 'C105'],
  'C103': [],
  'C104': ['C105'],
  'C105': []
};

async function validateEventSequence(shipmentId, newEventType) {
  const events = await all(
    `SELECT event_type FROM EventStore WHERE shipment_id = ? ORDER BY timestamp ASC`,
    [shipmentId]
  );
  
  if (events.length === 0) {
    return newEventType === 'C100' ? { valid: true } : { valid: false };
  }
  
  const lastEvent = events[events.length - 1].event_type;
  const validNext = VALID_EVENT_SEQUENCE[lastEvent] || [];
  
  return validNext.includes(newEventType) 
    ? { valid: true } 
    : { valid: false, error: `Invalid transition: ${lastEvent} → ${newEventType}` };
}
```

---

## Phase 5: Observability & Monitoring (Week 4-5)

### 5.1 Metrics & Alerts

| Task | Implementation | Why It Matters | Validation |
|------|----------------|----------------|------------|
| Prometheus Metrics | Success/failure, latency, retries | Detect anomalies early | Simulate failure → metric triggers |
| Threshold Alerts | Threshold-based → SOC | Immediate response | Alert fires on threshold breach |
| Distributed Tracing | OpenTelemetry | Full request visibility | Trace request → all calls visible |
| SOC Integration | Real-time alerts | Human-in-the-loop detection | Simulated attack → SOC notified |

#### Implementation Details:

```javascript
// Prometheus Metrics (observability/metrics.js)
const client = require('prom-client');

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5]
});

const moduleExecutionCounter = new client.Counter({
  name: 'module_executions_total',
  help: 'Total number of module executions',
  labelNames: ['module', 'status']
});

// Middleware to track metrics
function metricsMiddleware(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestDuration.labels(req.method, req.route, res.statusCode).observe(duration);
  });
  next();
}
```

```javascript
// OpenTelemetry Tracing (observability/tracing.js)
const { NodeTracerProvider } = require('@opentelemetry/node');
const { JaegerExporter } = require('@opentelemetry/exporter-jaeger');

const provider = new NodeTracerProvider({
  serviceName: 'culbridge-api'
});

const exporter = new JaegerExporter({
  endpoint: 'http://localhost:14268/api/traces'
});

provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
provider.register();

const tracer = provider.getTracer('culbridge');

// Usage in module execution
async function executeModule(moduleName, fn) {
  const span = tracer.startSpan(moduleName);
  try {
    const result = await fn();
    span.setAttribute('status', 'success');
    return result;
  } catch (error) {
    span.setAttribute('status', 'error');
    span.setAttribute('error.message', error.message);
    throw error;
  } finally {
    span.end();
  }
}
```

#### Tools:
- Prometheus: https://prometheus.io
- Grafana: https://grafana.com
- OpenTelemetry: https://opentelemetry.io

---

## Phase 6: Penetration Testing & Validation (Week 5-6)

### 6.1 Security Testing

| Task | Implementation | Why It Matters | Validation |
|------|----------------|----------------|------------|
| Internal Pen Tests | Quarterly attack all APIs, DB, events | Detect gaps before attackers | Exploit attempt → must fail |
| Bug Bounty | Critical vulnerabilities rewarded | External testing coverage | Valid exploit → bounty paid |
| Exploit Simulation | Simulate Yahoo boys, hackers, insiders | Stress-test system | Simulate attacks → system survives |
| OWASP ZAP Scan | Automated vulnerability scanning | Detect known exploits | Scan results → zero critical |

#### Testing Commands:

```bash
# Run OWASP ZAP baseline scan
zap-baseline.py -t http://localhost:8009 -r zap-report.html

# Test SQL injection
sqlmap -u "http://localhost:8009/v1/shipment-results/CB-001" --risk=3 --level=5

# Test authentication bypass
burp-suite --target localhost:8009 --test-auth

# Test rate limiting
siege -c 100 -t 60S http://localhost:8009/health

# Test signature replay
# Capture valid request, replay with old timestamp
curl -H "signature: <old-signature>" -H "timestamp: <old-timestamp>" ...
```

---

## Phase 7: Insider Threat Mitigation (Week 6)

| Task | Implementation | Why It Matters | Validation |
|------|----------------|----------------|------------|
| Immutable Audit | Log all admin actions | Detect misuse | Alter audit → detection triggers |
| RBAC Strictly Enforced | No bypass allowed | Prevent privilege abuse | Attempt superuser action → rejected |
| Secret Access Logs | Rotate keys | Detect misuse & limit damage | Unauthorized secret read → alert |
| Account Freeze | Automatic on anomaly | Contain insider | Abnormal behavior → account frozen |

---

## Security Verification Checklist

### Pre-Production Validation:

- [ ] All RBAC roles tested with privilege escalation attempts
- [ ] MFA enforced on all admin accounts
- [ ] HMAC signature validation tested with replay attacks
- [ ] Rate limiting verified under load (100+ req/sec)
- [ ] Field-level encryption tested (decrypt fails without key)
- [ ] Immutable audit log tamper detection verified
- [ ] Double-entry ledger balance verified
- [ ] Circuit breaker tested (dependency kill → fallback triggered)
- [ ] Event sequence validation tested (invalid transitions rejected)
- [ ] Webhook idempotency verified (duplicate events rejected)
- [ ] Prometheus metrics captured and alerts triggered
- [ ] OWASP ZAP scan completed with zero critical vulnerabilities
- [ ] Penetration test completed with all exploits blocked

### Absolute Security Metrics:

```
Can Culbridge survive:
- Malicious input → YES (input validation, sanitization)
- Infrastructure chaos → YES (circuit breakers, bulkheads)
- Financial edge cases → YES (FX locking, double-entry ledger)
- Deliberate attacks → YES (signature binding, HMAC, RBAC)
- Insider threats → YES (immutable audit, access controls)
```

---

## Tools & Libraries Summary

| Category | Tool | URL |
|----------|------|-----|
| RBAC | Casbin | https://casbin.org |
| Policy | OPA | https://www.openpolicyagent.org |
| Auth | Passport.js | https://www.passportjs.org |
| MFA | otplib | https://github.com/yeojz/otplib |
| Rate Limit | express-rate-limit | https://www.npmjs.com/package/express-rate-limit |
| Validation | Zod | https://github.com/colinhacks/zod |
| WAF | ModSecurity | https://modsecurity.org |
| Circuit Breaker | opossum | https://nodeshift.github.io/opossum |
| HTTP Client | axios | https://github.com/axios/axios |
| Metrics | Prometheus | https://prometheus.io |
| Dashboards | Grafana | https://grafana.com |
| Tracing | OpenTelemetry | https://opentelemetry.io |
| Pentest | OWASP ZAP | https://www.zaproxy.org |

---

## Execution Directives

1. **Phase 1 (Week 1-2)**: Fix all CRITICAL gaps - IAM, API auth, DB security, signature binding
2. **Phase 2 (Week 2-3)**: Implement financial security - double-entry ledger, FX locking, payment validation
3. **Phase 3 (Week 3-4)**: Harden external dependencies - circuit breakers, bulkheads, retries
4. **Phase 4 (Week 4)**: Secure event system - sequencing, idempotency, DLQ
5. **Phase 5 (Week 4-5)**: Enable observability - metrics, tracing, alerts
6. **Phase 6 (Week 5-6)**: Run penetration tests - OWASP ZAP, exploit simulation
7. **Phase 7 (Week 6)**: Insider threat controls - immutable audit, RBAC

**Non-negotiable**: Every layer above is mandatory. No shortcuts. Any deviation = legal, financial, operational risk.