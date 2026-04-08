/**
 * MFA Enforcement Module
 * 
 * Multi-Factor Authentication for high-privilege users (admin, auditor)
 */

const crypto = require('crypto');

// In production, use Redis or database
const mfaStore = new Map();

/**
 * Generate MFA secret for user
 */
function generateMFASecret(userId) {
  const secret = crypto.randomBytes(20).toString('hex');
  const secretBase32 = base32Encode(secret);
  
  mfaStore.set(userId, {
    secret: secretBase32,
    enabled: false,
    createdAt: new Date().toISOString(),
    lastVerified: null
  });
  
  return {
    secret: secretBase32,
    otpauthUrl: `otpauth://totp/Culbridge:${userId}?secret=${secretBase32}&issuer=Culbridge`
  };
}

/**
 * Verify MFA token
 */
function verifyMFAToken(userId, token) {
  const mfaData = mfaStore.get(userId);
  if (!mfaData || !mfaData.enabled) {
    return { valid: false, reason: 'MFA not enabled' };
  }
  
  // Simple TOTP verification (in production use speakeasy or similar)
  const currentToken = generateCurrentToken(mfaData.secret);
  const valid = token === currentToken;
  
  if (valid) {
    mfaData.lastVerified = new Date().toISOString();
    mfaStore.set(userId, mfaData);
  }
  
  return { valid, reason: valid ? 'MFA verified' : 'Invalid token' };
}

/**
 * Enable MFA for user
 */
function enableMFA(userId, token) {
  const verification = verifyMFAToken(userId, token);
  
  if (!verification.valid) {
    return { success: false, reason: verification.reason };
  }
  
  const mfaData = mfaStore.get(userId);
  if (mfaData) {
    mfaData.enabled = true;
    mfaStore.set(userId, mfaData);
  }
  
  return { success: true, reason: 'MFA enabled' };
}

/**
 * Disable MFA for user
 */
function disableMFA(userId) {
  const mfaData = mfaStore.get(userId);
  if (mfaData) {
    mfaData.enabled = false;
    mfaStore.set(userId, mfaData);
    return { success: true };
  }
  return { success: false, reason: 'MFA not found' };
}

/**
 * Enforce MFA for high-privilege roles
 */
function enforceMFA(user) {
  const highPrivilegeRoles = ['ADMIN', 'AUDITOR', 'COMPLIANCE_OFFICER'];
  
  if (!highPrivilegeRoles.includes(user.role)) {
    return { enforced: false, reason: 'MFA not required for this role' };
  }
  
  const mfaData = mfaStore.get(user.id);
  if (!mfaData || !mfaData.enabled) {
    return { 
      enforced: true, 
      blocked: true, 
      reason: 'BLOCKER: MFA required for admin/auditor roles' 
    };
  }
  
  return { enforced: true, blocked: false };
}

// Helper: Simple Base32 encoding
function base32Encode(buffer) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  
  for (const byte of buffer) {
    bits += byte.toString(2).padStart(8, '0');
  }
  
  let result = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    const chunk = bits.substring(i, i + 5);
    result += alphabet[parseInt(chunk, 2)];
  }
  
  return result;
}

// Helper: Generate current 30-second token (simplified)
function generateCurrentToken(secret) {
  const time = Math.floor(Date.now() / 30000);
  return time.toString().padStart(6, '0');
}

module.exports = {
  generateMFASecret,
  verifyMFAToken,
  enableMFA,
  disableMFA,
  enforceMFA
};