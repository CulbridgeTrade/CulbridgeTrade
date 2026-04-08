
-- Exporter Financial Profile
CREATE TABLE IF NOT EXISTS ExporterFinancial (
  exporter_id TEXT PRIMARY KEY,
  stellar_wallet_public TEXT,
  stellar_wallet_encrypted TEXT,
  preferred_currency TEXT DEFAULT 'EUR',
  stablecoin TEXT DEFAULT 'USDC',
  fx_threshold REAL DEFAULT 0.05,
  auto_adjust_price BOOLEAN DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (exporter_id) REFERENCES Shipments(exporter_id)
);

