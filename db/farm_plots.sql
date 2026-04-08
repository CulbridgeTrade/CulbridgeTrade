
-- Farm Plot for EUDR/Carbon
CREATE TABLE IF NOT EXISTS FarmPlots (
  farm_id TEXT PRIMARY KEY,
  geo_polygon JSON, -- [[lat,lon], ...]
  deforestation_risk REAL DEFAULT 0.0,
  sentinel_last_checked DATETIME,
  gfw_last_checked DATETIME,
  carbon_credit_potential REAL DEFAULT 0.0,
  FOREIGN KEY (farm_id) REFERENCES Shipments(farmer_id) -- link via shipment
);

