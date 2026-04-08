/**
 * Authentication Middleware - RBAC Implementation
 * 
 * FIXES: No auth system - All endpoints unprotected
 */

const jwt = require('jsonwebtoken');

// Role definitions
const ROLES = {
  ADMIN: 'admin',
  COMPLIANCE_OFFICER: 'compliance_officer',
  EXPORTER: 'exporter',
  VIEWER: 'viewer'
};

// Permission matrix
const PERMISSIONS = {
  [ROLES.ADMIN]: [
    'shipments:read', 'shipments:write', 'shipments:delete',
    'labs:read', 'labs:write',
    'rules:read', 'rules:write',
    'reports:read', 'reports:write',
    'users:read', 'users:write', 'users:delete',
    'settings:read', 'settings:write'
  ],
  [ROLES.COMPLIANCE_OFFICER]: [
    'shipments:read', 'shipments:write',
    'labs:read',
    'rules:read',
    'reports:read'
  ],
  [ROLES.EXPORTER]: [
    'shipments:read', 'shipments:write',
    'reports:read'
  ],
  [ROLES.VIEWER]: [
    'shipments:read',
    'reports:read'
  ]
};

// JWT Secret (in production, use environment variable)
const JWT_SECRET = process.env.JWT_SECRET || 'culbridge-secret-change-in-production';

/**
 * Generate JWT token
 */
function generateToken(user) {
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
    permissions: PERMISSIONS[user.role] || []
  };
  
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
}

/**
 * Verify JWT token
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

/**
 * Authentication middleware
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  const token = authHeader.substring(7);
  const decoded = verifyToken(token);
  
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  
  // Attach user to request
  req.user = decoded;
  next();
}

/**
 * Authorization middleware - check permission
 */
function authorize(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    if (!req.user.permissions || !req.user.permissions.includes(permission)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    
    next();
  };
}

/**
 * RBAC enforcement for sensitive actions
 * Mandatory checks before lab/document uploads or rule changes
 */
function checkPermission(user, action, resource) {
  const permission = `${resource}:${action}`;
  
  if (!user.permissions || !user.permissions.includes(permission)) {
    return { 
      allowed: false, 
      error: `BLOCKER: User ${user.id} cannot perform ${action} on ${resource}` 
    };
  }
  
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
      // Log the blocked attempt
      console.error(`[RBAC BLOCKED] User: ${req.user.id}, Action: ${action}, Resource: ${resource}`);
      return res.status(403).json({ error: check.error });
    }
    
    next();
  };
}

/**
 * Role check middleware
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient role' });
    }
    
    next();
  };
}

/**
 * Rate limiter (simple in-memory implementation)
 * In production, use Redis
 */
const rateLimitStore = new Map();

function rateLimit(maxRequests = 100, windowMs = 60000) {
  return (req, res, next) => {
    const key = req.user?.id || req.ip;
    const now = Date.now();
    
    if (!rateLimitStore.has(key)) {
      rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
      return next();
    }
    
    const record = rateLimitStore.get(key);
    
    if (now > record.resetTime) {
      rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
      return next();
    }
    
    if (record.count >= maxRequests) {
      return res.status(429).json({ error: 'Too many requests' });
    }
    
    record.count++;
    next();
  };
}

/**
 * API Key authentication for services
 */
function authenticateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    return res.status(401).json({ error: 'No API key provided' });
  }
  
  // In production, validate against stored keys
  const validKeys = (process.env.VALID_API_KEYS || '').split(',');
  
  if (!validKeys.includes(apiKey)) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  
  next();
}

module.exports = {
  ROLES,
  PERMISSIONS,
  generateToken,
  verifyToken,
  authenticate,
  authorize,
  requireRole,
  rateLimit,
  authenticateApiKey
};