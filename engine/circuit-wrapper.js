// Circuit Breaker Wrapper for Culbridge Engine
// Wraps all external calls with resilience + logging

const { globalRegistry } = require('../resilience/circuit-breaker');

module.exports = {
  withBreaker: (service) => (fn) => globalRegistry.execute(service, fn, { 
    failureThreshold: 3, 
    timeout: 10000,
    volumeThreshold: 5
  }),
  
  // Pre-configured for common services
  rasff: (fn) => globalRegistry.execute('RASFF', fn),
  naqs: (fn) => globalRegistry.execute('NAQS', fn),
  nsw: (fn) => globalRegistry.execute('NSW', fn),
  
  // Example usage in services
  // await circuit.rasff(async () => await fetchRASFF());
  
  status: () => globalRegistry.getAllStatus()
};

