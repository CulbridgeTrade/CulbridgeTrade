-- RASFF Alerts Table
-- Rapid Alert System for Food and Feed alerts

CREATE TABLE IF NOT EXISTS rasff_alerts (
  id SERIAL PRIMARY KEY,
  product TEXT NOT NULL,
  hazard TEXT NOT NULL,
  origin_country TEXT NOT NULL,
  action TEXT NOT NULL, -- rejected, border_rejected, destroyed, recalled, warning
  port TEXT,
  alert_date DATE NOT NULL,
  reference_number TEXT,
  notified_by TEXT,
  distribution TEXT,
  raw_data JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_rasff_product ON rasff_alerts(product);
CREATE INDEX IF NOT EXISTS idx_rasff_origin ON rasff_alerts(origin_country);
CREATE INDEX IF NOT EXISTS idx_rasff_port ON rasff_alerts(port);
CREATE INDEX IF NOT EXISTS idx_rasff_date ON rasff_alerts(alert_date);
CREATE INDEX IF NOT EXISTS idx_rasff_hazard ON rasff_alerts(hazard);

-- Derived metrics table
CREATE TABLE IF NOT EXISTS rasff_metrics (
  id SERIAL PRIMARY KEY,
  product TEXT,
  origin_country TEXT,
  port TEXT,
  period_start DATE,
  period_end DATE,
  total_alerts INTEGER DEFAULT 0,
  total_rejections INTEGER DEFAULT 0,
  rejection_rate FLOAT DEFAULT 0,
  top_hazards JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sample alerts
INSERT INTO rasff_alerts (product, hazard, origin_country, action, port, alert_date) VALUES
  ('sesame seeds', 'salmonella', 'Nigeria', 'rejected', 'Rotterdam', '2026-03-15'),
  ('sesame seeds', 'salmonella', 'Nigeria', 'rejected', 'Hamburg', '2026-03-12'),
  ('sesame seeds', 'salmonella', 'Nigeria', 'rejected', 'Antwerp', '2026-03-10'),
  ('sesame seeds', 'salmonella', 'Nigeria', 'rejected', 'Rotterdam', '2026-03-08'),
  ('sesame seeds', 'pesticide', 'Nigeria', 'rejected', 'Hamburg', '2026-03-05'),
  ('sesame seeds', 'pesticide', 'Nigeria', 'border_rejected', 'Rotterdam', '2026-03-01'),
  ('sesame seeds', 'salmonella', 'Nigeria', 'rejected', 'Antwerp', '2026-02-25'),
  ('sesame seeds', 'aflatoxin', 'Nigeria', 'rejected', 'Rotterdam', '2026-02-20'),
  ('groundnuts', 'aflatoxin', 'Nigeria', 'rejected', 'Rotterdam', '2026-03-14'),
  ('groundnuts', 'aflatoxin', 'Nigeria', 'rejected', 'Hamburg', '2026-03-09'),
  ('groundnuts', 'aflatoxin', 'Nigeria', 'destroyed', 'Antwerp', '2026-03-04'),
  ('cocoa beans', 'heavy metals', 'Nigeria', 'border_rejected', 'Rotterdam', '2026-03-11'),
  ('cocoa beans', 'pesticide', 'Nigeria', 'rejected', 'Hamburg', '2026-02-26'),
  ('cashew nuts', 'pesticide', 'Nigeria', 'rejected', 'Rotterdam', '2026-03-07'),
  ('cashew nuts', 'salmonella', 'Nigeria', 'rejected', 'Hamburg', '2026-02-23'),
  ('ginger', 'pesticide', 'Nigeria', 'rejected', 'Rotterdam', '2026-03-13'),
  ('ginger', 'pesticide', 'Nigeria', 'border_rejected', 'Hamburg', '2026-03-06');
