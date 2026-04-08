/**
 * Immutable Audit Logger with Hash Chaining
 * Provides tamper-proof audit trail for all system operations
 * Detects any attempt to alter historical records
 */

const crypto = require('crypto');
const { run, get, all } = require('../utils/db');

const INITIAL_HASH = '0'.repeat(64); // Genesis hash

/**
 * Initialize immutable audit log table
 */
async function initializeImmutableAudit() {
  await run(`
    CREATE TABLE IF NOT EXISTS ImmutableAuditLog (
      id INTEGER PRIMARY KEY,
      shipment_id TEXT,
      module TEXT NOT NULL,
      action TEXT NOT NULL,
      actor TEXT NOT NULL,
      outcome TEXT NOT NULL,
      details TEXT,
      previous_hash TEXT NOT NULL,
      current_hash TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Create index for fast lookups
  await run(`
    CREATE INDEX IF NOT EXISTS idx_audit_shipment ON ImmutableAuditLog(shipment_id)
  `);
  
  await run(`
    CREATE INDEX IF NOT EXISTS idx_audit_hash ON ImmutableAuditLog(current_hash)
  `);
  
  console.log('Immutable audit log initialized');
}

/**
 * Compute hash for audit entry
 */
function computeHash(id, shipmentId, module, action, actor, outcome, details, previousHash, timestamp) {
  const data = `${id}|${shipmentId || ''}|${module}|${action}|${actor}|${outcome}|${details || ''}|${previousHash}|${timestamp}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Log an immutable audit entry
 * @param {object} params - Audit entry parameters
 * @param {string} params.shipmentId - Shipment ID (optional)
 * @param {string} params.module - Module name
 * @param {string} params.action - Action performed
 * @param {string} params.actor - Actor (user/system/component)
 * @param {string} params.outcome - Outcome (SUCCESS/FAILURE/ERROR)
 * @param {object} params.details - Additional details
 * @returns {Promise<object>} - Created audit entry
 */
async function logImmutableAudit({ shipmentId, module, action, actor, outcome, details = {} }) {
  // Get last entry for hash chain
  const lastEntry = await get(
    `SELECT current_hash FROM ImmutableAuditLog ORDER BY id DESC LIMIT 1`
  );
  
  const previousHash = lastEntry ? lastEntry.current_hash : INITIAL_HASH;
  const timestamp = new Date().toISOString();
  
  // Get next ID
  const idResult = await get(`SELECT MAX(id) as max_id FROM ImmutableAuditLog`);
  const nextId = (idResult?.max_id || 0) + 1;
  
  // Compute hash
  const currentHash = computeHash(
    nextId,
    shipmentId,
    module,
    action,
    actor,
    outcome,
    JSON.stringify(details),
    previousHash,
    timestamp
  );
  
  // Insert entry
  await run(
    `INSERT INTO ImmutableAuditLog 
     (id, shipment_id, module, action, actor, outcome, details, previous_hash, current_hash, timestamp) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [nextId, shipmentId || null, module, action, actor, outcome, JSON.stringify(details), previousHash, currentHash, timestamp]
  );
  
  return {
    id: nextId,
    shipment_id: shipmentId,
    module,
    action,
    actor,
    outcome,
    details,
    previous_hash: previousHash,
    current_hash: currentHash,
    timestamp
  };
}

/**
 * Verify integrity of audit log
 * Recomputes all hashes and checks for tampering
 * @returns {Promise<object>} - Verification result
 */
async function verifyAuditIntegrity() {
  const entries = await all(
    `SELECT * FROM ImmutableAuditLog ORDER BY id ASC`
  );
  
  let previousHash = INITIAL_HASH;
  const violations = [];
  
  for (const entry of entries) {
    // Recompute hash
    const computedHash = computeHash(
      entry.id,
      entry.shipment_id,
      entry.module,
      entry.action,
      entry.actor,
      entry.outcome,
      entry.details,
      previousHash,
      entry.timestamp
    );
    
    // Check hash match
    if (computedHash !== entry.current_hash) {
      violations.push({
        id: entry.id,
        shipment_id: entry.shipment_id,
        module: entry.module,
        action: entry.action,
        expected_hash: computedHash,
        actual_hash: entry.current_hash,
        violation: 'HASH_MISMATCH'
      });
    }
    
    // Check chain linkage
    if (entry.previous_hash !== previousHash) {
      violations.push({
        id: entry.id,
        shipment_id: entry.shipment_id,
        expected_previous: previousHash,
        actual_previous: entry.previous_hash,
        violation: 'CHAIN_BROKEN'
      });
    }
    
    previousHash = entry.current_hash;
  }
  
  return {
    total_entries: entries.length,
    valid: violations.length === 0,
    violations,
    verified_at: new Date().toISOString()
  };
}

/**
 * Get audit entries for a shipment
 */
async function getAuditEntries(shipmentId, limit = 100) {
  return await all(
    `SELECT id, module, action, actor, outcome, details, current_hash, timestamp 
     FROM ImmutableAuditLog 
     WHERE shipment_id = ? 
     ORDER BY id DESC 
     LIMIT ?`,
    [shipmentId, limit]
  );
}

/**
 * Get audit chain for forensic analysis
 */
async function getAuditChain(startId = null, endId = null) {
  let query = `SELECT id, shipment_id, module, action, actor, outcome, previous_hash, current_hash, timestamp FROM ImmutableAuditLog`;
  const params = [];
  
  if (startId && endId) {
    query += ` WHERE id >= ? AND id <= ?`;
    params.push(startId, endId);
  } else if (startId) {
    query += ` WHERE id >= ?`;
    params.push(startId);
  }
  
  query += ` ORDER BY id ASC`;
  
  return await all(query, params);
}

/**
 * Export audit log as tamper-evident report
 */
async function exportAuditReport(shipmentId = null) {
  const integrity = await verifyAuditIntegrity();
  
  let entries;
  if (shipmentId) {
    entries = await getAuditEntries(shipmentId, 10000);
  } else {
    entries = await all(
      `SELECT * FROM ImmutableAuditLog ORDER BY id DESC LIMIT 10000`
    );
  }
  
  const report = {
    generated_at: new Date().toISOString(),
    shipment_id: shipmentId || 'ALL',
    total_entries: entries.length,
    integrity_check: integrity,
    entries: entries.map(e => ({
      id: e.id,
      shipment_id: e.shipment_id,
      module: e.module,
      action: e.action,
      actor: e.actor,
      outcome: e.outcome,
      details: e.details,
      hash: e.current_hash,
      timestamp: e.timestamp
    })),
    // Include final hash for verification
    final_hash: entries.length > 0 ? entries[entries.length - 1].current_hash : INITIAL_HASH
  };
  
  return report;
}

// Initialize on module load
initializeImmutableAudit().catch(console.error);

module.exports = {
  INITIAL_HASH,
  initializeImmutableAudit,
  logImmutableAudit,
  verifyAuditIntegrity,
  getAuditEntries,
  getAuditChain,
  exportAuditReport,
  computeHash
};