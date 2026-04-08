/**
 * Event System - Sequencing + Causality + Deterministic Replay
 * 
 * Features:
 * - Event sequencing validation (C100 → C101 → C102 order)
 * - Event idempotency for webhook deduplication
 * - Dead Letter Queue for failures
 * - Deterministic replay engine
 * - Causal chain tracking
 */

const crypto = require('crypto');
const { run, get, all } = require('./utils/db');

// Valid NSW event sequence
const VALID_EVENT_SEQUENCE = {
  'C100': ['C101'],     // SUBMITTED can go to PROCESSING
  'C101': ['C102', 'C103'],  // PROCESSING can go to ACCEPTED or REJECTED
  'C102': ['C104', 'C105'],  // ACCEPTED can go to CLEAR or DELIVERED
  'C103': [],           // REJECTED is terminal
  'C104': ['C105'],     // CLEAR can go to DELIVERED
  'C105': []           // DELIVERED is terminal
};

/**
 * Initialize event system tables
 */
async function initializeEventTables() {
  // Event store with causal chain
  await run(`
    CREATE TABLE IF NOT EXISTS EventStore (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shipment_id TEXT NOT NULL,
      event_id TEXT NOT NULL UNIQUE,
      event_type TEXT NOT NULL,
      previous_event_id TEXT,
      causation_chain TEXT,
      payload TEXT,
      timestamp DATETIME NOT NULL,
      received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      processed INTEGER DEFAULT 0,
      processed_at DATETIME,
      processing_error TEXT,
      UNIQUE(shipment_id, event_type, timestamp)
    )
  `);
  
  // Dead Letter Queue
  await run(`
    CREATE TABLE IF NOT EXISTS DeadLetterQueue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL,
      shipment_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload TEXT,
      failure_reason TEXT NOT NULL,
      retry_count INTEGER DEFAULT 0,
      max_retries INTEGER DEFAULT 3,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_retry_at DATETIME
    )
  `);
  
  // Event idempotency keys
  await run(`
    CREATE TABLE IF NOT EXISTS EventIdempotency (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      idempotency_key TEXT NOT NULL UNIQUE,
      shipment_id TEXT NOT NULL,
      event_id TEXT NOT NULL,
      processed INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  console.log('Event system tables initialized');
}

/**
 * Validate event sequence
 */
async function validateEventSequence(shipmentId, newEventType) {
  // Get all events for this shipment in order
  const events = await all(
    `SELECT event_type, event_id, timestamp FROM EventStore 
     WHERE shipment_id = ? ORDER BY timestamp ASC`,
    [shipmentId]
  );
  
  if (events.length === 0) {
    // First event must be C100
    if (newEventType !== 'C100') {
      return {
        valid: false,
        error: 'FIRST_EVENT_MUST_BE_C100',
        message: `First event for shipment must be C100 (SUBMITTED), got ${newEventType}`
      };
    }
    return { valid: true, previous_event: null };
  }
  
  const lastEvent = events[events.length - 1];
  const validNextEvents = VALID_EVENT_SEQUENCE[lastEvent.event_type] || [];
  
  if (!validNextEvents.includes(newEventType)) {
    return {
      valid: false,
      error: 'INVALID_SEQUENCE',
      message: `Cannot transition from ${lastEvent.event_type} to ${newEventType}. Valid: ${validNextEvents.join(', ')}`,
      last_event: lastEvent.event_type,
      attempted_event: newEventType
    };
  }
  
  return { valid: true, previous_event: lastEvent.event_id };
}

/**
 * Process event with idempotency
 */
async function processEvent(shipmentId, eventType, eventData = {}) {
  // Generate idempotency key
  const idempotencyKey = generateEventIdempotencyKey(shipmentId, eventType, eventData);
  
  // Check if already processed
  const existing = await get(
    `SELECT * FROM EventIdempotency WHERE idempotency_key = ? AND processed = 1`,
    [idempotencyKey]
  );
  
  if (existing) {
    return {
      idempotent: true,
      already_processed: true,
      event_id: existing.event_id,
      message: 'Event already processed'
    };
  }
  
  // Validate sequence
  const sequenceCheck = await validateEventSequence(shipmentId, eventType);
  
  if (!sequenceCheck.valid) {
    // Instead of failing, check if this is an out-of-order event we can handle
    if (sequenceCheck.error === 'INVALID_SEQUENCE') {
      // Could be duplicate or late event - check if already exists
      const duplicateCheck = await get(
        `SELECT * FROM EventStore WHERE shipment_id = ? AND event_type = ?`,
        [shipmentId, eventType]
      );
      
      if (duplicateCheck) {
        // Mark as idempotent duplicate
        await run(
          `INSERT OR IGNORE INTO EventIdempotency (idempotency_key, shipment_id, event_id, processed) VALUES (?, ?, ?, ?)`,
          [idempotencyKey, shipmentId, duplicateCheck.event_id, 1]
        );
        
        return {
          idempotent: true,
          duplicate: true,
          message: 'Duplicate event ignored'
        };
      }
    }
    
    // Not a duplicate - sequence violation
    return {
      valid: false,
      error: sequenceCheck.error,
      message: sequenceCheck.message,
      add_to_dlq: true
    };
  }
  
  // Generate event ID
  const eventId = `EVT-${shipmentId}-${eventType}-${Date.now()}`;
  
  // Store event with causal chain
  const causationChain = sequenceCheck.previous_event 
    ? [sequenceCheck.previous_event]
    : [];
  
  await run(
    `INSERT INTO EventStore 
     (shipment_id, event_id, event_type, previous_event_id, causation_chain, payload, timestamp) 
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [shipmentId, eventId, eventType, sequenceCheck.previous_event, 
     JSON.stringify(causationChain), JSON.stringify(eventData), 
     eventData.timestamp || new Date().toISOString()]
  );
  
  // Mark as idempotent processed
  await run(
    `INSERT OR IGNORE INTO EventIdempotency (idempotency_key, shipment_id, event_id, processed) VALUES (?, ?, ?, ?)`,
    [idempotencyKey, shipmentId, eventId, 1]
  );
  
  return {
    valid: true,
    stored: true,
    event_id: eventId,
    previous_event: sequenceCheck.previous_event
  };
}

/**
 * Generate idempotency key for event
 */
function generateEventIdempotencyKey(shipmentId, eventType, eventData) {
  const keyData = [
    shipmentId,
    eventType,
    eventData.status || '',
    eventData.timestamp || ''
  ].join('|');
  
  return crypto.createHash('sha256').update(keyData).digest('hex');
}

/**
 * Add failed event to Dead Letter Queue
 */
async function addToDeadLetterQueue(eventId, shipmentId, eventType, payload, reason) {
  await run(
    `INSERT INTO DeadLetterQueue (event_id, shipment_id, event_type, payload, failure_reason) VALUES (?, ?, ?, ?, ?)`,
    [eventId, shipmentId, eventType, JSON.stringify(payload), reason]
  );
  
  return { added: true, event_id: eventId };
}

/**
 * Retry events from Dead Letter Queue
 */
async function retryDeadLetterEvents() {
  const deadEvents = await all(
    `SELECT * FROM DeadLetterQueue WHERE retry_count < max_retries ORDER BY created_at ASC`
  );
  
  const results = [];
  
  for (const event of deadEvents) {
    // Increment retry count
    await run(
      `UPDATE DeadLetterQueue SET retry_count = ?, last_retry_at = ? WHERE id = ?`,
      [event.retry_count + 1, new Date().toISOString(), event.id]
    );
    
    // Attempt to reprocess
    const payload = event.payload ? JSON.parse(event.payload) : {};
    const reprocessResult = await processEvent(event.shipment_id, event.event_type, payload);
    
    if (reprocessResult.valid) {
      // Success - remove from DLQ
      await run(`DELETE FROM DeadLetterQueue WHERE id = ?`, [event.id]);
      results.push({ event_id: event.event_id, status: 'RECOVERED' });
    } else if (event.retry_count + 1 >= event.max_retries) {
      // Max retries reached - keep in DLQ for manual review
      results.push({ event_id: event.event_id, status: 'MAX_RETRIES_REACHED' });
    } else {
      results.push({ event_id: event.event_id, status: 'RETRY_FAILED' });
    }
  }
  
  return results;
}

/**
 * Deterministic replay - reconstruct exact state from events
 */
async function deterministicReplay(shipmentId) {
  // Get all events in order
  const events = await all(
    `SELECT * FROM EventStore WHERE shipment_id = ? ORDER BY timestamp ASC`,
    [shipmentId]
  );
  
  // Build state by applying each event in order
  let state = {
    status: 'UNKNOWN',
    sgd_number: null,
    priority_lane: null,
    events_applied: [],
    final_state: null
  };
  
  for (const event of events) {
    const payload = event.payload ? JSON.parse(event.payload) : {};
    
    // Apply event to state (deterministic)
    switch (event.event_type) {
      case 'C100':
        state.status = 'SUBMITTED';
        break;
      case 'C101':
        state.status = 'PROCESSING';
        break;
      case 'C102':
        state.status = 'ACCEPTED';
        state.sgd_number = payload.sgd_number || state.sgd_number;
        state.priority_lane = payload.priority_lane || 'STANDARD';
        break;
      case 'C103':
        state.status = 'REJECTED';
        state.rejection_reason = payload.rejection_reason;
        break;
      case 'C104':
        state.status = 'CLEAR';
        break;
      case 'C105':
        state.status = 'DELIVERED';
        break;
    }
    
    state.events_applied.push(event.event_id);
  }
  
  state.final_state = state.status;
  
  return state;
}

/**
 * Get event history for shipment
 */
async function getEventHistory(shipmentId) {
  const events = await all(
    `SELECT event_id, event_type, timestamp, processed, causation_chain 
     FROM EventStore WHERE shipment_id = ? ORDER BY timestamp ASC`,
    [shipmentId]
  );
  
  return events.map(e => ({
    event_id: e.event_id,
    event_type: e.event_type,
    timestamp: e.timestamp,
    processed: !!e.processed,
    causation_chain: e.causation_chain ? JSON.parse(e.causation_chain) : []
  }));
}

/**
 * Get Dead Letter Queue status
 */
async function getDeadLetterQueueStatus() {
  const total = await get(`SELECT COUNT(*) as count FROM DeadLetterQueue`);
  const byType = await all(
    `SELECT event_type, COUNT(*) as count FROM DeadLetterQueue GROUP BY event_type`
  );
  
  return {
    total: total.count,
    by_type: byType
  };
}

// Auto-initialize
initializeEventTables().catch(console.error);

module.exports = {
  VALID_EVENT_SEQUENCE,
  initializeEventTables,
  validateEventSequence,
  processEvent,
  addToDeadLetterQueue,
  retryDeadLetterEvents,
  deterministicReplay,
  getEventHistory,
  getDeadLetterQueueStatus
};