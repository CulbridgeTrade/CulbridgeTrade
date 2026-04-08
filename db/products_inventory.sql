
-- Product & Inventory for Odoo sync
CREATE TABLE IF NOT EXISTS ProductsInventory (
  product_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  quantity_available INTEGER DEFAULT 0,
  unit_price_eur REAL,
  warehouse_location TEXT,
  shipment_ids JSON,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

