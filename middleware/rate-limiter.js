/**
 * API Rate Limiting Middleware
 * Limits requests per exporter to prevent queue overflow
 * Returns HTTP 429 when limit exceeded
 */

const crypto = require('crypto');

// In-memory store (use Redis in production)
const requestCounts = new Map();
const rateLimitConfig = {
  windowMs: 1000, // 1 second window
  maxRequests: 5, // 5 requests per second per exporter
  blockDuration: 60000 // Block for 1 minute after exceeding
};

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of requestCounts.entries()) {
    if (now - data.windowStart > rateLimitConfig.windowMs * 2) {
      requestCounts.delete(key);
    }
  }
}, 60000);

/**
 * Rate limit middleware for Express
 * Limits requests per exporter_id or IP address
 */
function rateLimiter(req, res, next) {
  // Get identifier (exporter_id from token or IP)
  const identifier = getIdentifier(req);
  
  if (!identifier) {
    return res.status(429).json({
      error: 'Too Many Requests',
      message: 'Unable to identify requester'
    });
  }
  
  const now = Date.now();
  const key = `rate:${identifier}`;
  const record = requestCounts.get(key);
  
  // Check if blocked
  if (record && record.blockedUntil && now < record.blockedUntil) {
    const retryAfter = Math.ceil((record.blockedUntil - now) / 1000);
    res.set('Retry-After', retryAfter);
    return res.status(429).json({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Temporary block in effect.',
      retry_after: retryAfter
    });
  }
  
  // Initialize or update record
  if (!record || now - record.windowStart > rateLimitConfig.windowMs) {
    // New window
    requestCounts.set(key, {
      windowStart: now,
      count: 1,
      blockedUntil: null
    });
    return next();
  }
  
  // Increment count
  record.count++;
  
  // Check if limit exceeded
  if (record.count > rateLimitConfig.maxRequests) {
    record.blockedUntil = now + rateLimitConfig.blockDuration;
    console.log(`[RATE-LIMIT] Blocked ${identifier} for ${rateLimitConfig.blockDuration}ms`);
    
    res.set('Retry-After', Math.ceil(rateLimitConfig.blockDuration / 1000));
    return res.status(429).json({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please slow down.',
      limit: rateLimitConfig.maxRequests,
      window: `${rateLimitConfig.windowMs}ms`
    });
  }
  
  // Set rate limit headers
  res.set('X-RateLimit-Limit', rateLimitConfig.maxRequests);
  res.set('X-RateLimit-Remaining', rateLimitConfig.maxRequests - record.count);
  res.set('X-RateLimit-Reset', Math.ceil((record.windowStart + rateLimitConfig.windowMs) / 1000));
  
  next();
}

/**
 * Get request identifier from token or IP
 */
function getIdentifier(req) {
  // Try to get exporter_id from JWT token
  if (req.user && req.user.exporter_id) {
    return `exporter:${req.user.exporter_id}`;
  }
  
  // Fall back to IP address
  const ip = req.ip || 
             req.headers['x-forwarded-for']?.split(',')[0] || 
             'unknown';
  return `ip:${ip}`;
}

/**
 * Check current rate limit status for an identifier
 */
function getRateLimitStatus(identifier) {
  const key = `rate:${identifier}`;
  const record = requestCounts.get(key);
  
  if (!record) {
    return {
      allowed: true,
      remaining: rateLimitConfig.maxRequests,
      reset: Math.ceil((Date.now() + rateLimitConfig.windowMs) / 1000)
    };
  }
  
  const now = Date.now();
  const isBlocked = record.blockedUntil && now < record.blockedUntil;
  
  return {
    allowed: !isBlocked,
    remaining: Math.max(0, rateLimitConfig.maxRequests - record.count),
    reset: Math.ceil((record.windowStart + rateLimitConfig.windowMs) / 1000),
    blocked: isBlocked
  };
}

/**
 * Reset rate limit for a specific identifier
 * (For admin use)
 */
function resetRateLimit(identifier) {
  const key = `rate:${identifier}`;
  requestCounts.delete(key);
  return true;
}

/**
 * Get all rate limit statistics
 */
function getRateLimitStats() {
  const stats = {
    totalIdentifiers: requestCounts.size,
    currentlyBlocked: 0,
    nearLimit: 0
  };
  
  const now = Date.now();
  for (const [key, record] of requestCounts.entries()) {
    if (record.blockedUntil && now < record.blockedUntil) {
      stats.currentlyBlocked++;
    }
    if (record.count >= rateLimitConfig.maxRequests * 0.8) {
      stats.nearLimit++;
    }
  }
  
  return stats;
}

/**
 * Custom rate limiter with different limits per endpoint
 */
function endpointRateLimiter(limits) {
  return (req, res, next) => {
    const endpoint = req.path;
    const limit = limits[endpoint] || { windowMs: 1000, max: 5 };
    
    const identifier = getIdentifier(req);
    const key = `rate:${identifier}:${endpoint}`;
    const now = Date.now();
    const record = requestCounts.get(key);
    
    if (!record || now - record.windowStart > limit.windowMs) {
      requestCounts.set(key, {
        windowStart: now,
        count: 1
      });
      return next();
    }
    
    record.count++;
    
    if (record.count > limit.max) {
      return res.status(429).json({
        error: 'Too Many Requests',
        message: `Rate limit exceeded for ${endpoint}`
      });
    }
    
    next();
  };
}

// Different rate limits per endpoint
const endpointLimits = {
  '/v1/shipment-results': { windowMs: 1000, max: 10 }, // Higher for reads
  '/v1/module-results': { windowMs: 1000, max: 5 },   // Lower for writes
  '/v1/webhooks': { windowMs: 1000, max: 20 }          // Webhooks can be bursty
};

module.exports = {
  rateLimiter,
  endpointRateLimiter: endpointRateLimiter(endpointLimits),
  getRateLimitStatus,
  resetRateLimit,
  getRateLimitStats,
  getIdentifier
};