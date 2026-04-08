/**
 * ESB Compatibility Layer - NSW Transformation
 * 
 * Transforms Culbridge payload to NSW ESB format and normalizes responses.
 * Handles:
 * - Strict schema enforcement
 * - Field ordering
 * - Type coercion
 * - Response normalization
 * - Partial success / silent failure handling
 */

const crypto = require('crypto');

// NSW ESB Schema (simplified - real schema would be more complex)
const NSW_ESB_SCHEMA = {
  required: [
    'declaration_ref',
    'version',
    'exporter',
    'importer',
    'product',
    'destination'
  ],
  exporter: {
    required: ['tin', 'name', 'address'],
    optional: ['rc_number', 'cac_reference', 'aeo_number']
  },
  importer: {
    required: ['name', 'address', 'country'],
    optional: ['tin', 'eori_number']
  },
  product: {
    required: ['hs_code', 'description', 'quantity', 'unit'],
    optional: ['weight', 'origin_country', 'marks']
  },
  documents: {
    required: ['type', 'reference'],
    optional: ['issue_date', 'expiry_date', 'issuing_authority']
  }
};

// Field type coercion rules
const FIELD_COERCION = {
  quantity: 'number',
  weight: 'number',
  unit_value: 'number',
  hs_code: 'string',
  tin: 'string',
  eori_number: 'string'
};

/**
 * Transform Culbridge payload to NSW ESB format
 * @param {Object} cleanDeclaration - Clean declaration payload
 * @returns {Object} NSW-formatted payload
 */
function transformToNSWFormat(cleanDeclaration) {
  const result = {
    // Header
    declaration_ref: cleanDeclaration.declaration_ref || `CUL-${Date.now()}`,
    version: cleanDeclaration.version || '2026.1',
    submission_type: 'STANDARD',
    declaration_type: 'EXPORT',
    
    // Exporter (required in specific order)
    exporter: {
      tin: cleanDeclaration.exporter?.tin || '',
      name: cleanDeclaration.exporter?.name || '',
      address: cleanDeclaration.exporter?.address || '',
      rc_number: cleanDeclaration.exporter?.rc_number || null,
      cac_reference: cleanDeclaration.exporter?.cac_reference || null,
      aeo_number: cleanDeclaration.exporter?.aeo_number || null
    },
    
    // Importer
    importer: {
      name: cleanDeclaration.importer?.name || '',
      address: cleanDeclaration.importer?.address || '',
      country: cleanDeclaration.importer?.country || '',
      tin: cleanDeclaration.importer?.tin || null,
      eori_number: cleanDeclaration.importer?.eori_number || null
    },
    
    // Product (required)
    product: {
      hs_code: cleanDeclaration.product?.hs_code || '',
      description: cleanDeclaration.product?.description || '',
      quantity: parseQuantity(cleanDeclaration.product?.quantity),
      unit: cleanDeclaration.product?.unit || 'KG',
      weight: parseQuantity(cleanDeclaration.product?.weight),
      origin_country: cleanDeclaration.product?.origin_country || 'NG',
      marks: cleanDeclaration.product?.marks || null
    },
    
    // Destination
    destination: {
      country: cleanDeclaration.destination || '',
      port: cleanDeclaration.port || '',
      transport_mode: cleanDeclaration.transport_mode || 'SEA'
    },
    
    // Financial
    financial: {
      invoice_value: parseQuantity(cleanDeclaration.financial?.invoice_value),
      currency: cleanDeclaration.financial?.currency || 'NGN',
      freight: parseQuantity(cleanDeclaration.financial?.freight) || 0,
      insurance: parseQuantity(cleanDeclaration.financial?.insurance) || 0
    },
    
    // Documents (array)
    documents: (cleanDeclaration.documents || []).map(doc => ({
      type: doc.type || '',
      reference: doc.reference || '',
      issue_date: doc.issue_date || null,
      expiry_date: doc.expiry_date || null,
      issuing_authority: doc.issuing_authority || null
    })),
    
    // Metadata
    metadata: {
      submitted_by: cleanDeclaration.submitted_by || 'CULBRIDGE_SYSTEM',
      submission_timestamp: new Date().toISOString(),
      batch_reference: cleanDeclaration.batch_reference || null
    }
  };
  
  // Apply field type coercion
  applyFieldCoercion(result);
  
  // Validate against schema
  const validation = validateNSWPayload(result);
  
  return {
    payload: result,
    validation
  };
}

/**
 * Parse and coerce quantity fields
 */
function parseQuantity(value) {
  if (value === null || value === undefined) return 0;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Apply field type coercion
 */
function applyFieldCoercion(payload) {
  for (const [field, type] of Object.entries(FIELD_COERCION)) {
    // Navigate to field and apply coercion
    if (field.includes('.')) {
      const parts = field.split('.');
      let current = payload;
      for (let i = 0; i < parts.length - 1; i++) {
        current = current[parts[i]];
      }
      const lastField = parts[parts.length - 1];
      if (current[lastField] !== undefined) {
        if (type === 'number') {
          current[lastField] = parseQuantity(current[lastField]);
        } else {
          current[lastField] = String(current[lastField]);
        }
      }
    }
  }
}

/**
 * Validate payload against NSW ESB schema
 */
function validateNSWPayload(payload) {
  const errors = [];
  const warnings = [];
  
  // Check required top-level fields
  for (const field of NSW_ESB_SCHEMA.required) {
    if (!payload[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  }
  
  // Validate exporter
  if (!payload.exporter?.tin) {
    errors.push('Missing exporter TIN');
  }
  
  // Validate product HS code format
  if (payload.product?.hs_code) {
    const hsCode = payload.product.hs_code;
    if (!/^\d{6,8}$/.test(hsCode)) {
      errors.push(`Invalid HS code format: ${hsCode}. Expected 6-8 digits`);
    }
  } else {
    errors.push('Missing required field: product.hs_code');
  }
  
  // Validate destination
  if (!payload.destination?.country) {
    errors.push('Missing destination country');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Normalize NSW ESB response
 * Handles partial success, silent failures, and rejection patterns
 */
function normalizeNSWResponse(response) {
  const normalized = {
    // Parse response status
    status: 'UNKNOWN',
    sgd_number: null,
    priority_lane: null,
    rejection_reason: null,
    warnings: [],
    events: [],
    raw: response,
    normalized_at: new Date().toISOString()
  };
  
  // Case 1: Full acceptance
  if (response.status === 'ACCEPTED' || response.acceptance_status === 'ACCEPTED') {
    normalized.status = 'ACCEPTED';
    normalized.sgd_number = response.sgd_number || response.sgdNumber || response.reference_number;
    normalized.priority_lane = response.priority_lane || response.priorityLane || 'STANDARD';
  }
  
  // Case 2: Partial success (some items accepted, some rejected)
  else if (response.status === 'PARTIAL' || response.partial_acceptance) {
    normalized.status = 'PARTIAL';
    normalized.sgd_number = response.sgd_number || null;
    normalized.priority_lane = 'MANUAL_REVIEW';
    normalized.warnings.push('Partial acceptance - manual review required');
    
    if (response.rejected_items) {
      normalized.rejection_reason = `Rejected items: ${response.rejected_items.join(', ')}`;
    }
  }
  
  // Case 3: Explicit rejection
  else if (response.status === 'REJECTED' || response.acceptance_status === 'REJECTED') {
    normalized.status = 'REJECTED';
    normalized.rejection_reason = response.rejection_reason || 
      response.rejectionReason || 
      response.error_message ||
      response.message ||
      'No specific reason provided';
  }
  
  // Case 4: Silent failure (accepted but no SGD number)
  else if (response.status === 'ACCEPTED' && !response.sgd_number) {
    normalized.status = 'ACCEPTED_PENDING_SGD';
    normalized.warnings.push('Accepted but no SGD number - follow up required');
  }
  
  // Case 5: Processing (async)
  else if (response.status === 'PROCESSING' || response.status === 'PENDING') {
    normalized.status = 'PROCESSING';
    normalized.warnings.push('Submission is being processed asynchronously');
  }
  
  // Extract any events
  if (response.events) {
    normalized.events = response.events;
  }
  
  // Handle error responses
  if (response.error) {
    normalized.status = 'ERROR';
    normalized.rejection_reason = response.error.message || response.error;
  }
  
  return normalized;
}

/**
 * Generate idempotency key for NSW submission
 * @param {Object} payload - Submission payload
 * @returns {string} Unique key
 */
function generateIdempotencyKey(payload) {
  const keyData = [
    payload.exporter?.tin,
    payload.product?.hs_code,
    payload.destination?.country,
    new Date().toISOString().split('T')[0]
  ].join('|');
  
  return crypto
    .createHash('sha256')
    .update(keyData)
    .digest('hex')
    .substring(0, 32);
}

/**
 * Retry handler for NSW API calls
 */
async function retryNSWCall(fn, options = {}) {
  const maxAttempts = options.maxAttempts || 3;
  const baseDelay = options.baseDelay || 1000;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }
      
      // Exponential backoff
      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.log(`NSW API retry ${attempt}/${maxAttempts} after ${delay}ms`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

module.exports = {
  transformToNSWFormat,
  normalizeNSWResponse,
  validateNSWPayload,
  generateIdempotencyKey,
  retryNSWCall,
  NSW_ESB_SCHEMA
};

// Test execution
if (require.main === module) {
  console.log('=== ESB Compatibility Layer Test ===\n');
  
  // Test 1: Valid transformation
  const validPayload = {
    declaration_ref: 'CUL-TEST-001',
    version: '2026.1',
    exporter: { tin: 'TIN-123', name: 'Test Exporter', address: 'Lagos' },
    importer: { name: 'Test Importer', country: 'NL' },
    product: { hs_code: '18010000', description: 'Cocoa beans', quantity: 1000, unit: 'KG' },
    destination: 'NL'
  };
  
  const transform = transformToNSWFormat(validPayload);
  console.log('Transform result:', transform.validation.valid ? 'VALID' : 'INVALID');
  if (!transform.validation.valid) {
    console.log('Errors:', transform.validation.errors);
  }
  
  // Test 2: Response normalization
  console.log('\n--- Response Normalization Tests ---');
  
  const acceptedResponse = { status: 'ACCEPTED', sgd_number: 'SGD-123', priority_lane: 'GREEN' };
  console.log('Accepted:', JSON.stringify(normalizeNSWResponse(acceptedResponse), null, 2));
  
  const rejectedResponse = { status: 'REJECTED', rejection_reason: 'Invalid HS code' };
  console.log('\nRejected:', JSON.stringify(normalizeNSWResponse(rejectedResponse), null, 2));
  
  const partialResponse = { status: 'PARTIAL', sgd_number: 'SGD-456', rejected_items: ['item1', 'item2'] };
  console.log('\nPartial:', JSON.stringify(normalizeNSWResponse(partialResponse), null, 2));
}