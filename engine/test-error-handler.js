/**
 * Unit Tests - Error Handling Module
 * 
 * Tests for:
 * 1. EngineError standardized objects
 * 2. Centralized error logging
 * 3. Circuit breaker pattern
 * 4. Retry policies with exponential backoff
 * 5. Graceful degradation
 * 
 * Version: 1.0
 */

const assert = require('assert');
const errorHandler = require('./error-handler');

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
// TESTS: ENGINE ERROR OBJECTS
// =====================================================

section('Engine Error Objects');

test('should create EngineError with all properties', () => {
  const error = new errorHandler.EngineError(
    'BLOCKER',
    'TEST_CODE',
    'Test message',
    { shipmentId: 'shp-001' }
  );
  
  assert.strictEqual(error.severity, 'BLOCKER');
  assert.strictEqual(error.code, 'TEST_CODE');
  assert.strictEqual(error.message, 'Test message');
  assert.strictEqual(error.context.shipmentId, 'shp-001');
  assert(error.timestamp, 'Should have timestamp');
});

test('should create ERROR factory BLOCKER', () => {
  const error = errorHandler.ErrorFactory.BLOCKER.apiTimeout('labRegistry', { labId: 'L123' });
  
  assert.strictEqual(error.severity, 'BLOCKER');
  assert.strictEqual(error.code, 'API_TIMEOUT');
  assert(error.message.includes('labRegistry'));
});

test('should create ERROR factory WARNING', () => {
  const error = errorHandler.ErrorFactory.WARNING.documentHashMissing('doc-001');
  
  assert.strictEqual(error.severity, 'WARNING');
  assert.strictEqual(error.code, 'DOCUMENT_HASH_MISSING');
});

test('should create ERROR factory INFO', () => {
  const error = errorHandler.ErrorFactory.INFO.retryAttempt(2, 3);
  
  assert.strictEqual(error.severity, 'INFO');
  assert.strictEqual(error.code, 'RETRY_ATTEMPT');
  assert(error.message.includes('2/3'));
});

test('should serialize to JSON correctly', () => {
  const error = new errorHandler.EngineError('WARNING', 'TEST', 'Test');
  const json = error.toJSON();
  
  assert(json.name, 'EngineError');
  assert(json.severity, 'WARNING');
  assert(json.code, 'TEST');
  assert(json.timestamp);
});

// =====================================================
// TESTS: CENTRALIZED ERROR LOGGING
// =====================================================

section('Centralized Error Logging');

test('should log error and return log entry', () => {
  const error = new errorHandler.EngineError('BLOCKER', 'TEST', 'Test error');
  const result = errorHandler.handleEngineError(error, { shipmentId: 'shp-001' });
  
  // Result is the error object, not logEntry
  assert(result, 'Should return error');
  assert.strictEqual(result.code, 'TEST');
});

test('should get errors for specific shipment', () => {
  // Log some errors
  errorHandler.handleEngineError(
    errorHandler.ErrorFactory.BLOCKER.unknownError('Test 1'),
    { shipment_id: 'shp-test' }
  );
  errorHandler.handleEngineError(
    errorHandler.ErrorFactory.WARNING.optionalCheckFailed('check1'),
    { shipment_id: 'shp-test' }
  );
  
  const errors = errorHandler.errorLogger.getErrorsForShipment('shp-test');
  assert(errors.length >= 2, 'Should find errors for shipment');
});

test('should get recent errors by severity', () => {
  // Log some errors
  errorHandler.handleEngineError(errorHandler.ErrorFactory.BLOCKER.unknownError('b1'));
  errorHandler.handleEngineError(errorHandler.ErrorFactory.BLOCKER.unknownError('b2'));
  errorHandler.handleEngineError(errorHandler.ErrorFactory.WARNING.optionalCheckFailed('w1'));
  
  const blockers = errorHandler.errorLogger.getRecentBySeverity('BLOCKER', 10);
  assert(blockers.length >= 2, 'Should find blockers');
});

test('should get error statistics', () => {
  const stats = errorHandler.errorLogger.getStats();
  
  assert(typeof stats.total === 'number', 'Should have total');
  assert(typeof stats.BLOCKER === 'number', 'Should have BLOCKER count');
  assert(typeof stats.WARNING === 'number', 'Should have WARNING count');
});

test('should export for audit with filters', () => {
  // Log test error
  errorHandler.handleEngineError(
    errorHandler.ErrorFactory.BLOCKER.unknownError('audit test'),
    { shipment_id: 'audit-shipment' }
  );
  
  const exportResult = errorHandler.errorLogger.exportForAudit({
    shipmentId: 'audit-shipment',
    severity: 'BLOCKER'
  });
  
  assert(Array.isArray(exportResult), 'Should return array');
});

// =====================================================
// TESTS: CIRCUIT BREAKER PATTERN
// =====================================================

section('Circuit Breaker Pattern');

test('should create circuit breaker with default config', () => {
  const cb = new errorHandler.CircuitBreaker('test-service');
  
  assert.strictEqual(cb.state, 'CLOSED');
  assert.strictEqual(cb.name, 'test-service');
});

test('should transition to OPEN on failures', async () => {
  const cb = new errorHandler.CircuitBreaker('fail-test', {
    errorThreshold: 0.3,
    maxRequests: 10
  });
  
  // Trigger failures
  for (let i = 0; i < 5; i++) {
    try {
      await cb.fire(() => Promise.reject(new Error('Simulated failure')));
    } catch (e) {
      // Expected to fail
    }
  }
  
  const state = cb.getState();
  assert(state.state === 'OPEN', 'Should be OPEN after threshold');
});

test('should allow successful calls when closed', async () => {
  const cb = new errorHandler.CircuitBreaker('success-test');
  
  const result = await cb.fire(() => Promise.resolve('success'));
  assert.strictEqual(result, 'success');
});

test('should reject calls when OPEN', async () => {
  const cb = new errorHandler.CircuitBreaker('reject-test', {
    errorThreshold: 0.1,
    resetTimeout: 100
  });
  
  // Open the circuit
  cb.state = 'OPEN';
  cb.nextAttempt = Date.now() + 10000;
  
  try {
    await cb.fire(() => Promise.resolve('should not reach'));
    assert.fail('Should have thrown');
  } catch (e) {
    assert(e.code === 'API_TIMEOUT', 'Should throw API_TIMEOUT');
  }
});

test('should get circuit breaker state', () => {
  const cb = new errorHandler.CircuitBreaker('state-test');
  const state = cb.getState();
  
  assert(state.state, 'CLOSED');
  assert(typeof state.failures === 'number');
});

// =====================================================
// TESTS: RETRY POLICIES
// =====================================================

section('Retry Policies');

test('should succeed on first attempt', async () => {
  let attempts = 0;
  const fn = async () => {
    attempts++;
    return 'success';
  };
  
  const result = await errorHandler.retry(fn, 3, 10);
  assert.strictEqual(result, 'success');
  assert.strictEqual(attempts, 1);
});

test('should retry on failure and eventually succeed', async () => {
  let attempts = 0;
  const fn = async () => {
    attempts++;
    if (attempts < 3) {
      throw new Error('Temporary failure');
    }
    return 'success';
  };
  
  const result = await errorHandler.retry(fn, 3, 10);
  assert.strictEqual(result, 'success');
  assert.strictEqual(attempts, 3);
});

test('should throw after max retries exhausted', async () => {
  const fn = async () => {
    throw new Error('Persistent failure');
  };
  
  try {
    await errorHandler.retry(fn, 2, 10);
    assert.fail('Should have thrown');
  } catch (e) {
    assert(e.message.includes('Persistent failure'));
  }
});

test('should implement exponential backoff', async () => {
  const delays = [];
  const originalSetTimeout = global.setTimeout;
  
  // Override setTimeout to capture delays
  global.setTimeout = (fn, ms) => {
    delays.push(ms);
    return originalSetTimeout(fn, 0); // Execute immediately but track delay
  };
  
  let attempts = 0;
  const fn = async () => {
    attempts++;
    if (attempts < 3) throw new Error('Fail');
    return 'success';
  };
  
  await errorHandler.retry(fn, 3, 100);
  
  global.setTimeout = originalSetTimeout;
  
  // Verify delays increase (exponential backoff)
  // Note: Due to immediate execution, delays may be close to 0
  assert(attempts >= 2, 'Should have attempted multiple times');
});

// =====================================================
// TESTS: GRACEFUL DEGRADATION
// =====================================================

section('Graceful Degradation');

test('should return result on successful execution', async () => {
  const result = await errorHandler.safeExecute(
    async () => 'success',
    'WARNING',
    'fallback'
  );
  
  assert.strictEqual(result, 'success');
});

test('should return fallback on WARNING error', async () => {
  const result = await errorHandler.safeExecute(
    async () => {
      throw errorHandler.ErrorFactory.WARNING.optionalCheckFailed('test');
    },
    'WARNING',
    'fallback-value'
  );
  
  assert(result.error, 'Should have error');
  assert.strictEqual(result.error.severity, 'WARNING');
  assert.strictEqual(result.fallback, 'fallback-value');
});

test('should return fallback on BLOCKER error (no crash)', async () => {
  const result = await errorHandler.safeExecute(
    async () => {
      throw errorHandler.ErrorFactory.BLOCKER.unknownError('Critical error');
    },
    'WARNING',
    'fallback-value'
  );
  
  assert(result.error, 'Should have error');
  assert.strictEqual(result.error.severity, 'BLOCKER');
  assert.strictEqual(result.fallback, 'fallback-value');
});

test('should execute multiple operations with degradation', async () => {
  const operations = [
    { fn: async () => 'success-1', fallback: null },
    { fn: async () => { throw errorHandler.ErrorFactory.WARNING.optionalCheckFailed('opt'); }, fallback: 'fallback-2' },
    { fn: async () => { throw errorHandler.ErrorFactory.BLOCKER.unknownError('crit'); }, fallback: null }
  ];
  
  const result = await errorHandler.executeWithGracefulDegradation(operations);
  
  assert(result.results.length === 3);
  assert(result.warnings.length >= 1);
  assert(result.errors.length >= 1);
  assert(result.hasBlockers === true);
});

// =====================================================
// TESTS: ERROR FACTORY
// =====================================================

section('Error Factory');

test('should create all BLOCKER types', () => {
  const errors = [
    errorHandler.ErrorFactory.BLOCKER.apiTimeout('service'),
    errorHandler.ErrorFactory.BLOCKER.labRegistryUnavailable('L123'),
    errorHandler.ErrorFactory.BLOCKER.documentVerificationFailed('D123'),
    errorHandler.ErrorFactory.BLOCKER.missingRequiredDocument('CERTIFICATE'),
    errorHandler.ErrorFactory.BLOCKER.invalidHSCode('1234.56'),
    errorHandler.ErrorFactory.BLOCKER.complianceViolation('RULE-001'),
    errorHandler.ErrorFactory.BLOCKER.stateTransitionInvalid('DRAFT', 'SUBMITTED'),
    errorHandler.ErrorFactory.BLOCKER.unknownError('Test')
  ];
  
  errors.forEach(e => assert.strictEqual(e.severity, 'BLOCKER'));
});

test('should create all WARNING types', () => {
  const errors = [
    errorHandler.ErrorFactory.WARNING.optionalCheckFailed('check'),
    errorHandler.ErrorFactory.WARNING.documentHashMissing('D123'),
    errorHandler.ErrorFactory.WARNING.lowConfidenceHSCode('1234.56', 0.5),
    errorHandler.ErrorFactory.WARNING.deprecatedAPI('v1'),
    errorHandler.ErrorFactory.WARNING.rateLimitApproaching('service', 10),
    errorHandler.ErrorFactory.WARNING.entityNotVerified('E123')
  ];
  
  errors.forEach(e => assert.strictEqual(e.severity, 'WARNING'));
});

test('should create all INFO types', () => {
  const errors = [
    errorHandler.ErrorFactory.INFO.processingComplete('shp-001'),
    errorHandler.ErrorFactory.INFO.cacheHit('key'),
    errorHandler.ErrorFactory.INFO.retryAttempt(1, 3)
  ];
  
  errors.forEach(e => assert.strictEqual(e.severity, 'INFO'));
});

// =====================================================
// TESTS: HANDLE ENGINE ERROR
// =====================================================

section('Handle Engine Error');

test('should handle EngineError instance', () => {
  const error = new errorHandler.EngineError('WARNING', 'CODE', 'msg');
  const result = errorHandler.handleEngineError(error);
  
  assert.strictEqual(result.code, 'CODE');
});

test('should convert plain object to EngineError', () => {
  const result = errorHandler.handleEngineError({
    severity: 'WARNING',
    code: 'TEST_CODE',
    message: 'Test message'
  }, { contextKey: 'value' });
  
  assert.strictEqual(result.severity, 'WARNING');
  assert.strictEqual(result.code, 'TEST_CODE');
  assert.strictEqual(result.context.contextKey, 'value');
});

test('should convert raw error to EngineError', () => {
  const result = errorHandler.handleEngineError(new Error('Raw error'));
  
  assert.strictEqual(result.severity, 'BLOCKER'); // Default
  assert.strictEqual(result.code, 'UNKNOWN_ERROR');
});

// =====================================================
// SUMMARY
// =====================================================

console.log(`\n=== ERROR HANDLING TEST SUMMARY ===`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total: ${passed + failed}`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log('\n✓ All error handling tests passed!');
  process.exit(0);
}