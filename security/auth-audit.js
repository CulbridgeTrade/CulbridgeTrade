/**
 * Auth Audit Log - Immutable audit for permission and auth changes
 * 
 * Logs every change with userId, action, target resource, timestamp, old/new values
 */

const fs = require('fs');
const path = require('path');

const AUDIT_LOG_FILE = path.join(__dirname, '../data/auth-audit.json');

// Ensure data directory exists
const dataDir = path.dirname(AUDIT_LOG_FILE);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

/**
 * Auth Audit Log Entry
 */
const AuthAuditLog = {
  userId: 'string',
  action: 'string',         // e.g., role_change, login_success, login_failed, mfa_enabled
  targetResource: 'string', // e.g., labId, documentId, ruleId
  timestamp: 'string',      // ISO 8601
  oldValue: 'any',
  newValue: 'any',
  version: 'string',        // relevant rule or entity version
  ipAddress: 'string',
  userAgent: 'string'
};

/**
 * Log authentication event
 */
function logAuthEvent(event) {
  const entry = {
    id: `AUTH-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    userId: event.userId,
    action: event.action,
    targetResource: event.targetResource || null,
    timestamp: new Date().toISOString(),
    oldValue: event.oldValue || null,
    newValue: event.newValue || null,
    version: event.version || null,
    ipAddress: event.ipAddress || 'unknown',
    userAgent: event.userAgent || 'unknown'
  };
  
  // Load existing logs
  let logs = [];
  if (fs.existsSync(AUDIT_LOG_FILE)) {
    try {
      logs = JSON.parse(fs.readFileSync(AUDIT_LOG_FILE, 'utf-8'));
    } catch (e) {
      logs = [];
    }
  }
  
  // Append new entry (append-only, immutable)
  logs.push(entry);
  
  // Keep only last 10000 entries
  if (logs.length > 10000) {
    logs = logs.slice(-10000);
  }
  
  fs.writeFileSync(AUDIT_LOG_FILE, JSON.stringify(logs, null, 2));
  
  return entry;
}

/**
 * Log successful login
 */
function logLoginSuccess(userId, ipAddress, userAgent) {
  return logAuthEvent({
    userId,
    action: 'login_success',
    ipAddress,
    userAgent
  });
}

/**
 * Log failed login attempt
 */
function logLoginFailed(userId, reason, ipAddress) {
  return logAuthEvent({
    userId,
    action: 'login_failed',
    newValue: reason,
    ipAddress
  });
}

/**
 * Log role change
 */
function logRoleChange(userId, targetUserId, oldRole, newRole, changedBy) {
  return logAuthEvent({
    userId: changedBy,
    action: 'role_change',
    targetResource: targetUserId,
    oldValue: oldRole,
    newValue: newRole
  });
}

/**
 * Log permission change
 */
function logPermissionChange(userId, targetUserId, permission, added) {
  return logAuthEvent({
    userId,
    action: added ? 'permission_added' : 'permission_removed',
    targetResource: targetUserId,
    newValue: permission
  });
}

/**
 * Log MFA enable/disable
 */
function logMFAChange(userId, enabled, changedBy) {
  return logAuthEvent({
    userId: changedBy,
    action: enabled ? 'mfa_enabled' : 'mfa_disabled',
    targetResource: userId,
    newValue: enabled ? 'enabled' : 'disabled'
  });
}

/**
 * Log unauthorized access attempt
 */
function logUnauthorizedAttempt(userId, action, resource, ipAddress) {
  return logAuthEvent({
    userId: userId || 'anonymous',
    action: 'unauthorized_attempt',
    targetResource: `${resource}:${action}`,
    newValue: 'BLOCKED',
    ipAddress
  });
}

/**
 * Log sensitive action (lab/document/rule change)
 */
function logSensitiveAction(userId, action, resourceId, oldValue, newValue, version) {
  return logAuthEvent({
    userId,
    action,
    targetResource: resourceId,
    oldValue,
    newValue,
    version
  });
}

/**
 * Get audit logs for user
 */
function getUserAuditLogs(userId, limit = 100) {
  if (!fs.existsSync(AUDIT_LOG_FILE)) {
    return [];
  }
  
  const logs = JSON.parse(fs.readFileSync(AUDIT_LOG_FILE, 'utf-8'));
  return logs
    .filter(log => log.userId === userId || log.targetResource === userId)
    .slice(-limit)
    .reverse();
}

/**
 * Get audit logs for resource
 */
function getResourceAuditLogs(resourceType, limit = 100) {
  if (!fs.existsSync(AUDIT_LOG_FILE)) {
    return [];
  }
  
  const logs = JSON.parse(fs.readFileSync(AUDIT_LOG_FILE, 'utf-8'));
  return logs
    .filter(log => log.targetResource?.startsWith(resourceType))
    .slice(-limit)
    .reverse();
}

/**
 * Search audit logs
 */
function searchAuditLogs(criteria) {
  if (!fs.existsSync(AUDIT_LOG_FILE)) {
    return [];
  }
  
  const logs = JSON.parse(fs.readFileSync(AUDIT_LOG_FILE, 'utf-8'));
  
  return logs.filter(log => {
    if (criteria.userId && log.userId !== criteria.userId) return false;
    if (criteria.action && log.action !== criteria.action) return false;
    if (criteria.targetResource && !log.targetResource?.includes(criteria.targetResource)) return false;
    if (criteria.startDate && log.timestamp < criteria.startDate) return false;
    if (criteria.endDate && log.timestamp > criteria.endDate) return false;
    return true;
  });
}

module.exports = {
  logAuthEvent,
  logLoginSuccess,
  logLoginFailed,
  logRoleChange,
  logPermissionChange,
  logMFAChange,
  logUnauthorizedAttempt,
  logSensitiveAction,
  getUserAuditLogs,
  getResourceAuditLogs,
  searchAuditLogs
};