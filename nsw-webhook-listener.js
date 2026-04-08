const express = require('express');
const { run } = require('./utils/db');

const app = express();
app.use(express.json());

app.post('/nsw-webhook', async (req, res) => {
  const { shipment_id, event_type, status, port_event } = req.body;
  
  // NSW Events: Cargo Arrived, Scanning Complete, Exit Note
  const eventData = {
    shipment_id,
    event_type, // 'cargo_arrived_apapa', 'scanning_completed', 'exit_note_issued'
    status,
    port_event,
    sgd_number: req.body.sgd_number,
    received_at: new Date().toISOString(),
    raw_payload: JSON.stringify(req.body)
  };

  // Update shipment status
  await run('UPDATE Shipments SET nsw_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [status, shipment_id]);

// Store to NSWWebhookEvents
  await run(`INSERT INTO NSWWebhookEvents (shipment_id, sgd_number, event_type, submission_status, priority_lane, status, port_event, raw_payload)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
    shipment_id,
    eventData.sgd_number || null,
    event_type,
    status,
    eventData.priority_lane || null,
    port_event || null,
    JSON.stringify(req.body)
  ]);

  // TRIGGER PASS_HANDLER when clearance confirmed
  if (event_type === 'exit_note_issued' || status === 'CLEARED') {
    try {
      const { PassHandlerService } = require('./services/pass-handler');
      const passHandler = new PassHandlerService();
      
      await passHandler.recordPassOutcome({
        shipment_id,
        real_world_outcome: 'PASSED',
        clearance_reference: eventData.sgd_number || `NSW-${Date.now()}`,
        port: port_event || 'Apapa',
        notes: `Auto-triggered from NSW webhook: ${event_type}`
      });
      
      console.log(`PASS_HANDLER triggered for ${shipment_id} - outcome recorded`);
    } catch (e) {
      console.error(`PASS_HANDLER trigger failed for ${shipment_id}:`, e);
    }
  }

  // Trigger downstream workflows
  console.log(`NSW Event: ${event_type} for ${shipment_id} → status: ${status}`);

  res.json({ received: true });
});


app.listen(3003, () => {
  console.log('NSW Webhook Listener: http://localhost:3003/nsw-webhook');
});

module.exports = app;

