/**
 * Signature Trust Architecture - Immutable, Traceable, One-Time-Use Signatures
 * 
 * Features:
 * - Bind signature to payload_hash + timestamp + nonce + system_version
 * - Trust store with CA list + revoked certs
 * - Signature expiry window (5 minutes)
 * - Post-signature immutable lock enforced
 */

const crypto = require('crypto');
const { run, get, all } = require('./utils/db');

const SYSTEM_VERSION = '2026.1';
const SIGNATURE_EXPIRY_SECONDS = 300; // 5 minutes

/**
 * Initialize signature trust tables
 */
async function initializeSignatureTables() {
  // Trust store for CA certificates
  await run(`
    CREATE TABLE IF NOT EXISTS CertificateAuthorityStore (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ca_name TEXT NOT NULL,
      certificate_serial TEXT NOT NULL UNIQUE,
      public_key TEXT NOT NULL,
      valid_from DATE,
      valid_to DATE,
      revoked INTEGER DEFAULT 0,
      revoked_at DATETIME,
      revocation_reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Signature records with binding
  await run(`
    CREATE TABLE IF NOT EXISTS SignatureRecords (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shipment_id TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      signature TEXT NOT NULL,
      signer_identity TEXT NOT NULL,
      nonce TEXT NOT NULL UNIQUE,
      timestamp INTEGER NOT NULL,
      system_version TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      used INTEGER DEFAULT 0,
      used_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(shipment_id)
    )
  `);
  
  // Immutability locks
  await run(`
    CREATE TABLE IF NOT EXISTS ImmutabilityLocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shipment_id TEXT NOT NULL UNIQUE,
      locked_at DATETIME NOT NULL,
      lock_hash TEXT NOT NULL,
      reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  console.log('Signature trust tables initialized');
}

/**
 * Generate cryptographically secure nonce
 */
function generateNonce() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Create bound signature
 */
async function createBoundSignature(shipmentId, payload, signerIdentity, certificateSerial) {
  // Generate nonce and timestamp
  const nonce = generateNonce();
  const timestamp = Math.floor(Date.now() / 1000);
  const expiresAt = new Date((timestamp + SIGNATURE_EXPIRY_SECONDS) * 1000).toISOString();
  
  // Compute payload hash
  const payloadHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('base64');
  
  // Create binding data
  const bindingData = {
    payload_hash: payloadHash,
    timestamp,
    nonce,
    system_version: SYSTEM_VERSION
  };
  
  // Sign the binding (in production, use PKI)
  const signature = signWithPrivateKey(JSON.stringify(bindingData));
  
  // Store signature record
  await run(
    `INSERT INTO SignatureRecords 
     (shipment_id, payload_hash, signature, signer_identity, nonce, timestamp, system_version, expires_at) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [shipmentId, payloadHash, signature, signerIdentity, nonce, timestamp, SYSTEM_VERSION, expiresAt]
  );
  
  return {
    valid: true,
    signature,
    nonce,
    timestamp,
    expires_at: expiresAt,
    binding: bindingData
  };
}

/**
 * Verify bound signature
 */
async function verifyBoundSignature(shipmentId, providedSignature) {
  // Get signature record
  const record = await get(
    `SELECT * FROM SignatureRecords WHERE shipment_id = ? AND used = 0 ORDER BY created_at DESC LIMIT 1`,
    [shipmentId]
  );
  
  if (!record) {
    return { valid: false, error: 'NO_SIGNATURE_FOUND' };
  }
  
  // Check expiry
  if (new Date(record.expires_at) < new Date()) {
    return { valid: false, error: 'SIGNATURE_EXPIRED', expired_at: record.expires_at };
  }
  
  // Verify signature matches
  if (providedSignature !== record.signature) {
    return { valid: false, error: 'SIGNATURE_MISMATCH' };
  }
  
  // Check nonce hasn't been used (replay protection)
  const nonceUsed = await get(
    `SELECT * FROM SignatureRecords WHERE nonce = ? AND used = 1`,
    [record.nonce]
  );
  
  if (nonceUsed) {
    return { valid: false, error: 'NONCE_ALREADY_USED' };
  }
  
  return {
    valid: true,
    binding: {
      payload_hash: record.payload_hash,
      timestamp: record.timestamp,
      nonce: record.nonce,
      system_version: record.system_version
    },
    signer_identity: record.signer_identity
  };
}

/**
 * Mark signature as used (prevents replay)
 */
async function markSignatureUsed(shipmentId) {
  await run(
    `UPDATE SignatureRecords SET used = 1, used_at = ? WHERE shipment_id = ? AND used = 0`,
    [new Date().toISOString(), shipmentId]
  );
}

/**
 * Sign data with private key (simplified - production would use PKI)
 */
function signWithPrivateKey(data) {
  // In production, this would use actual private key
  const crypto = require('crypto');
  const key = crypto.createPrivateKey(process.env.PRIVATE_KEY || 'culbridge-private-key-2024');
  return crypto.sign('sha256', Buffer.from(data), key).toString('base64');
}

/**
 * Enforce immutability lock after signature
 */
async function lockImmutability(shipmentId) {
  // Get current payload hash
  const declaration = await get(
    `SELECT payload FROM CleanDeclarationResults WHERE shipment_id = ? ORDER BY id DESC LIMIT 1`,
    [shipmentId]
  );
  
  if (!declaration) {
    return { valid: false, error: 'NO_DECLARATION_FOUND' };
  }
  
  const lockHash = crypto
    .createHash('sha256')
    .update(declaration.payload)
    .digest('hex');
  
  await run(
    `INSERT OR REPLACE INTO ImmutabilityLocks (shipment_id, locked_at, lock_hash, reason) VALUES (?, ?, ?, ?)`,
    [shipmentId, new Date().toISOString(), lockHash, 'SIGNED']
  );
  
  // Prevent future modifications
  await run(
    `UPDATE CleanDeclarationResults SET immutable = 1 WHERE shipment_id = ?`,
    [shipmentId]
  );
  
  return { valid: true, locked: true, lock_hash: lockHash };
}

/**
 * Verify immutability lock (detect post-signature mutations)
 */
async function verifyImmutability(shipmentId) {
  const lock = await get(
    `SELECT * FROM ImmutabilityLocks WHERE shipment_id = ?`,
    [shipmentId]
  );
  
  if (!lock) {
    return { valid: false, error: 'NO_LOCK_FOUND' };
  }
  
  // Get current payload hash
  const declaration = await get(
    `SELECT payload FROM CleanDeclarationResults WHERE shipment_id = ? ORDER BY id DESC LIMIT 1`,
    [shipmentId]
  );
  
  if (!declaration) {
    return { valid: false, error: 'NO_DECLARATION_FOUND' };
  }
  
  const currentHash = crypto
    .createHash('sha256')
    .update(declaration.payload)
    .digest('hex');
  
  if (currentHash !== lock.lock_hash) {
    return { 
      valid: false, 
      error: 'PAYLOAD_MUTATED',
      original_hash: lock.lock_hash,
      current_hash: currentHash,
      locked_at: lock.locked_at
    };
  }
  
  return { 
    valid: true, 
    locked: true, 
    locked_at: lock.locked_at,
    unchanged: true
  };
}

/**
 * Add CA to trust store
 */
async function addCA(caName, serial, publicKey, validFrom, validTo) {
  await run(
    `INSERT INTO CertificateAuthorityStore (ca_name, certificate_serial, public_key, valid_from, valid_to) VALUES (?, ?, ?, ?, ?)`,
    [caName, serial, publicKey, validFrom, validTo]
  );
  
  return { added: true, ca: caName };
}

/**
 * Revoke CA certificate
 */
async function revokeCA(serial, reason) {
  await run(
    `UPDATE CertificateAuthorityStore SET revoked = 1, revoked_at = ?, revocation_reason = ? WHERE certificate_serial = ?`,
    [new Date().toISOString(), reason, serial]
  );
  
  return { revoked: true, serial };
}

/**
 * Verify CA is trusted and not revoked
 */
async function verifyCA(certificateSerial) {
  const ca = await get(
    `SELECT * FROM CertificateAuthorityStore WHERE certificate_serial = ?`,
    [certificateSerial]
  );
  
  if (!ca) {
    return { valid: false, error: 'CA_NOT_IN_TRUST_STORE' };
  }
  
  if (ca.revoked) {
    return { valid: false, error: 'CA_REVOKED', reason: ca.revocation_reason };
  }
  
  // Check validity period
  const now = new Date();
  if (now < new Date(ca.valid_from) || now > new Date(ca.valid_to)) {
    return { valid: false, error: 'CA_EXPIRED' };
  }
  
  return { valid: true, ca: ca.ca_name };
}

/**
 * Validate full signature chain
 */
async function validateSignatureChain(shipmentId, providedSignature, signerCertificateSerial) {
  // 1. Verify CA trust
  const caVerified = await verifyCA(signerCertificateSerial);
  if (!caVerified.valid) {
    return { valid: false, error: caVerified.error };
  }
  
  // 2. Verify signature binding
  const sigVerified = await verifyBoundSignature(shipmentId, providedSignature);
  if (!sigVerified.valid) {
    return { valid: false, error: sigVerified.error };
  }
  
  // 3. Verify immutability (no mutation after signing)
  const immutVerified = await verifyImmutability(shipmentId);
  if (!immutVerified.valid) {
    return { valid: false, error: immutVerified.error };
  }
  
  return {
    valid: true,
    signer_identity: sigVerified.signer_identity,
    ca: caVerified.ca,
    bound_at: new Date(sigVerified.binding.timestamp * 1000).toISOString(),
    locked: immutVerified.locked
  };
}

// Auto-initialize
initializeSignatureTables().catch(console.error);

module.exports = {
  SYSTEM_VERSION,
  SIGNATURE_EXPIRY_SECONDS,
  initializeSignatureTables,
  generateNonce,
  createBoundSignature,
  verifyBoundSignature,
  markSignatureUsed,
  lockImmutability,
  verifyImmutability,
  addCA,
  revokeCA,
  verifyCA,
  validateSignatureChain
};