/**
 * Culbridge Identity Metadata Module
 * 
 * Implements founder and team metadata for audit-safe attribution
 * Founder: David | CEO & Founder | Culbridge
 * Team: Culbridge Team – engineered responsibly
 * 
 * Usage: Internal dashboards, audit logs, SOPs, reports
 * NEVER: Customer-facing, financial payloads, sensitive data
 */

const { run, get, all } = require('../utils/db');

/**
 * Identity Metadata Configuration
 */
const IDENTITY_CONFIG = {
  founder: {
    name: 'David',
    title: 'CEO & Founder',
    company: 'Culbridge',
    role_id: 'FOUNDER_OVERSIGHT',
    visible_to: 'internal_only',
    // Read-only - cannot approve transactions, bypass checks, or access sensitive ops
    permissions: ['oversight_view', 'audit_read']
  },
  team: {
    name: 'Culbridge Team',
    credit_phrase: 'Culbridge Team – engineered responsibly',
    role_id: 'TEAM_CREDIT',
    visible_to: 'internal_only',
    // No operational control - just attribution
    permissions: []
  }
};

/**
 * Initialize identity metadata tables
 */
async function initializeIdentityTables() {
  // Identity registry (read-only)
  await run(`
    CREATE TABLE IF NOT EXISTS IdentityRegistry (
      id INTEGER PRIMARY KEY,
      identity_type TEXT NOT NULL, -- 'FOUNDER' or 'TEAM'
      name TEXT NOT NULL,
      title TEXT,
      company TEXT,
      role_id TEXT NOT NULL,
      credit_phrase TEXT,
      visible_to TEXT DEFAULT 'internal_only',
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Insert default identities if not exist
  await run(
    `INSERT OR IGNORE INTO IdentityRegistry 
     (id, identity_type, name, title, company, role_id, credit_phrase, visible_to) 
     VALUES (1, 'FOUNDER', 'David', 'CEO & Founder', 'Culbridge', 'FOUNDER_OVERSIGHT', NULL, 'internal_only')`
  );
  
  await run(
    `INSERT OR IGNORE INTO IdentityRegistry 
     (id, identity_type, name, title, company, role_id, credit_phrase, visible_to) 
     VALUES (2, 'TEAM', 'Culbridge Team', NULL, 'Culbridge', 'TEAM_CREDIT', 'Culbridge Team – engineered responsibly', 'internal_only')`
  );
  
  console.log('Identity metadata tables initialized');
}

/**
 * Get founder metadata (internal only)
 */
function getFounderMetadata() {
  return {
    founder_name: IDENTITY_CONFIG.founder.name,
    title: IDENTITY_CONFIG.founder.title,
    company: IDENTITY_CONFIG.founder.company,
    role_id: IDENTITY_CONFIG.founder.role_id,
    visible_to: IDENTITY_CONFIG.founder.visible_to
  };
}

/**
 * Get team metadata (internal only)
 */
function getTeamMetadata() {
  return {
    team_name: IDENTITY_CONFIG.team.name,
    credit_phrase: IDENTITY_CONFIG.team.credit_phrase,
    role_id: IDENTITY_CONFIG.team.role_id,
    visible_to: IDENTITY_CONFIG.team.visible_to
  };
}

/**
 * Format founder attribution for logs/reports
 */
function formatFounderAttribution() {
  return `David | CEO & Founder | Culbridge`;
}

/**
 * Format team attribution for logs/reports
 */
function formatTeamAttribution() {
  return `Culbridge Team – engineered responsibly`;
}

/**
 * Create audit entry with founder/team attribution
 */
async function logWithAttribution(shipmentId, event, details = {}) {
  const attribution = {
    reviewed_by: formatFounderAttribution(),
    team_credit: formatTeamAttribution(),
    timestamp: new Date().toISOString()
  };
  
  // Merge with details
  const enrichedDetails = {
    ...details,
    ...attribution
  };
  
  // Store in audit log (using existing audit system)
  await run(
    `INSERT INTO AuditLogs (shipment_id, module, action, actor, outcome, details) VALUES (?, ?, ?, ?, ?, ?)`,
    [shipmentId, 'identity_metadata', event, 'system', 'SUCCESS', JSON.stringify(enrichedDetails)]
  );
  
  return enrichedDetails;
}

/**
 * Get attribution for internal dashboard
 */
function getInternalAttribution() {
  return {
    founder: formatFounderAttribution(),
    team: formatTeamAttribution(),
    // Include founder metadata for detailed view
    founder_metadata: getFounderMetadata(),
    team_metadata: getTeamMetadata()
  };
}

/**
 * Add attribution to internal reports
 */
function addAttributionToReport(report) {
  // Only add to internal reports
  if (report.internal !== true) {
    return report;
  }
  
  return {
    ...report,
    attribution: getInternalAttribution()
  };
}

/**
 * Check if data should include identity metadata
 * Returns false for: customer-facing, financial payloads, sensitive data
 */
function shouldIncludeAttribution(context) {
  const allowedContexts = [
    'internal_dashboard',
    'audit_log',
    'sop',
    'internal_report',
    'internal_notification',
    'compliance_report'
  ];
  
  return allowedContexts.includes(context);
}

/**
 * Remove identity metadata from restricted contexts
 */
function sanitizeForContext(data, context) {
  if (!shouldIncludeAttribution(context)) {
    // Remove attribution fields if present
    const sanitized = { ...data };
    delete sanitized.attribution;
    delete sanitized.reviewed_by;
    delete sanitized.team_credit;
    return sanitized;
  }
  
  return data;
}

/**
 * Get identity metadata for database storage
 */
async function getIdentityFromDB(identityType) {
  const identity = await get(
    `SELECT * FROM IdentityRegistry WHERE identity_type = ? AND active = 1`,
    [identityType]
  );
  
  return identity;
}

// Initialize on module load
initializeIdentityTables().catch(console.error);

module.exports = {
  IDENTITY_CONFIG,
  initializeIdentityTables,
  getFounderMetadata,
  getTeamMetadata,
  formatFounderAttribution,
  formatTeamAttribution,
  logWithAttribution,
  getInternalAttribution,
  addAttributionToReport,
  shouldIncludeAttribution,
  sanitizeForContext,
  getIdentityFromDB
};