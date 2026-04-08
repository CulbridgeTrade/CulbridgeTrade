/**
 * Input Validation Middleware using Zod
 * Addresses multiple red team findings:
 * - EXT-001: Schema validation on webhook payload
 * - DATA-001: Type validation on module outputs
 * - SIGN-001: Timestamp + nonce on write operations
 * - CONC-001: Webhook idempotency
 * - EXT-002: Event sequence validation
 */

const crypto = require('crypto');
const { z } = require('zod');

// =============================================
// WEBHOOK PAYLOAD SCHEMAS
// =============================================

const NSWWebhookSchema = z.object({
  shipment_id: z.string().min(1, 'shipment_id required'),
  event_type: z.string().refine(
    val => ['C100', 'C101', 'C102', 'C103', 'C104', 'C105'].includes(val),
    { message: 'Invalid event_type - must be C100-C105' }
  ),
  event_data: z.object({
    status: z.string().optional(),
    sgd_number: z.string().optional(),
    timestamp: z.string().optional(),
    rejection_reason: z.string().optional()
  }).optional().nullable()
});

// =============================================
// MODULE OUTPUT SCHEMAS
// =============================================

const HSCodeValidatorOutputSchema = z.object({
  validated_hs_code: z.string(),
  hs_mapping: z.object({
    chapter: z.number(),
    heading: z.number(),
    subheading: z.number(),
    description: z.string()
  }),
  commodity_description: z.string(),
  deterministic_flag: z.boolean()
});

const DocumentVaultOutputSchema = z.object({
  certificates: z.array(z.object({
    type: z.string(),
    ref: z.string(),
    status: z.string()
  })),
  naqs_reference: z.string().optional(),
  nepc_reference: z.string().optional(),
  nafdac_reference: z.string().optional(),
  son_reference: z.string().optional(),
  deterministic_flag: z.boolean()
});

const EntitySyncOutputSchema = z.object({
  tin: z.string(),
  rc_number: z.string().optional(),
  cac_reference: z.string().optional(),
  aeo_status: z.string(),
  aeo_expiry_date: z.string().optional(),
  deterministic_flag: z.boolean()
});

const ComplianceEngineOutputSchema = z.object({
  eudr_status: z.string(),
  eudr_assessment: z.object({
    deforestation_risk: z.string(),
    risk_score: z.number()
  }).optional(),
  farm_coordinates: z.array(z.object({
    lat: z.number(),
    lng: z.number()
  })).optional(),
  farm_polygons: z.array(z.any()).optional(),
  residue_limits: z.object({
    pesticides: z.array(z.any()),
    mycotoxins: z.array(z.any())
  }).optional(),
  pade_status: z.string().optional(),
  deterministic_flag: z.boolean()
});

const FeeCalculatorOutputSchema = z.object({
  nes_levy: z.number(),
  duty: z.number(),
  agency_fees: z.object({
    inspection: z.number(),
    processing: z.number(),
    clearance: z.number()
  }),
  total_estimated_costs: z.number(),
  payment_ref: z.string(),
  currency: z.string(),
  exchange_rate: z.number(),
  deterministic_flag: z.boolean()
});

const CleanDeclarationBuilderOutputSchema = z.object({
  payload_version: z.string(),
  payload: z.object({
    declaration_ref: z.string(),
    version: z.string(),
    exporter: z.object({ tin: z.string() }),
    product: z.object({
      hs_code: z.string(),
      description: z.string()
    }),
    destination: z.string(),
    priority_lane: z.string()
  }),
  deterministic_flag: z.boolean()
});

const DigitalSignatureOutputSchema = z.object({
  payload_hash: z.string(),
  digital_signature: z.string(),
  signer_identity: z.string(),
  certificate_serial: z.string().optional(),
  signed_at: z.string().optional()
});

const NSWSubmissionOutputSchema = z.object({
  sgd_number: z.string(),
  submission_status: z.string(),
  priority_lane: z.string().optional(),
  rejection_reason: z.string().optional(),
  submitted_at: z.string().optional(),
  response_received_at: z.string().optional()
});

// Module to schema mapping
const MODULE_SCHEMAS = {
  hs_code_validator: HSCodeValidatorOutputSchema,
  document_vault: DocumentVaultOutputSchema,
  entity_sync: EntitySyncOutputSchema,
  compliance_engine: ComplianceEngineOutputSchema,
  fee_calculator: FeeCalculatorOutputSchema,
  clean_declaration_builder: CleanDeclarationBuilderOutputSchema,
  digital_signature: DigitalSignatureOutputSchema,
  nsw_esb_submission: NSWSubmissionOutputSchema
};

// =============================================
// VALIDATION MIDDLEWARE
// =============================================

/**
 * Validate webhook payload
 */
function validateWebhookPayload(req, res, next) {
  try {
    NSWWebhookSchema.parse(req.body);
    next();
  } catch (error) {
    // Log for debugging
    console.error('Webhook validation error:', error.message);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation Error',
        details: error.errors?.map ? error.errors.map(e => ({
          field: e.path?.join('.') || 'unknown',
          message: e.message
        })) : [{ field: 'body', message: 'Invalid payload structure' }]
      });
    }
    return res.status(400).json({
      error: 'Validation Error',
      message: error.message || 'Invalid request'
    });
  }
}

// =============================================
// WEBHOOK IDEMPOTENCY (CONC-001 FIX)
// =============================================

/**
 * Validate webhook idempotency - prevent duplicate processing
 */
const processedWebhooks = new Map(); // In production, use Redis

function validateWebhookIdempotency(req, res, next) {
  const { shipment_id, event_type, event_data } = req.body;
  
  if (!shipment_id || !event_type) {
    return next(); // Let previous middleware handle this
  }
  
  // Create idempotency key from shipment_id + event_type + some event data hash
  const eventDataHash = event_data ? 
    crypto.createHash('md5').update(JSON.stringify(event_data)).digest('hex').slice(0, 8) : '';
  const idempotencyKey = `${shipment_id}:${event_type}:${eventDataHash}`;
  
  if (processedWebhooks.has(idempotencyKey)) {
    console.log(`[IDEMPOTENCY] Duplicate webhook rejected: ${idempotencyKey}`);
    return res.status(409).json({
      error: 'Conflict',
      message: 'Webhook already processed',
      idempotency_key: idempotencyKey
    });
  }
  
  // Mark as processed
  processedWebhooks.set(idempotencyKey, Date.now());
  
  // Clean up old entries (5 minute TTL)
  const now = Date.now();
  for (const [key, timestamp] of processedWebhooks.entries()) {
    if (now - timestamp > 5 * 60 * 1000) {
      processedWebhooks.delete(key);
    }
  }
  
  // Store idempotency key in request for downstream use
  req.idempotencyKey = idempotencyKey;
  
  next();
}

// =============================================
// EVENT SEQUENCE VALIDATION (EXT-002 FIX)
// =============================================

/**
 * Valid event transitions
 */
const VALID_EVENT_SEQUENCE = {
  'C100': ['C101'],
  'C101': ['C102', 'C103'],
  'C102': ['C104', 'C105'],
  'C103': [],
  'C104': ['C105'],
  'C105': []
};

/**
 * Validate event sequence - prevent invalid state transitions
 */
const eventStore = new Map(); // In production, use database

function validateEventSequence(req, res, next) {
  const { shipment_id, event_type } = req.body;
  
  if (!shipment_id || !event_type) {
    return next(); // Let previous middleware handle this
  }
  
  // Get existing events for this shipment
  const events = eventStore.get(shipment_id) || [];
  
  if (events.length === 0) {
    // First event must be C100
    if (event_type !== 'C100') {
      console.log(`[SEQUENCE] Invalid first event: ${event_type} (expected C100)`);
      return res.status(400).json({
        error: 'Validation Error',
        message: `Invalid event sequence: first event must be C100, got ${event_type}`
      });
    }
  } else {
    // Validate transition from last event
    const lastEvent = events[events.length - 1];
    const validNext = VALID_EVENT_SEQUENCE[lastEvent] || [];
    
    if (!validNext.includes(event_type)) {
      console.log(`[SEQUENCE] Invalid transition: ${lastEvent} -> ${event_type}`);
      return res.status(400).json({
        error: 'Validation Error',
        message: `Invalid event transition: ${lastEvent} -> ${event_type} not allowed`
      });
    }
  }
  
  // Add event to store
  events.push(event_type);
  eventStore.set(shipment_id, events);
  
  next();
}

/**
 * Validate module output schema
 */
function validateModuleOutput(moduleName) {
  return (req, res, next) => {
    const schema = MODULE_SCHEMAS[moduleName];
    
    if (!schema) {
      return res.status(400).json({
        error: 'Validation Error',
        message: `Unknown module: ${moduleName}`
      });
    }
    
    try {
      // Validate the output field
      if (!req.body.output) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'output field is required'
        });
      }
      
      schema.parse(req.body.output);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation Error',
          details: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        });
      }
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Validation failed'
      });
    }
  };
}

/**
 * Validate timestamp freshness (5 minute TTL)
 */
function validateTimestamp(req, res, next) {
  const { timestamp } = req.body;
  
  if (!timestamp) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'timestamp field required for write operations'
    });
  }
  
  const timestampNum = parseInt(timestamp, 10);
  const now = Date.now();
  const ttl = 5 * 60 * 1000; // 5 minutes
  
  if (isNaN(timestampNum) || now - timestampNum > ttl) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'timestamp expired or invalid'
    });
  }
  
  next();
}

/**
 * Validate nonce uniqueness
 */
const usedNonces = new Set();

function validateNonce(req, res, next) {
  const { nonce } = req.body;
  
  if (!nonce) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'nonce field required for write operations'
    });
  }
  
  if (usedNonces.has(nonce)) {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'nonce already used'
    });
  }
  
  // Add to set (in production, store in Redis with TTL)
  usedNonces.add(nonce);
  setTimeout(() => usedNonces.delete(nonce), 5 * 60 * 1000);
  
  next();
}

/**
 * Sanitize output - remove null/undefined values
 */
function sanitizeOutput(req, res, next) {
  if (req.body.output && typeof req.body.output === 'object') {
    req.body.output = JSON.parse(JSON.stringify(req.body.output));
  }
  next();
}

module.exports = {
  // Schemas
  NSWWebhookSchema,
  MODULE_SCHEMAS,
  // Middleware
  validateWebhookPayload,
  validateWebhookIdempotency,
  validateEventSequence,
  validateModuleOutput,
  validateTimestamp,
  validateNonce,
  sanitizeOutput
};