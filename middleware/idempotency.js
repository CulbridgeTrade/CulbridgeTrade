/**
 * Idempotency Middleware
 * Ensures exactly-once processing for every shipment operation
 * Addresses: CONC-IDEMP-01 from Dev Execution Checklist
 */

const crypto = require('crypto');
const { get, run } = require('../utils/db');

// In-memory cache (use Redis in production)
const idempotencyCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Generate idempotency key from request
 */
function generateIdempotencyKey(req) {
  // Key components: shipment_id + operation + body_hash
  const shipmentId = req.body?.shipment_id || req.params?.shipment_id || '';
  const operation = req.method + ':' + req.path;
  const bodyHash = req.body ? crypto.createHash('sha256').update(JSON.stringify(req.body)).digest('hex').substring(0, 16) : '';
  
  return crypto
    .createHash('sha256')
    .update(`${shipmentId}:${operation}:${bodyHash}`)
    .digest('hex');
}

/**
 * Check idempotency - returns existing result if already processed
 */
async function checkIdempotency(req, res, next) {
  const idempotencyKey = req.headers['idempotency-key'] || generateIdempotencyKey(req);
  
  // Check cache first
  const cached = idempotencyCache.get(idempotencyKey);
  if (cached) {
    if (Date.now() - cached.timestamp > CACHE_TTL) {
      // Expired - remove and continue
      idempotencyCache.delete(idempotencyKey);
    } else if (cached.response) {
      // Return cached response
      return res.status(cached.status).json(cached.response);
    }
  }
  
  // Check database for persistent idempotency
  const existing = await get(
    `SELECT response, status_code FROM IdempotencyKeys 
     WHERE idempotency_key = ? AND created_at > datetime('now', '-24 hours')`,
    [idempotencyKey]
  );
  
  if (existing && existing.response) {
    const response = JSON.parse(existing.response);
    // Store in cache for faster lookup
    idempotencyCache.set(idempotencyKey, {
      timestamp: Date.now(),
      status: existing.status_code,
      response
    });
    return res.status(existing.status_code).json(response);
  }
  
  // Store key for later response capture
  req.idempotencyKey = idempotencyKey;
  next();
}

/**
 * Store idempotent result after processing
 */
async function storeIdempotentResult(req, statusCode, response) {
  if (!req.idempotencyKey) return;
  
  // Store in memory cache
  idempotencyCache.set(req.idempotencyKey, {
    timestamp: Date.now(),
    status: statusCode,
    response
  });
  
  // Store in database for persistence
  await run(
    `INSERT OR REPLACE INTO IdempotencyKeys (idempotency_key, response, status_code, created_at) 
     VALUES (?, ?, ?, datetime('now'))`,
    [req.idempotencyKey, JSON.stringify(response), statusCode]
  );
  
  // Schedule cleanup (in production, use Redis TTL)
  setTimeout(() => {
    idempotencyCache.delete(req.idempotencyKey);
  }, CACHE_TTL);
}

/**
 * Middleware wrapper for Express route handlers
 * Automatically captures and stores responses
 */
function withIdempotency(handler) {
  return async (req, res, next) => {
    try {
      // Override json method to capture response
      const originalJson = res.json.bind(res);
      res.json = function(data) {
        // Store result asynchronously (don't block response)
        storeIdempotentResult(req, res.statusCode, data).catch(console.error);
        return originalJson(data);
      };
      
      await handler(req, res, next);
    } catch (error) {
      // Store error response too
      const errorResponse = { error: error.message || 'Internal Error' };
      await storeIdempotentResult(req, res.statusCode || 500, errorResponse);
      throw error;
    }
  };
}

/**
 * Initialize idempotency table
 */
async function initializeIdempotencyTable() {
  await run(`
    CREATE TABLE IF NOT EXISTS IdempotencyKeys (
      idempotency_key TEXT PRIMARY KEY,
      response TEXT,
      status_code INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Index for cleanup queries
  await run(`
    CREATE INDEX IF NOT EXISTS idx_idempotency_created 
    ON IdempotencyKeys(created_at)
  `);
  
  console.log('Idempotency table initialized');
}

/**
 * Clean up old idempotency keys
 */
async function cleanupExpiredKeys() {
  const result = await run(
    `DELETE FROM IdempotencyKeys WHERE created_at < datetime('now', '-24 hours')`
  );
  console.log(`Cleaned up ${result.changes} expired idempotency keys`);
}

// Initialize on load
initializeIdempotencyTable().catch(console.error);

// Start periodic cleanup (every hour)
setInterval(cleanupExpiredKeys, 60 * 60 * 1000);

module.exports = {
  generateIdempotencyKey,
  checkIdempotency,
  storeIdempotentResult,
  withIdempotency,
  initializeIdempotencyTable,
  cleanupExpiredKeys,
  CACHE_TTL
};