/**
 * Security Middleware - HMAC + Nonce + Timestamp Validation
 * Prevents tampering, replay attacks, and ensures request integrity
 */

const crypto = require('crypto');
const { get, run } = require('../utils/db');

const HMAC_SECRET = process.env.HMAC_SECRET || 'culbridge_hmac_secret';
const SIGNATURE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

/**
 * Validate HMAC signature with nonce and timestamp
 */
async function validateHMAC(req, res, next) {
  const { signature, timestamp, nonce } = req.headers;
  
  // Check required headers
  if (!signature || !timestamp || !nonce) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing signature, timestamp, or nonce headers'
    });
  }
  
  const timestampNum = parseInt(timestamp, 10);
  
  // Check timestamp TTL (prevent replay)
  if (isNaN(timestampNum) || Date.now() - timestampNum > SIGNATURE_TTL) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Signature expired or timestamp invalid'
    });
  }
  
  try {
    // Check nonce uniqueness in database
    const existingNonce = await get(
      `SELECT id FROM HMACNonces WHERE nonce = ? AND used_at > datetime('now', '-5 minutes')`,
      [nonce]
    );
    
    if (existingNonce) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Nonce already used'
      });
    }
    
    // Build payload to verify
    const payload = req.method === 'GET' 
      ? JSON.stringify(req.query) 
      : JSON.stringify(req.body);
    
    // Verify HMAC
    const signatureData = `${timestamp}:${nonce}:${req.method}:${req.originalUrl}:${payload}`;
    const expectedSignature = crypto
      .createHmac('sha256', HMAC_SECRET)
      .update(signatureData)
      .digest('hex');
    
    if (signature !== expectedSignature) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid signature'
      });
    }
    
    // Store nonce to prevent reuse
    await run(
      `INSERT INTO HMACNonces (nonce, used_at) VALUES (?, datetime('now'))`,
      [nonce]
    );
    
    next();
  } catch (error) {
    console.error('HMAC validation error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Signature validation failed'
    });
  }
}

/**
 * Generate HMAC signature for client
 */
function generateSignature(method, url, body = {}) {
  const timestamp = Date.now();
  const nonce = crypto.randomBytes(16).toString('hex');
  const payload = JSON.stringify(body);
  
  const signatureData = `${timestamp}:${nonce}:${method}:${url}:${payload}`;
  const signature = crypto
    .createHmac('sha256', HMAC_SECRET)
    .update(signatureData)
    .digest('hex');
  
  return {
    signature,
    timestamp,
    nonce
  };
}

/**
 * Clean up expired nonces (call periodically)
 */
async function cleanupExpiredNonces() {
  const result = await run(
    `DELETE FROM HMACNonces WHERE used_at < datetime('now', '-5 minutes')`
  );
  console.log(`Cleaned up ${result.changes} expired HMAC nonces`);
}

module.exports = {
  validateHMAC,
  generateSignature,
  cleanupExpiredNonces,
  SIGNATURE_TTL
};