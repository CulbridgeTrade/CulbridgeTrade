
-- Shipment Financial Record
CREATE TABLE IF NOT EXISTS ShipmentFinancial (
  shipment_id TEXT PRIMARY KEY,
  invoice_amount_eur REAL,
  expected_loss_usd REAL DEFAULT 0,
  hedge_adjusted BOOLEAN DEFAULT FALSE,
  hedge_action_taken TEXT,
  payment_status TEXT DEFAULT 'PENDING',
  stellar_tx_id TEXT,
  audit_logs JSON,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shipment_id) REFERENCES Shipments(id)
);

