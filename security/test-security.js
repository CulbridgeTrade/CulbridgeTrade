/**
 * Unit Tests - Security Hardening Module
 * 
 * Tests for:
 * 1. MFA enforcement for admin/auditor roles
 * 2. RBAC enforcement for sensitive actions
 * 3. Brute-force protection
 * 4. External API sandbox
 * 
 * Version: 1.0
 */

const assert = require('assert');
const security = require('./security-hardening');

// =====================================================
// TEST HELPERS
// =====================================================

function createMockUser(overrides = {}) {
  return {
    id: 'user-001',
    email: 'test@culbridge.com',
    role: 'exporter',
    permissions: ['shipments:read', 'shipments:write', 'reports:read'],
    ...overrides
  };
}

// =====================================================
// TEST RUNNER
// =====================================================

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
    failed++;
  }
}

function section(name) {
  console.log(`\n${name}`);
}

// =====================================================
// TESTS: MFA ENFORCEMENT
// =====================================================

section('MFA Enforcement');

test('should allow non-admin user without MFA', () => {
  const user = createMockUser({ role: 'exporter', id: 'exporter-001' });
  const result = security.enforceMFA(user);
  assert.strictEqual(result.allowed, true);
});

test('should block admin user without MFA', () => {
  const user = createMockUser({ role: 'admin', id: 'admin-no-mfa' });
  const result = security.enforceMFA(user);
  assert.strictEqual(result.allowed, false);
  assert.strictEqual(result.code, 'MFA_REQUIRED');
});

test('should allow admin user with MFA enabled', () => {
  // First enable MFA for this admin
  const adminId = 'admin-with-mfa';
  security.generateMFASecret(adminId);
  security.enableMFA(adminId, 'admin');
  
  const user = createMockUser({ role: 'admin', id: adminId });
  const result = security.enforceMFA(user);
  assert.strictEqual(result.allowed, true);
});

test('should validate correct MFA token', () => {
  const userId = 'mfa-test-user';
  security.generateMFASecret(userId);
  security.enableMFA(userId, 'admin');
  
  const result = security.validateMFAToken(userId, '123456');
  assert.strictEqual(result.valid, true);
});

test('should reject invalid MFA token', () => {
  const userId = 'mfa-invalid-user';
  security.generateMFASecret(userId);
  security.enableMFA(userId, 'admin');
  
  const result = security.validateMFAToken(userId, 'invalid');
  assert.strictEqual(result.valid, false);
});

test('should generate backup codes', () => {
  const userId = 'backup-code-user';
  const { backupCodes } = security.generateMFASecret(userId);
  
  assert(Array.isArray(backupCodes), 'Should return array');
  assert.strictEqual(backupCodes.length, 8, 'Should have 8 backup codes');
});

test('should validate backup code', () => {
  const userId = 'backup-validate-user';
  const { backupCodes } = security.generateMFASecret(userId);
  security.enableMFA(userId, 'admin');
  
  const result = security.validateMFAToken(userId, backupCodes[0]);
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.method, 'backup');
});

test('should get MFA status', () => {
  const userId = 'mfa-status-user';
  security.generateMFASecret(userId);
  security.enableMFA(userId, 'admin');
  
  const status = security.getMFAStatus(userId);
  assert.strictEqual(status.enabled, true);
  assert(status.enabledAt, 'Should have enabledAt timestamp');
});

// =====================================================
// TESTS: RBAC ENFORCEMENT
// =====================================================

section('RBAC Enforcement');

test('should allow user with correct permission', () => {
  const user = createMockUser({ 
    role: 'admin', 
    permissions: ['shipments:read', 'shipments:write'] 
  });
  
  const result = security.checkPermission(user, 'read', 'shipments');
  assert.strictEqual(result.allowed, true);
});

test('should deny user without permission', () => {
  const user = createMockUser({ 
    role: 'viewer', 
    permissions: ['shipments:read'] 
  });
  
  const result = security.checkPermission(user, 'delete', 'shipments');
  assert.strictEqual(result.allowed, false);
  assert.strictEqual(result.code, 'RBAC_DENIED');
});

test('should enforce role restriction on sensitive actions', () => {
  const user = createMockUser({ 
    role: 'exporter',
    permissions: ['labs:write'] // Has permission but wrong role
  });
  
  const result = security.checkPermission(user, 'write', 'labs');
  // Exporter has permission but not allowed role for sensitive action
  assert.strictEqual(result.allowed, false);
  assert.strictEqual(result.code, 'ROLE_RESTRICTED');
});

test('should allow admin to delete labs', () => {
  const user = createMockUser({ 
    role: 'admin',
    permissions: ['labs:read', 'labs:write', 'labs:delete']
  });
  
  const result = security.checkPermission(user, 'delete', 'labs');
  assert.strictEqual(result.allowed, true);
});

test('should allow compliance officer to write labs', () => {
  const user = createMockUser({ 
    role: 'compliance_officer',
    permissions: ['labs:read', 'labs:write']
  });
  
  const result = security.checkPermission(user, 'write', 'labs');
  assert.strictEqual(result.allowed, true);
});

test('should block exporter from deleting rules', () => {
  const user = createMockUser({ 
    role: 'exporter',
    permissions: ['rules:read', 'rules:write']
  });
  
  const result = security.checkPermission(user, 'delete', 'rules');
  assert.strictEqual(result.allowed, false);
});

test('should allow admin to manage users', () => {
  const user = createMockUser({ 
    role: 'admin',
    permissions: ['users:read', 'users:write', 'users:delete']
  });
  
  const result = security.checkPermission(user, 'write', 'users');
  assert.strictEqual(result.allowed, true);
});

// =====================================================
// TESTS: BRUTE-FORCE PROTECTION
// =====================================================

section('Brute-Force Protection');

test('should allow first login attempt', () => {
  const result = security.recordFailedLogin('test@example.com', '192.168.1.1');
  // First attempt should not be blocked, but returns attempts
  assert(result.attempts >= 1, 'Should track attempts');
});

test('should track multiple failed attempts', () => {
  // Clear any previous state
  security.recordFailedLogin('brute@example.com', '10.0.0.1');
  const result = security.recordFailedLogin('brute@example.com', '10.0.0.1');
  
  assert(result.attempts >= 2, 'Should track multiple attempts');
});

test('should lock after max attempts', () => {
  const email = 'locktest@example.com';
  const ip = '10.0.1.1';
  
  // Try 5 times (max attempts)
  for (let i = 0; i < 5; i++) {
    security.recordFailedLogin(email, ip);
  }
  
  const result = security.recordFailedLogin(email, ip);
  assert.strictEqual(result.blocked, true);
  assert(result.remaining > 0); // Shows remaining lock time
});

test('should get brute force status', () => {
  const email = 'statustest@example.com';
  const ip = '10.0.2.1';
  
  security.recordFailedLogin(email, ip);
  const status = security.getBruteForceStatus(email, ip);
  
  // Status should exist (may be locked or not)
  assert(status !== null && status !== undefined, 'Should return status object');
  assert(typeof status.attempts === 'number', 'Should have attempts property');
});

test('should clear failed logins on success', () => {
  const email = 'cleartest@example.com';
  const ip = '10.0.3.1';
  
  security.recordFailedLogin(email, ip);
  security.clearFailedLogins(email, ip);
  
  const status = security.getBruteForceStatus(email, ip);
  assert(status.attempts === 0, 'Attempts should be cleared');
});

// =====================================================
// TESTS: EXTERNAL API SANDBOX
// =====================================================

section('External API Sandbox');

test('should register external API key', () => {
  const result = security.registerExternalAPI(
    'test-api-key-123',
    ['shipments:read'],
    '2027-12-31'
  );
  assert.strictEqual(result, true);
});

test('should validate correct API key', () => {
  const apiKey = 'valid-api-key-456';
  security.registerExternalAPI(apiKey, ['labs:read'], '2027-12-31');
  
  const result = security.validateExternalAPI(apiKey, 'labs:read');
  assert.strictEqual(result.valid, true);
});

test('should reject invalid API key', () => {
  const result = security.validateExternalAPI('nonexistent-key', 'labs:read');
  assert.strictEqual(result.valid, false);
  assert.strictEqual(result.reason, 'Invalid API key');
});

test('should reject expired API key', () => {
  const apiKey = 'expired-key-789';
  security.registerExternalAPI(apiKey, ['labs:read'], '2020-01-01');
  
  const result = security.validateExternalAPI(apiKey, 'labs:read');
  assert.strictEqual(result.valid, false);
  assert.strictEqual(result.reason, 'API key expired');
});

test('should reject API key with insufficient permissions', () => {
  const apiKey = 'readonly-key-abc';
  security.registerExternalAPI(apiKey, ['shipments:read'], '2027-12-31');
  
  const result = security.validateExternalAPI(apiKey, 'labs:write');
  assert.strictEqual(result.valid, false);
  assert.strictEqual(result.reason, 'Insufficient API key permissions');
});

test('should allow wildcard permission', () => {
  const apiKey = 'wildcard-key-xyz';
  security.registerExternalAPI(apiKey, ['*'], '2027-12-31');
  
  const result = security.validateExternalAPI(apiKey, 'anything:anything');
  assert.strictEqual(result.valid, true);
});

test('should track API key usage', () => {
  const apiKey = 'usage-track-key';
  security.registerExternalAPI(apiKey, ['shipments:read'], '2027-12-31');
  
  security.validateExternalAPI(apiKey, 'shipments:read');
  security.validateExternalAPI(apiKey, 'shipments:read');
  
  const info = security.getExternalAPIInfo(apiKey);
  assert.strictEqual(info.requestCount, 2);
  assert(info.lastUsed, 'Should have lastUsed timestamp');
});

// =====================================================
// TESTS: MFA REQUIRED ROLES CONFIG
// =====================================================

section('MFA Configuration');

test('should have admin in required roles', () => {
  assert(security.MFA_REQUIRED_ROLES.includes('admin'));
  assert(security.MFA_REQUIRED_ROLES.includes('ADMIN'));
});

test('should have auditor in required roles', () => {
  assert(security.MFA_REQUIRED_ROLES.includes('auditor'));
  assert(security.MFA_REQUIRED_ROLES.includes('AUDITOR'));
});

// =====================================================
// SUMMARY
// =====================================================

console.log(`\n=== SECURITY TEST SUMMARY ===`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total: ${passed + failed}`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log('\n✓ All security tests passed!');
  process.exit(0);
}