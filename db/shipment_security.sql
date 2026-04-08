
-- Shipment Security & Route Log table
CREATE TABLE IF NOT EXISTS ShipmentSecurity (
  shipment_id TEXT PRIMARY KEY,
  route JSON, -- [{"lat":6.52, "lon":3.38, "timestamp":"...", "status":"clear"}]
  recommended_route JSON,
  e_seal_status TEXT DEFAULT 'INTACT',
  risk_score REAL DEFAULT 0.0,
  audit_logs JSON,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shipment_id) REFERENCES Shipments(id)
);

