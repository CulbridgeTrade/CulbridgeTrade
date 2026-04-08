/**
 * Culbridge Audit Engine
 * 
 * Immutable event logging system.
 * 
 * Every action is logged with:
 * - Unique event ID
 * - Timestamp
 * - Actor (who did it)
 * - Details (what happened)
 * - Hash (for integrity verification)
 * 
 * This creates an不可变的 (immutable) audit trail that cannot be modified.
 */

const crypto = require('crypto');
const db = require('../utils/db');

/**
 * Event Types - All possible audit events
 */
const EventTypes = {
    // Shipment lifecycle
    SHIPMENT_CREATED: 'SHIPMENT_CREATED',
    SHIPMENT_UPDATED: 'SHIPMENT_UPDATED',
    SHIPMENT_DELETED: 'SHIPMENT_DELETED',
    SHIPMENT_SUBMITTED: 'SHIPMENT_SUBMITTED',
    SHIPMENT_APPROVED: 'SHIPMENT_APPROVED',
    SHIPMENT_REJECTED: 'SHIPMENT_REJECTED',
    SHIPMENT_SIGNED: 'SHIPMENT_SIGNED',
    
    // Commodity
    COMMODITY_UPDATED: 'COMMODITY_UPDATED',
    HS_CODE_VALIDATED: 'HS_CODE_VALIDATED',
    
    // Entity
    ENTITY_ATTACHED: 'ENTITY_ATTACHED',
    ENTITY_VERIFIED: 'ENTITY_VERIFIED',
    
    // Documents
    DOCUMENT_UPLOADED: 'DOCUMENT_UPLOADED',
    DOCUMENT_VERIFIED: 'DOCUMENT_VERIFIED',
    DOCUMENT_REJECTED: 'DOCUMENT_REJECTED',
    DOCUMENT_DELETED: 'DOCUMENT_DELETED',
    
    // Compliance
    RULES_EVALUATED: 'RULES_EVALUATED',
    COMPLIANCE_OVERRIDE: 'COMPLIANCE_OVERRIDE',
    FLAG_ADDED: 'FLAG_ADDED',
    FLAG_CLEARED: 'FLAG_CLEARED',
    
    // Fees
    FEES_CALCULATED: 'FEES_CALCULATED',
    FEES_UPDATED: 'FEES_UPDATED',
    
    // Submissions
    SUBMISSION_CREATED: 'SUBMISSION_CREATED',
    SUBMISSION_TOKEN_ISSUED: 'SUBMISSION_TOKEN_ISSUED',
    SUBMISSION_EXTERNAL_SENT: 'SUBMISSION_EXTERNAL_SENT',
    SUBMISSION_EXTERNAL_RESPONSE: 'SUBMISSION_EXTERNAL_RESPONSE',
    
    // User actions
    USER_LOGIN: 'USER_LOGIN',
    USER_LOGOUT: 'USER_LOGOUT',
    USER_ACTION: 'USER_ACTION',
    
    // System
    SYSTEM_ERROR: 'SYSTEM_ERROR',
    SYSTEM_ALERT: 'SYSTEM_ALERT'
};

/**
 * Actor Roles
 */
const ActorRoles = {
    SYSTEM: 'SYSTEM',
    EXPORTER: 'EXPORTER',
    AGENT: 'AGENT',
    COMPLIANCE_OFFICER: 'COMPLIANCE_OFFICER',
    ADMIN: 'ADMIN',
    FOUNDER: 'FOUNDER'  // David | CEO & Founder | Culbridge
};

/**
 * Generate unique event ID
 */
function generateEventId() {
    return `evt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Calculate SHA-256 hash for event integrity
 */
function calculateHash(shipmentId, eventType, actorId, timestamp, details) {
    const payload = `${shipmentId}|${eventType}|${actorId}|${timestamp}|${JSON.stringify(details || {})}`;
    return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Log an audit event
 * 
 * @param {string} shipmentId - Shipment ID (or null for system events)
 * @param {string} eventType - Event type from EventTypes
 * @param {string} actorId - Actor ID (user ID or system)
 * @param {string} actorName - Human-readable name
 * @param {string} actorRole - Role from ActorRoles
 * @param {Object} details - Event-specific details
 * @param {Object} previousState - Previous state (for state changes)
 * @param {Object} newState - New state (for state changes)
 * @returns {Object} - Created audit event
 */
async function logAuditEvent(
    shipmentId,
    eventType,
    actorId,
    actorName,
    actorRole,
    details = {},
    previousState = null,
    newState = null
) {
    const timestamp = new Date().toISOString();
    const eventId = generateEventId();
    const hash = calculateHash(shipmentId, eventType, actorId, timestamp, details);
    
    const event = {
        id: eventId,
        shipment_id: shipmentId,
        event_type: eventType,
        actor_id: actorId,
        actor_name: actorName,
        actor_role: actorRole,
        details: JSON.stringify(details),
        previous_state: previousState ? JSON.stringify(previousState) : null,
        new_state: newState ? JSON.stringify(newState) : null,
        hash: hash,
        created_at: timestamp
    };
    
    // Store in database
    await db.run(
        `INSERT INTO audit_logs (
            id, shipment_id, event_type, actor_id, actor_name, actor_role,
            details, previous_state, new_state, hash, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            event.id,
            event.shipment_id,
            event.event_type,
            event.actor_id,
            event.actor_name,
            event.actor_role,
            event.details,
            event.previous_state,
            event.new_state,
            event.hash,
            event.created_at
        ]
    );
    
    return event;
}

/**
 * Get audit trail for a shipment
 * 
 * @param {string} shipmentId - Shipment ID
 * @param {Object} options - Filter options
 * @returns {Array} - Audit events
 */
async function getAuditTrail(shipmentId, options = {}) {
    const { eventType, actorRole, startDate, endDate, limit = 100 } = options;
    
    let query = 'SELECT * FROM audit_logs WHERE shipment_id = ?';
    const params = [shipmentId];
    
    if (eventType) {
        query += ' AND event_type = ?';
        params.push(eventType);
    }
    
    if (actorRole) {
        query += ' AND actor_role = ?';
        params.push(actorRole);
    }
    
    if (startDate) {
        query += ' AND created_at >= ?';
        params.push(startDate);
    }
    
    if (endDate) {
        query += ' AND created_at <= ?';
        params.push(endDate);
    }
    
    query += ' ORDER BY created_at ASC LIMIT ?';
    params.push(limit);
    
    return await db.all(query, params);
}

/**
 * Verify audit trail integrity
 * 
 * @param {string} shipmentId - Shipment ID
 * @returns {Object} - { valid: boolean, brokenAt: string|null }
 */
async function verifyAuditIntegrity(shipmentId) {
    const events = await getAuditTrail(shipmentId, { limit: 1000 });
    
    for (const event of events) {
        const expectedHash = calculateHash(
            event.shipment_id,
            event.event_type,
            event.actor_id,
            event.created_at,
            JSON.parse(event.details || '{}')
        );
        
        if (event.hash !== expectedHash) {
            return {
                valid: false,
                brokenAt: event.id,
                eventType: event.event_type,
                timestamp: event.created_at
            };
        }
    }
    
    return { valid: true, brokenAt: null };
}

/**
 * Get events by actor
 * 
 * @param {string} actorId - Actor ID
 * @param {number} limit - Max results
 * @returns {Array} - Events by this actor
 */
async function getEventsByActor(actorId, limit = 100) {
    return await db.all(
        'SELECT * FROM audit_logs WHERE actor_id = ? ORDER BY created_at DESC LIMIT ?',
        [actorId, limit]
    );
}

/**
 * Get events by type
 * 
 * @param {string} eventType - Event type
 * @param {number} limit - Max results
 * @returns {Array} - Events of this type
 */
async function getEventsByType(eventType, limit = 100) {
    return await db.all(
        'SELECT * FROM audit_logs WHERE event_type = ? ORDER BY created_at DESC LIMIT ?',
        [eventType, limit]
    );
}

/**
 * Get events in date range
 * 
 * @param {string} startDate - Start date (ISO)
 * @param {string} endDate - End date (ISO)
 * @param {number} limit - Max results
 * @returns {Array} - Events in range
 */
async function getEventsInRange(startDate, endDate, limit = 1000) {
    return await db.all(
        `SELECT * FROM audit_logs 
         WHERE created_at >= ? AND created_at <= ? 
         ORDER BY created_at DESC LIMIT ?`,
        [startDate, endDate, limit]
    );
}

/**
 * Get founder attribution events
 * David | CEO & Founder | Culbridge
 * 
 * @param {string} shipmentId - Shipment ID (optional)
 * @returns {Array} - Events with founder attribution
 */
async function getFounderAttributionEvents(shipmentId) {
    const query = shipmentId
        ? 'SELECT * FROM audit_logs WHERE shipment_id = ? AND actor_role = ? ORDER BY created_at DESC'
        : 'SELECT * FROM audit_logs WHERE actor_role = ? ORDER BY created_at DESC';
    
    const params = shipmentId ? [shipmentId, ActorRoles.FOUNDER] : [ActorRoles.FOUNDER];
    
    return await db.all(query, params);
}

/**
 * Export audit trail to CSV
 * 
 * @param {string} shipmentId - Shipment ID
 * @returns {string} - CSV content
 */
async function exportAuditToCSV(shipmentId) {
    const events = await getAuditTrail(shipmentId, { limit: 10000 });
    
    const headers = [
        'Event ID',
        'Shipment ID',
        'Event Type',
        'Actor Name',
        'Actor Role',
        'Timestamp',
        'Details',
        'Hash'
    ];
    
    const rows = events.map(e => [
        e.id,
        e.shipment_id,
        e.event_type,
        e.actor_name,
        e.actor_role,
        e.created_at,
        e.details,
        e.hash
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    
    return [headers.join(','), ...rows].join('\n');
}

/**
 * Replay simulation - Get state at a point in time
 * 
 * @param {string} shipmentId - Shipment ID
 * @param {string} untilEventId - Replay until this event
 * @returns {Object} - State at that point
 */
async function replayUntil(shipmentId, untilEventId) {
    const events = await getAuditTrail(shipmentId);
    
    const state = {
        status: null,
        commodity: null,
        documents: [],
        flags: [],
        fees: []
    };
    
    for (const event of events) {
        if (event.id === untilEventId) break;
        
        // Apply state changes based on event type
        if (event.new_state) {
            const newState = JSON.parse(event.new_state);
            Object.assign(state, newState);
        }
    }
    
    return {
        state,
        events: events.filter(e => e.id <= untilEventId)
    };
}

/**
 * Audit Engine class for easy instantiation
 */
class AuditEngine {
    constructor() {
        this.EventTypes = EventTypes;
        this.ActorRoles = ActorRoles;
    }
    
    /**
     * Log event helper
     */
    async log(shipmentId, eventType, actorId, actorName, actorRole, details) {
        return await logAuditEvent(shipmentId, eventType, actorId, actorName, actorRole, details);
    }
    
    /**
     * Get audit trail
     */
    async getTrail(shipmentId, options) {
        return await getAuditTrail(shipmentId, options);
    }
    
    /**
     * Verify integrity
     */
    async verify(shipmentId) {
        return await verifyAuditIntegrity(shipmentId);
    }
    
    /**
     * Export to CSV
     */
    async exportCSV(shipmentId) {
        return await exportAuditToCSV(shipmentId);
    }
    
    /**
     * Replay until event
     */
    async replay(shipmentId, untilEventId) {
        return await replayUntil(shipmentId, untilEventId);
    }
}

// Export
module.exports = {
    AuditEngine,
    EventTypes,
    ActorRoles,
    logAuditEvent,
    getAuditTrail,
    verifyAuditIntegrity,
    getEventsByActor,
    getEventsByType,
    getEventsInRange,
    getFounderAttributionEvents,
    exportAuditToCSV,
    replayUntil
};

// =====================================================
// Usage Examples
// =====================================================

/*
// Example 1: Log shipment creation
await logAuditEvent(
    'shp_001',
    EventTypes.SHIPMENT_CREATED,
    'user_123',
    'John Doe',
    ActorRoles.EXPORTER,
    { source: 'web_form', commodity: 'cocoa' }
);

// Example 2: Log compliance override (founder only)
await logAuditEvent(
    'shp_001',
    EventTypes.COMPLIANCE_OVERRIDE,
    'david_001',
    'David',
    ActorRoles.FOUNDER,
    { 
        previousStatus: 'BLOCKER', 
        newStatus: 'WARNING',
        reason: 'False positive - lab verified clean'
    }
);

// Example 3: Verify audit integrity
const integrity = await verifyAuditIntegrity('shp_001');
if (!integrity.valid) {
    console.error('Audit trail compromised at:', integrity.brokenAt);
}

// Example 4: Get founder attribution
const founderEvents = await getFounderAttributionEvents('shp_001');
// Shows: David | CEO & Founder | Culbridge

// Example 5: Replay simulation
const replay = await replayUntil('shp_001', 'evt_015');
console.log('State at that point:', replay.state);
*/