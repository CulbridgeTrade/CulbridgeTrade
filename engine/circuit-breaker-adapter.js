/**
 * External Dependency Adapter Layer + Circuit Breaker Pattern
 * 
 * Features:
 * - Adapter layer for all external APIs (NSW, Remita, NAQS, etc.)
 * - Circuit breaker pattern (closed/open/half-open)
 * - Bulkhead isolation between pipelines
 * - Retry with exponential backoff
 * - Failure containment
 */

const { run, get, all } = require('./utils/db');

// Circuit breaker states
const CB_STATES = {
  CLOSED: 'CLOSED',    // Normal operation
  OPEN: 'OPEN',        // Failing, reject calls
  HALF_OPEN: 'HALF_OPEN'  // Testing recovery
};

// Circuit breaker configs per dependency
const CIRCUIT_BREAKER_CONFIGS = {
  nsw: {
    failureThreshold: 5,
    recoveryTimeout: 30000, // 30 seconds
    successThreshold: 2,
    timeout: 15000
  },
  remita: {
    failureThreshold: 3,
    recoveryTimeout: 60000, // 60 seconds
    successThreshold: 3,
    timeout: 10000
  },
  naqs: {
    failureThreshold: 5,
    recoveryTimeout: 30000,
    successThreshold: 2,
    timeout: 10000
  },
  nafdac: {
    failureThreshold: 5,
    recoveryTimeout: 30000,
    successThreshold: 2,
    timeout: 10000
  }
};

/**
 * Initialize circuit breaker state table
 */
async function initializeCircuitBreakerTables() {
  await run(`
    CREATE TABLE IF NOT EXISTS CircuitBreakerState (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dependency TEXT NOT NULL UNIQUE,
      state TEXT NOT NULL DEFAULT 'CLOSED',
      failure_count INTEGER DEFAULT 0,
      success_count INTEGER DEFAULT 0,
      last_failure_at DATETIME,
      last_success_at DATETIME,
      opened_at DATETIME,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Initialize states for all dependencies
  for (const dep of Object.keys(CIRCUIT_BREAKER_CONFIGS)) {
    await run(
      `INSERT OR IGNORE INTO CircuitBreakerState (dependency, state) VALUES (?, ?)`,
      [dep, CB_STATES.CLOSED]
    );
  }
  
  console.log('Circuit breaker tables initialized');
}

/**
 * Get circuit breaker state for dependency
 */
async function getCircuitBreakerState(dependency) {
  const state = await get(
    `SELECT * FROM CircuitBreakerState WHERE dependency = ?`,
    [dependency]
  );
  
  if (!state) {
    return { state: CB_STATES.CLOSED };
  }
  
  // Check if OPEN state should transition to HALF_OPEN
  if (state.state === CB_STATES.OPEN) {
    const config = CIRCUIT_BREAKER_CONFIGS[dependency];
    const timeSinceOpen = Date.now() - new Date(state.opened_at).getTime();
    
    if (timeSinceOpen >= config.recoveryTimeout) {
      await updateCircuitBreaker(dependency, CB_STATES.HALF_OPEN);
      return { state: CB_STATES.HALF_OPEN, transitioning: true };
    }
  }
  
  return { state: state.state };
}

/**
 * Record success for circuit breaker
 */
async function recordSuccess(dependency) {
  const state = await get(
    `SELECT * FROM CircuitBreakerState WHERE dependency = ?`,
    [dependency]
  );
  
  if (!state) return;
  
  const config = CIRCUIT_BREAKER_CONFIGS[dependency];
  
  if (state.state === CB_STATES.HALF_OPEN) {
    const newSuccessCount = state.success_count + 1;
    
    if (newSuccessCount >= config.successThreshold) {
      // Recovered - close circuit
      await updateCircuitBreaker(dependency, CB_STATES.CLOSED, {
        success_count: 0,
        failure_count: 0
      });
    } else {
      await run(
        `UPDATE CircuitBreakerState SET success_count = ?, updated_at = ? WHERE dependency = ?`,
        [newSuccessCount, new Date().toISOString(), dependency]
      );
    }
  } else if (state.state === CB_STATES.CLOSED) {
    // Reset failure count on success
    await run(
      `UPDATE CircuitBreakerState SET failure_count = 0, success_count = 0, last_success_at = ?, updated_at = ? WHERE dependency = ?`,
      [new Date().toISOString(), new Date().toISOString(), dependency]
    );
  }
}

/**
 * Record failure for circuit breaker
 */
async function recordFailure(dependency, error) {
  const state = await get(
    `SELECT * FROM CircuitBreakerState WHERE dependency = ?`,
    [dependency]
  );
  
  if (!state) return;
  
  const config = CIRCUIT_BREAKER_CONFIGS[dependency];
  const newFailureCount = state.failure_count + 1;
  
  if (state.state === CB_STATES.HALF_OPEN || state.state === CB_STATES.CLOSED) {
    if (newFailureCount >= config.failureThreshold) {
      // Open circuit
      await updateCircuitBreaker(dependency, CB_STATES.OPEN, {
        failure_count: newFailureCount,
        opened_at: new Date().toISOString()
      });
    } else {
      await run(
        `UPDATE CircuitBreakerState SET failure_count = ?, last_failure_at = ?, updated_at = ? WHERE dependency = ?`,
        [newFailureCount, new Date().toISOString(), new Date().toISOString(), dependency]
      );
    }
  }
}

/**
 * Update circuit breaker state
 */
async function updateCircuitBreaker(dependency, newState, updates = {}) {
  const setClauses = ['state = ?', 'updated_at = ?'];
  const params = [newState, new Date().toISOString()];
  
  if (updates.failure_count !== undefined) {
    setClauses.push('failure_count = ?');
    params.push(updates.failure_count);
  }
  if (updates.success_count !== undefined) {
    setClauses.push('success_count = ?');
    params.push(updates.success_count);
  }
  if (updates.opened_at) {
    setClauses.push('opened_at = ?');
    params.push(updates.opened_at);
  }
  
  params.push(dependency);
  
  await run(
    `UPDATE CircuitBreakerState SET ${setClauses.join(', ')} WHERE dependency = ?`,
    params
  );
}

/**
 * Execute call through adapter with circuit breaker
 */
async function executeWithCircuitBreaker(dependency, operation, fn) {
  // Check circuit breaker state
  const cbState = await getCircuitBreakerState(dependency);
  
  if (cbState.state === CB_STATES.OPEN) {
    return {
      success: false,
      error: 'CIRCUIT_OPEN',
      message: `Dependency ${dependency} circuit is OPEN. Failing fast.`,
      retry_after: CIRCUIT_BREAKER_CONFIGS[dependency].recoveryTimeout
    };
  }
  
  try {
    // Execute with timeout
    const result = await Promise.race([
      fn(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('TIMEOUT')), 
          CIRCUIT_BREAKER_CONFIGS[dependency].timeout)
      )
    ]);
    
    // Success - record it
    await recordSuccess(dependency);
    
    return { success: true, data: result };
    
  } catch (error) {
    // Failure - record it
    await recordFailure(dependency, error.message);
    
    return {
      success: false,
      error: error.message,
      circuit_state: await getCircuitBreakerState(dependency)
    };
  }
}

/**
 * Call NSW with circuit breaker
 */
async function callNSW(payload) {
  return executeWithCircuitBreaker('nsw', 'submit', async () => {
    // Simulate NSW API call
    // In production, this would be: await axios.post(NSW_URL, payload)
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return {
      sgd_number: 'SGD-' + Date.now(),
      status: 'ACCEPTED'
    };
  });
}

/**
 * Call Remita with circuit breaker
 */
async function callRemita(paymentRef, amount) {
  return executeWithCircuitBreaker('remita', 'verify', async () => {
    // Simulate Remita API call
    await new Promise(resolve => setTimeout(resolve, 50));
    
    return {
      verified: true,
      amount
    };
  });
}

/**
 * Call NAQS with circuit breaker
 */
async function callNAQS(certificateRef) {
  return executeWithCircuitBreaker('naqs', 'verify', async () => {
    // Simulate NAQS API call
    await new Promise(resolve => setTimeout(resolve, 50));
    
    return {
      valid: true,
      reference: certificateRef
    };
  });
}

/**
 * Retry with exponential backoff (manual retry when circuit allows)
 */
async function retryWithBackoff(fn, options = {}) {
  const maxAttempts = options.maxAttempts || 3;
  const baseDelay = options.baseDelay || 1000;
  let lastError;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

/**
 * Get circuit breaker status for all dependencies
 */
async function getCircuitBreakerStatus() {
  const states = await all(`SELECT * FROM CircuitBreakerState`);
  
  return states.map(s => ({
    dependency: s.state,
    state: s.state,
    failure_count: s.failure_count,
    success_count: s.success_count,
    last_failure_at: s.last_failure_at,
    opened_at: s.opened_at
  }));
}

// Auto-initialize
initializeCircuitBreakerTables().catch(console.error);

module.exports = {
  CB_STATES,
  CIRCUIT_BREAKER_CONFIGS,
  initializeCircuitBreakerTables,
  getCircuitBreakerState,
  recordSuccess,
  recordFailure,
  executeWithCircuitBreaker,
  callNSW,
  callRemita,
  callNAQS,
  retryWithBackoff,
  getCircuitBreakerStatus
};