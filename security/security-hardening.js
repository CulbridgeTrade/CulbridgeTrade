/**
 * Security Hardening Module
 * 
 * Enhances authentication and authorization:
 * 1. MFA enforcement for admin/auditor roles
 * 2. RBAC enforcement for sensitive actions
 * 3. Brute-force protection
 * 4. Audit logging
 * 
 * Version: 1.0
 */

const crypto = require('crypto');
const authAudit = require('./auth-audit');

// =====================================================
// MFA CONFIGURATION
// =====================================================

// Roles that require MFA
const MFA_REQUIRED_ROLES = ['admin', 'ADMIN', 'auditor', 'AUDITOR'];

// MFA storage (in production, use database)
const mfaStore = new Map();

/**
 * Generate MFA secret for user
 */
function generateMFASecret(userId) {
  const secret = crypto.randomBytes(20).toString('hex');
  const backupCodes = Array.from({ length: 8 }, () => 
    crypto.randomBytes(4).toString('hex').toUpperCase()
  );
  
  mfaStore.set(userId, {
    secret,
    backupCodes: [...backupCodes], // Make a copy
    enabled: false,
    enabledAt: null,
    lastUsed: null
  });
  
  return { secret, backupCodes };
}

/**
 * Enable MFA for user
 */
function enableMFA(userId, userRole) {
  // Get or create MFA record
  let record = mfaStore.get(userId);
  if (!record) {
    const { secret, backupCodes } = generateMFASecret(userId);
    record = { secret, backupCodes: [...backupCodes], enabled: false, enabledAt: null, lastUsed: null };
    mfaStore.set(userId, record);
  }
  
  // Check if role requires MFA
  const mfaRequired = MFA_REQUIRED_ROLES.includes(userRole);
  
  // Always enable MFA if not already enabled
  if (!record.enabled) {
    record.enabled = true;
    record.enabledAt = new Date().toISOString();
    mfaStore.set(userId, record);
    
    // Audit log
    authAudit.logMFAChange(userId, true, userId);
    
    if (mfaRequired) {
      return { 
        required: true, 
        mustEnable: false,
        message: 'MFA enabled successfully (required for role)' 
      };
    }
  }
  
  return { required: mfaRequired, mustEnable: false, message: 'MFA already enabled' };
}

/**
 * Validate MFA token (TOTP simulation)
 */
function validateMFAToken(userId, token) {
  const record = mfaStore.get(userId);
  if (!record) {
    return { valid: false, reason: 'MFA not configured' };
  }
  if (!record.enabled) {
    return { valid: false, reason: 'MFA not enabled' };
  }
  
  // Check backup codes first
  const backupIndex = record.backupCodes.indexOf(token.toUpperCase());
  if (backupIndex >= 0) {
    // Use and remove backup code
    record.backupCodes.splice(backupIndex, 1);
    mfaStore.set(userId, record);
    record.lastUsed = new Date().toISOString();
    return { valid: true, method: 'backup' };
  }
  
  // In production, validate TOTP using speakeasy or similar
  // For now, accept any 6-digit code as valid for testing
  if (/^\d{6}$/.test(token)) {
    record.lastUsed = new Date().toISOString();
    mfaStore.set(userId, record);
    return { valid: true, method: 'totp' };
  }
  
  return { valid: false, reason: 'Invalid token' };
}

/**
 * Enforce MFA for user based on role
 */
function enforceMFA(user) {
  // If user doesn't have a role, allow
  if (!user.role) {
    return { allowed: true };
  }
  
  // Check if MFA required for role
  if (MFA_REQUIRED_ROLES.includes(user.role)) {
    const record = mfaStore.get(user.id);
    if (!record || !record.enabled) {
      // Log the blocked attempt
      authAudit.logAuthEvent({
        userId: user.id,
        action: 'mfa_required_but_not_enabled',
        targetResource: user.role,
        newValue: 'BLOCKED'
      });
      
      return { 
        allowed: false, 
        error: 'BLOCKER: MFA required for admin/auditor roles',
        code: 'MFA_REQUIRED'
      };
    }
  }
  
  return { allowed: true };
}

/**
 * Get MFA status for user
 */
function getMFAStatus(userId) {
  const record = mfaStore.get(userId);
  if (!record) {
    return { enabled: false };
  }
  
  return {
    enabled: record.enabled,
    enabledAt: record.enabledAt,
    lastUsed: record.lastUsed,
    backupCodesRemaining: record.backupCodes.length
  };
}

// =====================================================
// RBAC ENFORCEMENT FOR SENSITIVE ACTIONS
// =====================================================

// Sensitive resources that require explicit permission
const SENSITIVE_ACTIONS = {
  'labs:create': ['admin', 'compliance_officer'],
  'labs:write': ['admin', 'compliance_officer'],
  'labs:delete': ['admin'],
  'documents:upload': ['admin', 'exporter', 'compliance_officer'],
  'documents:delete': ['admin'],
  'rules:write': ['admin'],
  'rules:delete': ['admin'],
  'shipments:status_change': ['admin', 'compliance_officer'],
  'shipments:delete': ['admin'],
  'users:write': ['admin'],
  'users:delete': ['admin'],
  'settings:write': ['admin']
};

/**
 * Check permission with RBAC enforcement
 * Mandatory checks before lab/document uploads or rule changes
 */
function checkPermission(user, action, resource) {
  // First check basic permission from auth middleware
  if (!user.permissions || !user.permissions.includes(`${resource}:${action}`)) {
    // Log unauthorized attempt
    authAudit.logUnauthorizedAttempt(user.id, action, resource, null);
    
    return { 
      allowed: false, 
      error: `BLOCKER: User ${user.id} cannot perform ${action} on ${resource}`,
      code: 'RBAC_DENIED'
    };
  }
  
  // Additional check for sensitive actions
  const sensitiveKey = `${resource}:${action}`;
  if (SENSITIVE_ACTIONS[sensitiveKey]) {
    const allowedRoles = SENSITIVE_ACTIONS[sensitiveKey];
    if (!allowedRoles.includes(user.role)) {
      authAudit.logUnauthorizedAttempt(user.id, action, resource, 'role_restricted');
      
      return {
        allowed: false,
        error: `BLOCKER: ${action} on ${resource} requires specific role`,
        code: 'ROLE_RESTRICTED'
      };
    }
  }
  
  // Log successful sensitive action authorization
  authAudit.logSensitiveAction(user.id, action, resource, null, 'authorized', null);
  
  return { allowed: true };
}

/**
 * Enforce RBAC on sensitive engine actions
 */
function enforceRBAC(action, resource) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    const check = checkPermission(req.user, action, resource);
    if (!check.allowed) {
      console.error(`[RBAC BLOCKED] User: ${req.user.id}, Action: ${action}, Resource: ${resource}`);
      return res.status(403).json({ 
        error: check.error,
        code: check.code
      });
    }
    
    next();
  };
}

// =====================================================
// BRUTE-FORCE PROTECTION
// =====================================================

const failedLoginAttempts = new Map();
const BRUTE_FORCE_CONFIG = {
  maxAttempts: 5,        // Lock after 5 failed attempts
  lockoutDuration: 300000, // 5 minutes
  trackingWindow: 900000  // 15 minutes
};

/**
 * Record failed login attempt
 */
function recordFailedLogin(email, ip) {
  const key = `login:${email}:${ip}`;
  const now = Date.now();
  
  let attempts = failedLoginAttempts.get(key) || {
    count: 0,
    firstAttempt: now,
    lockedUntil: null
  };
  
  // Check if currently locked
  if (attempts.lockedUntil && now < attempts.lockedUntil) {
    return { 
      blocked: true, 
      remaining: Math.ceil((attempts.lockedUntil - now) / 1000) 
    };
  }
  
  // Check if tracking window expired
  if (now - attempts.firstAttempt > BRUTE_FORCE_CONFIG.trackingWindow) {
    attempts = { count: 0, firstAttempt: now, lockedUntil: null };
  }
  
  attempts.count++;
  
  // Lock if exceeded max attempts
  if (attempts.count >= BRUTE_FORCE_CONFIG.maxAttempts) {
    attempts.lockedUntil = now + BRUTE_FORCE_CONFIG.lockoutDuration;
    console.log(`[BRUTE-FORCE] Account locked: ${email} from ${ip}`);
    
    // Log the lock event
    authAudit.logAuthEvent({
      userId: email,
      action: 'account_locked',
      targetResource: 'login',
      newValue: `Locked after ${attempts.count} failed attempts`,
      ipAddress: ip
    });
  }
  
  failedLoginAttempts.set(key, attempts);
  
  return {
    blocked: attempts.lockedUntil && now < attempts.lockedUntil,
    attempts: attempts.count,
    remaining: BRUTE_FORCE_CONFIG.maxAttempts - attempts.count
  };
}

/**
 * Clear failed login attempts after successful login
 */
function clearFailedLogins(email, ip) {
  const key = `login:${email}:${ip}`;
  failedLoginAttempts.delete(key);
}

/**
 * Get brute force status for email/IP
 */
function getBruteForceStatus(email, ip) {
  const key = `login:${email}:${ip}`;
  const attempts = failedLoginAttempts.get(key);
  
  if (!attempts) {
    return { locked: false, attempts: 0 };
  }
  
  const now = Date.now();
  const locked = attempts.lockedUntil && now < attempts.lockedUntil;
  
  return {
    locked,
    attempts: attempts.count,
    lockedUntil: attempts.lockedUntil
  };
}

// =====================================================
// EXTERNAL API SANDBOX
// =====================================================

const apiKeyPermissions = new Map();

/**
 * Register external API key with limited permissions
 */
function registerExternalAPI(apiKey, permissions, expiresAt) {
  apiKeyPermissions.set(apiKey, {
    permissions,
    createdAt: new Date().toISOString(),
    expiresAt,
    lastUsed: null,
    requestCount: 0
  });
  
  return true;
}

/**
 * Validate external API key and check permissions
 */
function validateExternalAPI(apiKey, requestedPermission) {
  const record = apiKeyPermissions.get(apiKey);
  
  if (!record) {
    return { valid: false, reason: 'Invalid API key' };
  }
  
  // Check expiration
  if (record.expiresAt && new Date(record.expiresAt) < new Date()) {
    return { valid: false, reason: 'API key expired' };
  }
  
  // Check permission
  if (!record.permissions.includes(requestedPermission) && 
      !record.permissions.includes('*')) {
    return { valid: false, reason: 'Insufficient API key permissions' };
  }
  
  // Update usage stats
  record.lastUsed = new Date().toISOString();
  record.requestCount++;
  apiKeyPermissions.set(apiKey, record);
  
  return { valid: true };
}

/**
 * Get external API key info
 */
function getExternalAPIInfo(apiKey) {
  const record = apiKeyPermissions.get(apiKey);
  if (!record) return null;
  
  return {
    permissions: record.permissions,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    lastUsed: record.lastUsed,
    requestCount: record.requestCount
  };
}

// =====================================================
// INITIALIZE TEST DATA
// =====================================================

function initializeSecurity() {
  // Create test users with MFA
  const adminUser = {
    id: 'admin-001',
    email: 'admin@culbridge.com',
    role: 'admin'
  };
  generateMFASecret(adminUser.id);
  enableMFA(adminUser.id, adminUser.role);
  
  console.log('[Security] Initialized with MFA enforcement for admin/auditor roles');
}

initializeSecurity();

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  // MFA
  generateMFASecret,
  enableMFA,
  validateMFAToken,
  enforceMFA,
  getMFAStatus,
  MFA_REQUIRED_ROLES,
  
  // RBAC
  checkPermission,
  enforceRBAC,
  SENSITIVE_ACTIONS,
  
  // Brute-force
  recordFailedLogin,
  clearFailedLogins,
  getBruteForceStatus,
  BRUTE_FORCE_CONFIG,
  
  // External API sandbox
  registerExternalAPI,
  validateExternalAPI,
  getExternalAPIInfo
};