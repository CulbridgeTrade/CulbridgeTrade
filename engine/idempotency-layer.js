/**
 * DB Idempotency Layer - Exactly-Once Execution
 * 
 * Prevents duplicate submissions via UNIQUE constraints and execution ledger.
 * One shipment → one financial path → one submission.
 * 
 * Tables:
 * - ExecutionLedger: Tracks all operations per shipment
 * - IdempotencyKeys: Stores idempotency keys for API calls
 */

const { run, get, all } = require('./utils/db');

/**
 * Initialize idempotency tables
 */
async function initializeIdempotencyTables() {
  // Execution ledger - tracks all operations
  await run(`
    CREATE TABLE IF NOT EXISTS ExecutionLedger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shipment_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      execution_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'STARTED',
      input_hash TEXT,
      output_hash TEXT,
      error_message TEXT,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      UNIQUE(shipment_id, operation)
    )
  `);
  
  // Idempotency keys for external calls
  await run(`
    CREATE TABLE IF NOT EXISTS IdempotencyKeys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      idempotency_key TEXT NOT NULL UNIQUE,
      shipment_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      result TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME
    )
  `);
  
  // Add UNIQUE constraint at DB level for NSW submissions
  // Note: SQLite doesn't support partial unique constraints easily,
  // so we handle this at application level
  
  console.log('Idempotency tables initialized');
}

/**
 * Start an operation (check if already running/completed)
 */
async function startOperation(shipmentId, operation, inputData = {}) {
  const inputHash = hashData(inputData);
  const executionId = `${shipmentId}-${operation}-${Date.now()}`;
  
  // Check if operation already completed for this shipment
  const existing = await get(
    `SELECT * FROM ExecutionLedger WHERE shipment_id = ? AND operation = ? AND status = 'COMPLETED'`,
    [shipmentId, operation]
  );
  
  if (existing) {
    // Operation already completed - return cached result
    return {
      idempotent: true,
      already_completed: true,
      status: 'COMPLETED',
      output: existing.output_hash ? JSON.parse(existing.output_hash) : null,
      message: `Operation ${operation} already completed for shipment ${shipmentId}`
    };
  }
  
  // Check if operation is currently running (prevent parallel execution)
  const running = await get(
    `SELECT * FROM ExecutionLedger WHERE shipment_id = ? AND operation = ? AND status = 'STARTED'`,
    [shipmentId, operation]
  );
  
  if (running) {
    // Operation in progress - prevent duplicate
    return {
      idempotent: false,
      already_running: true,
      status: 'STARTED',
      message: `Operation ${operation} already in progress for shipment ${shipmentId}`,
      execution_id: running.execution_id
    };
  }
  
  // Start new operation
  await run(
    `INSERT INTO ExecutionLedger (shipment_id, operation, execution_id, status, input_hash) VALUES (?, ?, ?, ?, ?)`,
    [shipmentId, operation, executionId, 'STARTED', inputHash]
  );
  
  return {
    idempotent: true,
    started: true,
    execution_id: executionId,
    status: 'STARTED'
  };
}

/**
 * Complete an operation (mark as done)
 */
async function completeOperation(shipmentId, operation, outputData = {}, error = null) {
  const outputHash = error ? null : hashData(outputData);
  const status = error ? 'FAILED' : 'COMPLETED';
  
  await run(
    `UPDATE ExecutionLedger SET 
      status = ?, 
      output_hash = ?, 
      error_message = ?,
      completed_at = ?
    WHERE shipment_id = ? AND operation = ? AND status = 'STARTED'`,
    [status, outputHash, error, new Date().toISOString(), shipmentId, operation]
  );
  
  return {
    status,
    completed: true,
    output: outputData
  };
}

/**
 * Check if operation can proceed (for concurrency control)
 */
async function canExecuteOperation(shipmentId, operation) {
  const result = await startOperation(shipmentId, operation, {});
  
  if (result.already_completed) {
    return { allowed: false, reason: 'ALREADY_COMPLETED', result };
  }
  
  if (result.already_running) {
    return { allowed: false, reason: 'ALREADY_RUNNING', result };
  }
  
  return { allowed: true, execution_id: result.execution_id };
}

/**
 * Store idempotency key for external API calls
 */
async function storeIdempotencyKey(key, shipmentId, operation, result = null, ttlMinutes = 60) {
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();
  
  await run(
    `INSERT OR REPLACE INTO IdempotencyKeys (idempotency_key, shipment_id, operation, result, expires_at) VALUES (?, ?, ?, ?, ?)`,
    [key, shipmentId, operation, result ? JSON.stringify(result) : null, expiresAt]
  );
}

/**
 * Check idempotency key (for webhook deduplication)
 */
async function checkIdempotencyKey(key) {
  const existing = await get(
    `SELECT * FROM IdempotencyKeys WHERE idempotency_key = ? AND expires_at > ?`,
    [key, new Date().toISOString()]
  );
  
  if (existing) {
    return {
      idempotent: true,
      exists: true,
      result: existing.result ? JSON.parse(existing.result) : null,
      shipment_id: existing.shipment_id
    };
  }
  
  return { idempotent: false, exists: false };
}

/**
 * Generate idempotency key for NSW submission
 */
function generateNSWIdempotencyKey(shipmentId, payload) {
  const crypto = require('crypto');
  const keyData = [
    shipmentId,
    payload.product?.hs_code,
    payload.exporter?.tin,
    payload.destination,
    new Date().toISOString().split('T')[0] // Date only
  ].join('|');
  
  return crypto.createHash('sha256').update(keyData).digest('hex').substring(0, 32);
}

/**
 * Generate idempotency key for webhook
 */
function generateWebhookIdempotencyKey(shipmentId, eventType, eventData) {
  const crypto = require('crypto');
  const keyData = [
    shipmentId,
    eventType,
    eventData?.status,
    eventData?.timestamp || new Date().toISOString().split('T')[0]
  ].join('|');
  
  return crypto.createHash('sha256').update(keyData).digest('hex').substring(0, 32);
}

/**
 * Hash data for comparison
 */
function hashData(data) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

/**
 * Get execution status for a shipment
 */
async function getExecutionStatus(shipmentId) {
  const operations = await all(
    `SELECT operation, status, started_at, completed_at FROM ExecutionLedger WHERE shipment_id = ? ORDER BY started_at`,
    [shipmentId]
  );
  
  return {
    shipment_id: shipmentId,
    operations,
    has_pending: operations.some(o => o.status === 'STARTED'),
    has_failed: operations.some(o => o.status === 'FAILED'),
    completed_operations: operations.filter(o => o.status === 'COMPLETED').map(o => o.operation)
  };
}

/**
 * Reset failed operation (for manual retry)
 */
async function resetOperation(shipmentId, operation) {
  const result = await run(
    `DELETE FROM ExecutionLedger WHERE shipment_id = ? AND operation = ? AND status = 'FAILED'`,
    [shipmentId, operation]
  );
  
  return { reset: result.changes > 0 };
}

/**
 * Cleanup expired idempotency keys
 */
async function cleanupExpiredKeys() {
  const result = await run(
    `DELETE FROM IdempotencyKeys WHERE expires_at < ?`,
    [new Date().toISOString()]
  );
  
  console.log(`Cleaned up ${result.changes} expired idempotency keys`);
  return { cleaned: result.changes };
}

// Auto-initialize
initializeIdempotencyTables().catch(console.error);

module.exports = {
  initializeIdempotencyTables,
  startOperation,
  completeOperation,
  canExecuteOperation,
  storeIdempotencyKey,
  checkIdempotencyKey,
  generateNSWIdempotencyKey,
  generateWebhookIdempotencyKey,
  getExecutionStatus,
  resetOperation,
  cleanupExpiredKeys
};