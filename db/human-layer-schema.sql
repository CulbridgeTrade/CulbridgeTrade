-- Human Layer Schema
-- Legal, Financial, Social & Environmental Preconditions

-- Exporter registration with legal/financial data
CREATE TABLE IF NOT EXISTS exporter_human_layer (
    exporter_id TEXT PRIMARY KEY,
    
    -- Legal Preconditions
    nepc_certificate JSONB,
    form_nxp JSONB,
    sps_certificates JSONB,
    
    -- Financial Incentives
    eeg JSONB,
    pioneer_status JSONB,
    import_duty_waivers JSONB,
    
    -- Social/Environmental Compliance
    social_env_compliance JSONB,
    
    -- Verified Buyers
    verified_buyers JSONB,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP
);

-- Shipment Human Layer validation
CREATE TABLE IF NOT EXISTS shipment_human_validation (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shipment_id TEXT NOT NULL,
    exporter_id TEXT NOT NULL,
    
    -- Validation results
    legal_valid BOOLEAN,
    financial_valid BOOLEAN,
    social_env_valid BOOLEAN,
    buyer_requirements_met BOOLEAN,
    
    -- Audit
    validation_result TEXT,
    validated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(shipment_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_exporter ON exporter_human_layer(exporter_id);
CREATE INDEX IF NOT EXISTS idx_shipment_validation ON shipment_human_validation(shipment_id);

-- End Human Layer Schema
