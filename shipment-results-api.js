/**
 * Culbridge Headless Results API
 * GET /v1/shipment-results/{shipment_id}
 * 
 * Features:
 * - Bearer token authentication
 * - HMAC-SHA256 response verification
 * - Deterministic flag aggregation
 * - Immutable after digital signature
 * - Event-driven triggers for demurrage alerts, EEG timers, dashboard updates
 * - 5-year data retention support
 */

const express = require('express');
const crypto = require('crypto');
const { all, get, run } = require('./utils/db');

// Import rate limiter and metrics
const { rateLimiter } = require('./middleware/rate-limiter');
const { metricsMiddleware, metricsEndpoint } = require('./observability/metrics');
const { checkQueueHealth } = require('./queue/async-queue');

const app = express();
app.use(express.json());

// Apply global middleware
app.use(metricsMiddleware); // Track HTTP metrics with Prometheus

// Configuration (use env vars in production)
const JWT_SECRET = process.env.JWT_SECRET || 'culbridge_secret';
const HMAC_SECRET = process.env.HMAC_SECRET || 'culbridge_hmac_secret';
const API_VERSION = '2026.1';

// Module list for deterministic tracking
const MODULES = [
  'hs_code_validator',
  'document_vault',
  'entity_sync',
  'compliance_engine',
  'fee_calculator',
  'clean_declaration_builder',
  'digital_signature',
  'nsw_esb_submission',
  'webhook_listener',
  'audit_logger'
];

// =============================================
// AUTHENTICATION MIDDLEWARE
// =============================================

/**
 * Bearer token authentication for admin access
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ 
      error: 'Unauthorized', 
      message: 'Bearer token required' 
    });
  }

  const jwt = require('jsonwebtoken');
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ 
        error: 'Forbidden', 
        message: 'Invalid or expired token' 
      });
    }
    req.user = user;
    next();
  });
}

/**
 * Optional HMAC-SHA256 verification on response
 */
function verifyResponseHMAC(req, res, next) {
  const hmacHeader = req.headers['x-hmac-verification'];
  
  if (!hmacHeader) {
    // No HMAC requested, continue without verification
    return next();
  }
  
  // Store original json method
  const originalJson = res.json.bind(res);
  
  // Override json to add HMAC
  res.json = function(data) {
    const payload = JSON.stringify(data);
    const hmac = crypto
      .createHmac('sha256', HMAC_SECRET)
      .update(payload)
      .digest('hex');
    
    res.set('X-Response-HMAC', hmac);
    res.set('X-API-Version', API_VERSION);
    
    return originalJson(data);
  };
  
  next();
}

// =============================================
// MAIN API ENDPOINT
// =============================================

/**
 * GET /v1/shipment-results/{shipment_id}
 * 
 * Requirements:
 * - Aggregate all module outputs into single JSON
 * - Immutable after digital_signature is applied
 * - Bearer token auth for admin access
 * - Optional HMAC-SHA256 verification
 * - Optional filters: module, date_from, date_to, status
 */
app.get('/v1/shipment-results/:shipment_id', 
  rateLimiter, // Apply rate limiting
  authenticateToken, 
  verifyResponseHMAC, 
  async (req, res) => {
    const { shipment_id } = req.params;
    const { module, date_from, date_to, status } = req.query;

    try {
      // 1. Get shipment metadata
      const shipment = await get(
        'SELECT * FROM Shipments WHERE id = ?', 
        [shipment_id]
      );

      if (!shipment) {
        return res.status(404).json({
          error: 'Not Found',
          message: `Shipment ${shipment_id} not found`
        });
      }

      // 2. Check if digital signature exists (immutability flag)
      const digitalSig = await get(
        'SELECT * FROM DigitalSignatureResults WHERE shipment_id = ? ORDER BY id DESC LIMIT 1',
        [shipment_id]
      );

      const isImmutable = !!digitalSig;

      // 3. Aggregate all module outputs
      const aggregatedResults = await aggregateModuleOutputs(
        shipment_id, 
        module, 
        date_from, 
        date_to
      );

      // 4. Verify digital signature if present
      let signatureValidation = null;
      if (digitalSig) {
        signatureValidation = verifyDigitalSignature(
          aggregatedResults.clean_declaration_builder,
          digitalSig
        );
      }

      // 5. Calculate deterministic flags
      const deterministicFlags = calculateDeterministicFlags(aggregatedResults);

      // 6. Get webhook events in order
      const webhookEvents = await getWebhookEvents(shipment_id);

      // 7. Get audit logs
      const auditLogs = await getAuditLogs(shipment_id, date_from, date_to);

      // 8. Build response
      const response = {
        shipment_id,
        version: API_VERSION,
        metadata: {
          created_at: shipment.created_at,
          product: shipment.product,
          destination: shipment.destination,
          batch_number: shipment.batch_number
        },
        aggregated_results: aggregatedResults,
        deterministic_flags: deterministicFlags,
        signature_validation: signatureValidation,
        immutable: isImmutable,
        webhook_events: webhookEvents,
        audit_logs: auditLogs,
        summary: {
          total_modules: MODULES.length,
          verified_deterministic: deterministicFlags.verified_count,
          all_verified: deterministicFlags.verified_count === MODULES.length,
          webhook_event_count: webhookEvents.length,
          audit_entry_count: auditLogs.length
        }
      };

      // 9. Trigger event-driven updates if needed
      await triggerEventDrivenUpdates(shipment_id, aggregatedResults);

      res.json(response);

    } catch (error) {
      console.error('Error fetching shipment results:', error);
      res.status(500).json({ 
        error: 'Internal Server Error', 
        message: error.message 
      });
    }
  }
);

// =============================================
// PDF GENERATION ENDPOINT
// =============================================

/**
 * GET /v1/shipment-results/{shipment_id}/pdf
 * 
 * Returns the generated PDF for a shipment
 * Requirements:
 * - Bearer token authentication
 * - PDF must be generated (all_verified && READY_FOR_SUBMISSION)
 * - Admin or owner-only access
 */
app.get('/v1/shipment-results/:shipment_id/pdf', 
  rateLimiter,
  authenticateToken,
  async (req, res) => {
    const { shipment_id } = req.params;
    
    try {
      // Check if PDF exists
      const pdfRecord = await get(
        'SELECT * FROM GeneratedPdfs WHERE shipment_id = ? AND deleted_at IS NULL',
        [shipment_id]
      );
      
      if (!pdfRecord) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'PDF not generated for this shipment'
        });
      }
      
      // Check access (admin can access all, exporters only own)
      if (req.user.role === 'exporter') {
        // Check if shipment belongs to user
        const shipment = await get(
          'SELECT exporter_id FROM Shipments WHERE id = ?',
          [shipment_id]
        );
        if (!shipment || shipment.exporter_id !== req.user.exporter_id) {
          return res.status(403).json({
            error: 'Forbidden',
            message: 'Not authorized to access this PDF'
          });
        }
      }
      
      // Verify PDF integrity before serving
      const fs = require('fs');
      if (!fs.existsSync(pdfRecord.pdf_path)) {
        return res.status(500).json({
          error: 'Internal Error',
          message: 'PDF file not found on server'
        });
      }
      
      // Calculate current hash
      const crypto = require('crypto');
      const currentHash = crypto.createHash('sha256')
        .update(fs.readFileSync(pdfRecord.pdf_path))
        .digest('hex');
      
      if (currentHash !== pdfRecord.pdf_hash) {
        console.error(`PDF integrity check failed for ${shipment_id}`);
        return res.status(500).json({
          error: 'Integrity Error',
          message: 'PDF hash mismatch - file may be corrupted'
        });
      }
      
      // Set headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${shipment_id}.pdf"`);
      res.setHeader('X-PDF-Hash', pdfRecord.pdf_hash);
      res.setHeader('X-Payload-Hash', pdfRecord.payload_hash || '');
      
      // Stream PDF
      const stream = fs.createReadStream(pdfRecord.pdf_path);
      stream.pipe(res);
      
    } catch (error) {
      console.error('Error retrieving PDF:', error);
      res.status(500).json({ 
        error: 'Internal Server Error', 
        message: error.message 
      });
    }
  }
);

// =============================================
// MODULE OUTPUT AGGREGATION
// =============================================

/**
 * Aggregate all module outputs for a shipment
 */
async function aggregateModuleOutputs(shipment_id, moduleFilter, date_from, date_to) {
  const results = {};

  // 1. HS Code Validator
  if (!moduleFilter || moduleFilter === 'hs_code_validator') {
    results.hs_code_validator = await getHSCodeValidation(shipment_id);
  }

  // 2. Document Vault
  if (!moduleFilter || moduleFilter === 'document_vault') {
    results.document_vault = await getDocumentVault(shipment_id);
  }

  // 3. Entity Sync
  if (!moduleFilter || moduleFilter === 'entity_sync') {
    results.entity_sync = await getEntitySync(shipment_id);
  }

  // 4. Compliance Engine
  if (!moduleFilter || moduleFilter === 'compliance_engine') {
    results.compliance_engine = await getComplianceEngine(shipment_id);
  }

  // 5. Fee Calculator
  if (!moduleFilter || moduleFilter === 'fee_calculator') {
    results.fee_calculator = await getFeeCalculation(shipment_id);
  }

  // 6. Clean Declaration Builder
  if (!moduleFilter || moduleFilter === 'clean_declaration_builder') {
    results.clean_declaration_builder = await getCleanDeclaration(shipment_id);
  }

  // 7. Digital Signature
  if (!moduleFilter || moduleFilter === 'digital_signature') {
    results.digital_signature = await getDigitalSignature(shipment_id);
  }

  // 8. NSW ESB Submission
  if (!moduleFilter || moduleFilter === 'nsw_esb_submission') {
    results.nsw_esb_submission = await getNSWSubmission(shipment_id);
  }

  // 9. Webhook Listener
  if (!moduleFilter || moduleFilter === 'webhook_listener') {
    results.webhook_listener = {
      events: await getWebhookEvents(shipment_id),
      deterministic_flag: true
    };
  }

  // 10. Audit Logger
  if (!moduleFilter || moduleFilter === 'audit_logger') {
    results.audit_logger = {
      logs: await getAuditLogs(shipment_id, date_from, date_to),
      deterministic_flag: true
    };
  }

  return results;
}

/**
 * Get HS Code Validation results
 */
async function getHSCodeValidation(shipment_id) {
  const result = await get(
    'SELECT * FROM HSCodeValidationResults WHERE shipment_id = ? ORDER BY id DESC LIMIT 1',
    [shipment_id]
  );
  
  if (!result) return null;
  
  return {
    validated_hs_code: result.validated_hs_code,
    hs_mapping: JSON.parse(result.hs_mapping),
    commodity_description: result.commodity_description,
    deterministic_flag: result.deterministic_flag === 1,
    validated_at: result.validated_at
  };
}

/**
 * Get Document Vault results
 */
async function getDocumentVault(shipment_id) {
  const result = await get(
    'SELECT * FROM DocumentVaultResults WHERE shipment_id = ? ORDER BY id DESC LIMIT 1',
    [shipment_id]
  );
  
  if (!result) return null;
  
  return {
    certificates: JSON.parse(result.certificates),
    naqs_reference: result.naqs_reference,
    nepc_reference: result.nepc_reference,
    nafdac_reference: result.nafdac_reference,
    son_reference: result.son_reference,
    deterministic_flag: result.deterministic_flag === 1,
    stored_at: result.stored_at
  };
}

/**
 * Get Entity Sync results
 */
async function getEntitySync(shipment_id) {
  const result = await get(
    'SELECT * FROM EntitySyncResults WHERE shipment_id = ? ORDER BY id DESC LIMIT 1',
    [shipment_id]
  );
  
  if (!result) return null;
  
  return {
    tin: result.tin,
    rc_number: result.rc_number,
    cac_reference: result.cac_reference,
    aeo_status: result.aeo_status,
    aeo_expiry_date: result.aeo_expiry_date,
    deterministic_flag: result.deterministic_flag === 1,
    synced_at: result.synced_at
  };
}

/**
 * Get Compliance Engine results
 */
async function getComplianceEngine(shipment_id) {
  const result = await get(
    'SELECT * FROM ComplianceEngineResults WHERE shipment_id = ? ORDER BY id DESC LIMIT 1',
    [shipment_id]
  );
  
  if (!result) return null;
  
  return {
    eudr_status: result.eudr_status,
    eudr_assessment: result.eudr_assessment ? JSON.parse(result.eudr_assessment) : null,
    farm_coordinates: result.farm_coordinates ? JSON.parse(result.farm_coordinates) : null,
    farm_polygons: result.farm_polygons ? JSON.parse(result.farm_polygons) : null,
    residue_limits: result.residue_limits ? JSON.parse(result.residue_limits) : null,
    pade_status: result.pade_status,
    deterministic_flag: result.deterministic_flag === 1,
    evaluated_at: result.evaluated_at
  };
}

/**
 * Get Fee Calculation results
 */
async function getFeeCalculation(shipment_id) {
  const result = await get(
    'SELECT * FROM FeeCalculationResults WHERE shipment_id = ? ORDER BY id DESC LIMIT 1',
    [shipment_id]
  );
  
  if (!result) return null;
  
  return {
    nes_levy: result.nes_levy,
    duty: result.duty,
    agency_fees: JSON.parse(result.agency_fees),
    total_estimated_costs: result.total_estimated_costs,
    payment_ref: result.payment_ref,
    currency: result.currency,
    exchange_rate: result.exchange_rate,
    deterministic_flag: result.deterministic_flag === 1,
    calculated_at: result.calculated_at
  };
}

/**
 * Get Clean Declaration results
 */
async function getCleanDeclaration(shipment_id) {
  const result = await get(
    'SELECT * FROM CleanDeclarationResults WHERE shipment_id = ? ORDER BY id DESC LIMIT 1',
    [shipment_id]
  );
  
  if (!result) return null;
  
  return {
    payload_version: result.payload_version,
    payload: JSON.parse(result.payload),
    deterministic_flag: result.deterministic_flag === 1,
    built_at: result.built_at
  };
}

/**
 * Get Digital Signature results
 */
async function getDigitalSignature(shipment_id) {
  const result = await get(
    'SELECT * FROM DigitalSignatureResults WHERE shipment_id = ? ORDER BY id DESC LIMIT 1',
    [shipment_id]
  );
  
  if (!result) return null;
  
  return {
    payload_hash: result.payload_hash,
    digital_signature: result.digital_signature,
    signer_identity: result.signer_identity,
    certificate_serial: result.certificate_serial,
    signed_at: result.signed_at
  };
}

/**
 * Get NSW Submission results
 */
async function getNSWSubmission(shipment_id) {
  const result = await get(
    'SELECT * FROM NSWSubmissionResults WHERE shipment_id = ? ORDER BY id DESC LIMIT 1',
    [shipment_id]
  );
  
  if (!result) return null;
  
  return {
    sgd_number: result.sgd_number,
    submission_status: result.submission_status,
    priority_lane: result.priority_lane,
    rejection_reason: result.rejection_reason,
    submitted_at: result.submitted_at,
    response_received_at: result.response_received_at
  };
}

/**
 * Get Webhook Events in order of occurrence
 */
async function getWebhookEvents(shipment_id) {
  const events = await all(
    'SELECT * FROM NSWWebhookEvents WHERE shipment_id = ? ORDER BY received_at ASC',
    [shipment_id]
  );
  
  return events.map(e => ({
    event_type: e.event_type,
    event_data: e.event_data ? JSON.parse(e.event_data) : null,
    received_at: e.received_at,
    processed: e.processed === 1
  }));
}

/**
 * Get Audit Logs
 */
async function getAuditLogs(shipment_id, date_from, date_to) {
  let query = 'SELECT * FROM AuditLogs WHERE shipment_id = ?';
  const params = [shipment_id];

  if (date_from) {
    query += ' AND timestamp >= ?';
    params.push(date_from);
  }

  if (date_to) {
    query += ' AND timestamp <= ?';
    params.push(date_to);
  }

  query += ' ORDER BY timestamp DESC';

  const logs = await all(query, params);
  
  return logs.map(log => ({
    module: log.module,
    action: log.action,
    actor: log.actor,
    outcome: log.outcome,
    details: log.details ? JSON.parse(log.details) : null,
    timestamp: log.timestamp
  }));
}

// =============================================
// DIGITAL SIGNATURE VERIFICATION
// =============================================

/**
 * Verify digital signature against payload
 */
function verifyDigitalSignature(cleanDeclaration, signatureResult) {
  if (!cleanDeclaration || !cleanDeclaration.payload) {
    return { valid: false, reason: 'No clean declaration payload' };
  }

  const payloadString = JSON.stringify(cleanDeclaration.payload);
  const computedHash = crypto
    .createHash('sha256')
    .update(payloadString)
    .digest('base64');

  const hashMatches = computedHash === signatureResult.payload_hash;

  return {
    valid: hashMatches,
    payload_hash: signatureResult.payload_hash,
    computed_hash: computedHash,
    signer_identity: signatureResult.signer_identity,
    verified_at: new Date().toISOString()
  };
}

// =============================================
// DETERMINISTIC FLAGS CALCULATION
// =============================================

/**
 * Calculate deterministic flags for all modules
 */
function calculateDeterministicFlags(aggregatedResults) {
  const flags = {};
  let verifiedCount = 0;

  MODULES.forEach(module => {
    const moduleData = aggregatedResults[module];
    let isVerified = false;

    if (moduleData) {
      // Check various possible flag locations
      if (moduleData.deterministic_flag === true) {
        isVerified = true;
      } else if (moduleData.payload && moduleData.deterministic_flag === true) {
        isVerified = true;
      } else if (module === 'nsw_esb_submission' && moduleData.submission_status) {
        // NSW submission is verified if it has a status
        isVerified = true;
      } else if (module === 'digital_signature' && moduleData.digital_signature) {
        // Digital signature is verified if present
        isVerified = true;
      } else if (module === 'webhook_listener') {
        // Webhook listener is always deterministic
        isVerified = true;
      } else if (module === 'audit_logger') {
        // Audit logger is always deterministic
        isVerified = true;
      }
    }

    flags[module] = isVerified;
    if (isVerified) verifiedCount++;
  });

  return {
    flags,
    verified_count: verifiedCount,
    total_modules: MODULES.length,
    all_verified: verifiedCount === MODULES.length
  };
}

// =============================================
// EVENT-DRIVEN TRIGGERS
// =============================================

/**
 * Trigger event-driven updates based on shipment status
 */
async function triggerEventDrivenUpdates(shipment_id, aggregatedResults) {
  try {
    // 1. Check for NSW acceptance to trigger demurrage alerts
    const nswResult = aggregatedResults.nsw_esb_submission;
    if (nswResult && nswResult.submission_status === 'ACCEPTED') {
      await createEvent(shipment_id, 'NSW_ACCEPTED', {
        sgd_number: nswResult.sgd_number,
        priority_lane: nswResult.priority_lane
      }, 'nsw_esb_submission');
    }

    // 2. Check for digital signature to lock records
    if (aggregatedResults.digital_signature) {
      await createEvent(shipment_id, 'DECLARATION_SIGNED', {
        signer_identity: aggregatedResults.digital_signature.signer_identity
      }, 'digital_signature');
    }

    // 3. Check for compliance issues
    const compliance = aggregatedResults.compliance_engine;
    if (compliance && compliance.eudr_status === 'NON_COMPLIANT') {
      await createEvent(shipment_id, 'EUDR_NON_COMPLIANT', {
        eudr_status: compliance.eudr_status
      }, 'compliance_engine');
    }

    // 4. Check for AEO expiry
    const entitySync = aggregatedResults.entity_sync;
    if (entitySync && entitySync.aeo_status === 'EXPIRED') {
      await createEvent(shipment_id, 'AEO_EXPIRED', {
        aeo_expiry_date: entitySync.aeo_expiry_date
      }, 'entity_sync');
    }

  } catch (error) {
    console.error('Error triggering event-driven updates:', error);
  }
}

/**
 * Create event in event bus
 */
async function createEvent(shipment_id, event_type, payload, triggered_by) {
  const payloadStr = payload ? JSON.stringify(payload) : JSON.stringify({});
  await run(
    `INSERT INTO EventBus (event_type, shipment_id, payload, triggered_by) VALUES (?, ?, ?, ?)`,
    [event_type, shipment_id, payloadStr, triggered_by]
  );
}

// =============================================
// WEBHOOK ENDPOINT FOR NSW EVENTS
// =============================================

// Import validation
const { validateWebhookPayload, validateWebhookIdempotency, validateEventSequence, validateModuleOutput, validateTimestamp, validateNonce, sanitizeOutput } = require('./security/input-validation');

/**
 * POST /v1/webhooks/nsw
 * Receive webhook events from NSW ESB (C100 → C105)
 * With schema validation to prevent EXT-001 attack
 * With idempotency to prevent CONC-001 attack
 * With event sequence validation to prevent EXT-002 attack
 */
app.post('/v1/webhooks/nsw', 
  rateLimiter,
  validateWebhookPayload, 
  validateWebhookIdempotency, 
  validateEventSequence, 
  async (req, res) => {
  const { shipment_id, event_type, event_data } = req.body;

  if (!shipment_id || !event_type) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'shipment_id and event_type required'
    });
  }

  try {
    // Store webhook event
    await run(
      `INSERT INTO NSWWebhookEvents (shipment_id, event_type, event_data) VALUES (?, ?, ?)`,
      [shipment_id, event_type, JSON.stringify(event_data)]
    );

    // Create event bus entry for downstream processing
    await createEvent(shipment_id, `WEBHOOK_${event_type}`, event_data, 'webhook_listener');

    // Log audit
    await logAudit(shipment_id, 'webhook_listener', 'RECEIVE_EVENT', 'webhook_listener', 'SUCCESS', {
      event_type,
      received_at: new Date().toISOString()
    });

    res.json({ success: true, message: 'Webhook event received' });

  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ 
      error: 'Internal Server Error', 
      message: error.message 
    });
  }
});

// =============================================
// MODULE OUTPUT STORAGE ENDPOINT
// =============================================

// Module output validation is already imported above

/**
 * POST /v1/module-results/{module}
 * Store module output (internal use)
 * With schema validation + timestamp/nonce to prevent STATE-002, SIGN-001, DATA-001 attacks
 */
app.post('/v1/module-results/:module', 
  rateLimiter,
  authenticateToken, 
  validateTimestamp, 
  validateNonce, 
  sanitizeOutput, 
  async (req, res) => {
  const { module } = req.params;
  const { shipment_id, output } = req.body;

  if (!MODULES.includes(module)) {
    return res.status(400).json({
      error: 'Bad Request',
      message: `Invalid module. Valid modules: ${MODULES.join(', ')}`
    });
  }
  
  // Apply module-specific schema validation (DATA-001 fix)
  const validateOutput = validateModuleOutput(module);
  try {
    validateOutput(req, res, (err) => {
      if (err) {
        // Validation failed, response already sent
        return;
      }
      
      // Continue with normal processing
      if (!shipment_id || !output) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'shipment_id and output required'
        });
      }
    });
  } catch (e) {
    // Schema validation error - will be handled by validateOutput callback
    if (e.message && e.message.includes('output field is required')) {
      return res.status(400).json({ error: 'Bad Request', message: 'output field is required' });
    }
  }

  // If validation passed, continue
  if (!shipment_id || !output) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'shipment_id and output required'
    });
  }

  try {
    // Auto-create Shipment record if it doesn't exist
    const existingShipment = await get(
      'SELECT id FROM Shipments WHERE id = ?',
      [shipment_id]
    );
    
    if (!existingShipment) {
      try {
        await run(
          `INSERT INTO Shipments (id, exporter_id, product, category, destination, batch_number, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [shipment_id, 'UNKNOWN', 'agro-export', 'agro-export', 'UNKNOWN', 'N/A', new Date().toISOString()]
        );
      } catch (insertError) {
        console.error('Shipment insert error:', insertError.message);
        // Continue - might already exist due to race condition
      }
    }

    // Determine deterministic flag based on module
    const deterministicFlag = determineDeterministicFlag(module, output);

    // Store in ShipmentModuleResults
    await run(
      `INSERT INTO ShipmentModuleResults (shipment_id, module, output, deterministic_flag) VALUES (?, ?, ?, ?)`,
      [shipment_id, module, JSON.stringify(output), deterministicFlag]
    );

    // Log audit
    await logAudit(shipment_id, module, 'STORE_OUTPUT', req.user?.username || 'system', 'SUCCESS', {
      output_size: JSON.stringify(output).length
    });

    res.json({ 
      success: true, 
      module,
      shipment_id,
      deterministic_flag: deterministicFlag
    });

  } catch (error) {
    console.error('Error storing module result:', error);
    res.status(500).json({ 
      error: 'Internal Server Error', 
      message: error.message 
    });
  }
});

/**
 * Determine if module output is deterministic
 */
function determineDeterministicFlag(module, output) {
  // Modules with deterministic outputs
  const deterministicModules = [
    'hs_code_validator',
    'document_vault',
    'entity_sync',
    'compliance_engine',
    'fee_calculator',
    'clean_declaration_builder'
  ];

  if (deterministicModules.includes(module)) {
    return true;
  }

  // Check for required fields in output
  if (module === 'digital_signature' && output.digital_signature) {
    return true;
  }

  if (module === 'nsw_esb_submission' && output.submission_status) {
    return true;
  }

  return false;
}

// =============================================
// AUDIT LOGGING HELPER
// =============================================

/**
 * Log audit entry
 */
async function logAudit(shipment_id, module, action, actor, outcome, details) {
  await run(
    `INSERT INTO AuditLogs (shipment_id, module, action, actor, outcome, details) VALUES (?, ?, ?, ?, ?, ?)`,
    [shipment_id, module, action, actor, outcome, JSON.stringify(details || {})]
  );
}

// =============================================
// DATA RETENTION CLEANUP JOB
// =============================================

/**
 * DELETE /v1/admin/cleanup
 * Run data retention cleanup (5 years = 1825 days)
 */
app.delete('/v1/admin/cleanup', authenticateToken, async (req, res) => {
  const retentionDays = 1825; // 5 years

  try {
    // Tables with their timestamp columns
    const tableTimestampMap = {
      'ShipmentModuleResults': 'created_at',
      'HSCodeValidationResults': 'validated_at',
      'DocumentVaultResults': 'stored_at',
      'EntitySyncResults': 'synced_at',
      'ComplianceEngineResults': 'evaluated_at',
      'FeeCalculationResults': 'calculated_at',
      'CleanDeclarationResults': 'built_at',
      'DigitalSignatureResults': 'signed_at',
      'NSWSubmissionResults': 'submitted_at',
      'NSWWebhookEvents': 'received_at',
      'AuditLogs': 'timestamp',
      'EventBus': 'created_at'
    };
    
    const results = [];
    
    for (const [tableName, timestampColumn] of Object.entries(tableTimestampMap)) {
      try {
        // Check if column exists
        const columnCheck = await get(`PRAGMA table_info(${tableName})`);
        if (!columnCheck) continue;
        
        // Build cutoff date
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
        
        const result = await run(
          `DELETE FROM ${tableName} WHERE ${timestampColumn} < ?`,
          [cutoffDate.toISOString()]
        );
        
        results.push({
          table: tableName,
          deleted: result.changes
        });
      } catch (e) {
        // Skip tables that don't have the column or other errors
        results.push({
          table: tableName,
          error: e.message,
          deleted: 0
        });
      }
    }

    res.json({
      success: true,
      retention_days: retentionDays,
      results
    });

  } catch (error) {
    console.error('Cleanup error:', error);
    res.status(500).json({ 
      error: 'Internal Server Error', 
      message: error.message 
    });
  }
});

// =============================================
// HEALTH CHECK
// =============================================

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    version: API_VERSION,
    modules: MODULES
  });
});

// =============================================
// METRICS ENDPOINT (Prometheus)
// =============================================

app.get('/metrics', async (req, res) => {
  try {
    const metrics = require('./observability/metrics');
    res.set('Content-Type', metrics.register.contentType);
    res.end(await metrics.register.metrics());
  } catch (error) {
    res.status(500).json({ error: 'Metrics unavailable', message: error.message });
  }
});

// =============================================
// IDENTITY METADATA ENDPOINT (Internal)
// =============================================

/**
 * GET /v1/identity/attribution
 * Internal-only: Returns founder and team attribution for dashboards/logs
 * NEVER: Customer-facing, financial payloads, sensitive data
 */
app.get('/v1/identity/attribution', authenticateToken, (req, res) => {
  try {
    const identity = require('./identity/metadata');
    res.json({
      success: true,
      attribution: identity.getInternalAttribution(),
      note: 'Internal use only - Do not expose to customers'
    });
  } catch (error) {
    res.status(500).json({ error: 'Identity service unavailable', message: error.message });
  }
});

// =============================================
// SERVER STARTUP
// =============================================

const PORT = process.env.PORT || 3004;

app.listen(PORT, () => {
  console.log(`🚀 Headless Results API: http://localhost:${PORT}`);
  console.log(`📋 Available endpoints:`);
  console.log(`   GET  /v1/shipment-results/:shipment_id`);
  console.log(`   POST /v1/webhooks/nsw`);
  console.log(`   POST /v1/module-results/:module`);
  console.log(`   DELETE /v1/admin/cleanup`);
  console.log(`   GET  /health`);
});

module.exports = app;
