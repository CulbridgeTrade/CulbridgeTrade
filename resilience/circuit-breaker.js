/**
 * Circuit Breaker & Bulkhead Pattern Implementation
 * Protects against cascading failures from external dependencies
 * NSW, Remita, NAQS, NAFDAC, SON API calls wrapped with resilience
 */

const crypto = require('crypto');

/**
 * Circuit Breaker States
 */
const STATES = {
  CLOSED: 'CLOSED',    // Normal operation
  OPEN: 'OPEN',        // Failing, reject calls
  HALF_OPEN: 'HALF_OPEN'  // Testing recovery
};

/**
 * Circuit Breaker Configuration
 */
const DEFAULT_OPTIONS = {
  failureThreshold: 5,      // Open circuit after this many failures
  successThreshold: 2,     // Close circuit after this many successes (in half-open)
  timeout: 30000,          // Time in ms before trying half-open
  volumeThreshold: 10,     // Minimum requests before evaluating
  resetTimeout: 30000     // Time to wait before half-open
};

/**
 * Circuit Breaker class
 */
class CircuitBreaker {
  constructor(name, options = {}) {
    this.name = name;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    
    this.state = STATES.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.requestCount = 0;
    this.lastStateChange = Date.now();
    
    // Event handlers
    this.onStateChange = null;
    this.onFailure = null;
    this.onSuccess = null;
  }
  
  /**
   * Execute function with circuit breaker protection
   */
  async execute(fn) {
    this.requestCount++;
    
    // Check if circuit is open
    if (this.state === STATES.OPEN) {
      // Check if timeout has elapsed to try half-open
      if (Date.now() - this.lastStateChange >= this.options.resetTimeout) {
        this.transitionTo(STATES.HALF_OPEN);
      } else {
        throw new Error(`Circuit breaker OPEN for ${this.name}`);
      }
    }
    
    try {
      const result = await fn();
      this.onSuccessResult();
      return result;
    } catch (error) {
      this.onFailureResult(error);
      throw error;
    }
  }
  
  /**
   * Handle successful execution
   */
  onSuccessResult() {
    this.failureCount = 0;
    
    if (this.state === STATES.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.options.successThreshold) {
        this.transitionTo(STATES.CLOSED);
      }
    }
    
    if (this.onSuccess) {
      this.onSuccess(this.name);
    }
  }
  
  /**
   * Handle failed execution
   */
  onFailureResult(error) {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    this.successCount = 0;
    
    // Only transition to OPEN if we have enough volume
    if (this.requestCount >= this.options.volumeThreshold) {
      if (this.failureCount >= this.options.failureThreshold) {
        this.transitionTo(STATES.OPEN);
      }
    }
    
    if (this.onFailure) {
      this.onFailure(this.name, error);
    }
  }
  
  /**
   * Transition to new state
   */
  transitionTo(newState) {
    const oldState = this.state;
    this.state = newState;
    this.lastStateChange = Date.now();
    
    if (oldState !== newState && this.onStateChange) {
      this.onStateChange(this.name, oldState, newState);
    }
    
    console.log(`[CircuitBreaker] ${this.name}: ${oldState} -> ${newState}`);
  }
  
  /**
   * Get current state
   */
  getState() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      requestCount: this.requestCount,
      lastFailureTime: this.lastFailureTime
    };
  }
  
  /**
   * Reset circuit breaker
   */
  reset() {
    this.state = STATES.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.requestCount = 0;
    this.lastStateChange = Date.now();
  }
}

/**
 * Circuit Breaker Registry - manages multiple breakers
 */
class CircuitBreakerRegistry {
  constructor() {
    this.breakers = new Map();
    this.fallbacks = new Map();
  }
  
  /**
   * Get or create circuit breaker for a service
   */
  getOrCreate(serviceName, options = {}) {
    if (!this.breakers.has(serviceName)) {
      const breaker = new CircuitBreaker(serviceName, options);
      
      // Set up default state change logging
      breaker.onStateChange = (name, oldState, newState) => {
        console.log(`[CircuitBreaker] State change: ${name} ${oldState} -> ${newState}`);
      };
      
      this.breakers.set(serviceName, breaker);
    }
    
    return this.breakers.get(serviceName);
  }
  
  /**
   * Set fallback function for a service
   */
  setFallback(serviceName, fallbackFn) {
    this.fallbacks.set(serviceName, fallbackFn);
  }
  
  /**
   * Execute with circuit breaker and fallback
   */
  async execute(serviceName, fn, options = {}) {
    const breaker = this.getOrCreate(serviceName, options);
    const fallback = this.fallbacks.get(serviceName);
    
    try {
      return await breaker.execute(fn);
    } catch (error) {
      // Try fallback if available
      if (fallback) {
        console.log(`[CircuitBreaker] Executing fallback for ${serviceName}`);
        return await fallback(error);
      }
      throw error;
    }
  }
  
  /**
   * Get status of all circuit breakers
   */
  getAllStatus() {
    const status = {};
    for (const [name, breaker] of this.breakers) {
      status[name] = breaker.getState();
    }
    return status;
  }
  
  /**
   * Reset all circuit breakers
   */
  resetAll() {
    for (const [, breaker] of this.breakers) {
      breaker.reset();
    }
  }
}

// Global registry
const globalRegistry = new CircuitBreakerRegistry();

// Pre-configured circuit breakers for each external service
const SERVICE_BREAKERS = {
  NSW: {
    failureThreshold: 3,
    timeout: 60000,
    volumeThreshold: 5
  },
  REMITA: {
    failureThreshold: 5,
    timeout: 30000,
    volumeThreshold: 10
  },
  NAQS: {
    failureThreshold: 3,
    timeout: 45000,
    volumeThreshold: 5
  },
  NEPC: {
    failureThreshold: 3,
    timeout: 30000,
    volumeThreshold: 5
  },
  NAFDAC: {
    failureThreshold: 3,
    timeout: 30000,
    volumeThreshold: 5
  },
  SON: {
    failureThreshold: 3,
    timeout: 30000,
    volumeThreshold: 5
  },
  NIMC: {
    failureThreshold: 3,
    timeout: 20000,
    volumeThreshold: 5
  }
};

// Initialize breakers
for (const [service, options] of Object.entries(SERVICE_BREAKERS)) {
  globalRegistry.getOrCreate(service, options);
}

/**
 * Decorator for wrapping async functions with circuit breaker
 * @param {string} serviceName - Name of external service
 * @param {object} options - Circuit breaker options
 */
function withCircuitBreaker(serviceName, options = {}) {
  return async function (target, propertyKey, descriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args) {
      return globalRegistry.execute(serviceName, () => originalMethod.apply(this, args), options);
    };
    
    return descriptor;
  };
}

/**
 * Set fallback for external service
 */
function setServiceFallback(serviceName, fallbackFn) {
  globalRegistry.setFallback(serviceName, fallbackFn);
}

// Default fallbacks
setServiceFallback('NSW', async (error) => ({
  fallback: true,
  service: 'NSW',
  message: 'NSW service temporarily unavailable',
  cached_sgd: await getCachedSGD(),
  retry_after: 30000
}));

setServiceFallback('REMITA', async (error) => ({
  fallback: true,
  service: 'REMITA',
  message: 'Payment service temporarily unavailable',
  queue_payment: true,
  retry_after: 30000
}));

/**
 * Get cached SGD number if available
 */
async function getCachedSGD() {
  // Implementation would check Redis/cache for recent SGD
  return null;
}

module.exports = {
  CircuitBreaker,
  CircuitBreakerRegistry,
  globalRegistry,
  withCircuitBreaker,
  setServiceFallback,
  SERVICE_BREAKERS,
  STATES
};