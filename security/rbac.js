/**
 * RBAC Middleware - Role-Based Access Control
 * Enforces least privilege enforcement for Admin, Finance, Compliance, API, Worker roles
 */

const { get, all } = require('../utils/db');

// Role definitions with permissions
const ROLES = {
  ADMIN: {
    name: 'Admin',
    permissions: ['*'] // All permissions
  },
  FINANCE: {
    name: 'Finance',
    permissions: [
      'fee:read',
      'fee:calculate',
      'ledger:read',
      'ledger:write',
      'payment:verify',
      'shipment:read'
    ]
  },
  COMPLIANCE: {
    name: 'Compliance',
    permissions: [
      'compliance:read',
      'compliance:write',
      'audit:read',
      'shipment:read',
      'document:read'
    ]
  },
  API: {
    name: 'API',
    permissions: [
      'shipment:read',
      'shipment:write',
      'module:read',
      'module:write',
      'webhook:read',
      'webhook:write'
    ]
  },
  WORKER: {
    name: 'Worker',
    permissions: [
      'shipment:read',
      'module:read',
      'webhook:read'
    ]
  }
};

/**
 * Check if user has required permission
 */
function hasPermission(userRole, requiredPermission) {
  const role = ROLES[userRole];
  if (!role) return false;
  
  // Admin has wildcard access
  if (role.permissions.includes('*')) return true;
  
  // Check exact match or pattern
  return role.permissions.some(p => {
    if (p === requiredPermission) return true;
    // Support wildcard patterns like 'fee:*'
    const pattern = p.replace('*', '.*');
    return new RegExp(`^${pattern}$`).test(requiredPermission);
  });
}

/**
 * RBAC Authorization middleware
 * @param {string} permission - Required permission (e.g., 'shipment:read', 'fee:write')
 */
function authorize(permission) {
  return async (req, res, next) => {
    // Get user role from JWT token (set by auth middleware)
    const userRole = req.user?.role || req.user?.user_type;
    
    if (!userRole) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'User role not found in token'
      });
    }
    
    // Check permission
    if (!hasPermission(userRole, permission)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Role '${userRole}' does not have permission '${permission}'`,
        required: permission,
        user_role: userRole
      });
    }
    
    next();
  };
}

/**
 * Check multiple permissions (all required)
 */
function authorizeAll(...permissions) {
  return async (req, res, next) => {
    const userRole = req.user?.role || req.user?.user_type;
    
    if (!userRole) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'User role not found'
      });
    }
    
    for (const permission of permissions) {
      if (!hasPermission(userRole, permission)) {
        return res.status(403).json({
          error: 'Forbidden',
          message: `Missing required permission: ${permission}`,
          required: permissions,
          user_role: userRole
        });
      }
    }
    
    next();
  };
}

/**
 * Check any permission (at least one required)
 */
function authorizeAny(...permissions) {
  return async (req, res, next) => {
    const userRole = req.user?.role || req.user?.user_type;
    
    if (!userRole) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'User role not found'
      });
    }
    
    const hasAny = permissions.some(p => hasPermission(userRole, p));
    
    if (!hasAny) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `None of these permissions allowed: ${permissions.join(', ')}`,
        required: permissions,
        user_role: userRole
      });
    }
    
    next();
  };
}

/**
 * Get role permissions for a user
 */
async function getUserPermissions(userId) {
  const user = await get(
    `SELECT role FROM Users WHERE id = ?`,
    [userId]
  );
  
  if (!user) return [];
  
  const role = ROLES[user.role];
  return role ? role.permissions : [];
}

/**
 * Get all available roles
 */
function getRoles() {
  return Object.entries(ROLES).map(([key, value]) => ({
    id: key,
    name: value.name,
    permissions: value.permissions
  }));
}

/**
 * Validate role exists
 */
function isValidRole(role) {
  return !!ROLES[role];
}

// Middleware chain examples:
// const requireAdmin = authorize('*');
// const requireFinance = authorize('ledger:write');
// const requireShipmentRead = authorize('shipment:read');
// const requireModuleOrCompliance = authorizeAny('module:read', 'compliance:read');
// const requireShipmentAndPayment = authorizeAll('shipment:read', 'payment:verify');

module.exports = {
  ROLES,
  authorize,
  authorizeAll,
  authorizeAny,
  hasPermission,
  getUserPermissions,
  getRoles,
  isValidRole
};