-- Culbridge Authentication Database Schema
-- User accounts, sessions, OTP verification

-- ============================================
-- Users table
-- ============================================

CREATE TABLE IF NOT EXISTS Users (
    id VARCHAR(50) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(64) NOT NULL,
    salt VARCHAR(32) NOT NULL,
    role VARCHAR(20) DEFAULT 'EXPORTER' CHECK (role IN ('EXPORTER', 'AGENT', 'ADMIN', 'COMPLIANCE')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login_at DATETIME,
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DELETED')),
    INDEX idx_email (email),
    INDEX idx_role (role)
);

-- ============================================
-- Entities (Companies/Exporters)
-- ============================================

CREATE TABLE IF NOT EXISTS Entities (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    tin VARCHAR(20) UNIQUE NOT NULL,
    address TEXT,
    rc_number VARCHAR(50),
    tier VARCHAR(20) DEFAULT 'STANDARD' CHECK (tier IN ('STANDARD', 'PREMIUM', 'AEO')),
    is_verified BOOLEAN DEFAULT 0,
    aeo_status BOOLEAN DEFAULT 0,
    aeo_expiry_date DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES Users(id),
    INDEX idx_user (user_id),
    INDEX idx_tin (tin)
);

-- ============================================
-- Sessions table
-- ============================================

CREATE TABLE IF NOT EXISTS Sessions (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL,
    token VARCHAR(64) NOT NULL,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_activity_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(45),
    user_agent TEXT,
    FOREIGN KEY (user_id) REFERENCES Users(id),
    INDEX idx_user (user_id),
    INDEX idx_token_hash (token_hash),
    INDEX idx_expires (expires_at)
);

-- ============================================
-- OTP table
-- ============================================

CREATE TABLE IF NOT EXISTS OTPs (
    id VARCHAR(50) PRIMARY KEY,
    request_id VARCHAR(50) UNIQUE NOT NULL,
    phone VARCHAR(20) NOT NULL,
    code VARCHAR(4) NOT NULL,
    purpose VARCHAR(50) DEFAULT 'SIGNUP',
    expires_at DATETIME NOT NULL,
    used BOOLEAN DEFAULT 0,
    verified_at DATETIME,
    attempts INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_phone (phone),
    INDEX idx_request (request_id),
    INDEX idx_expires (expires_at)
);

-- ============================================
-- User Export Categories
-- ============================================

CREATE TABLE IF NOT EXISTS UserExportCategories (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL,
    category VARCHAR(50) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES Users(id),
    UNIQUE(user_id, category),
    INDEX idx_user (user_id)
);

-- ============================================
-- Authentication Logs (Audit)
-- ============================================

CREATE TABLE IF NOT EXISTS AuthLogs (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50),
    event_type VARCHAR(50) NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    details JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user (user_id),
    INDEX idx_event (event_type),
    INDEX idx_created (created_at)
);

-- ============================================
-- Sample Users (for testing)
-- ============================================

INSERT OR IGNORE INTO Users (id, email, password_hash, salt, role, status)
VALUES 
('USER-001', 'admin@culbridge.com', 'a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd', 'salt001', 'ADMIN', 'ACTIVE'),
('USER-002', 'exporter@acme.com', 'b2c3d4e5f6789012345678901234567890123456789012345678901234abcd', 'salt002', 'EXPORTER', 'ACTIVE');

INSERT OR IGNORE INTO Entities (id, user_id, name, tin, address, tier, is_verified, aeo_status)
VALUES 
('ENT-001', 'USER-001', 'Culbridge Limited', '01234567-0001', 'Lagos, Nigeria', 'AEO', 1, 1),
('ENT-002', 'USER-002', 'Acme Export Ltd', '01234568-0002', 'Port Harcourt, Nigeria', 'STANDARD', 1, 0);

-- ============================================
-- Login attempt rate limiting
-- ============================================

CREATE TABLE IF NOT EXISTS LoginAttempts (
    id VARCHAR(50) PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    ip_address VARCHAR(45) NOT NULL,
    attempts INTEGER DEFAULT 1,
    locked_until DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_ip (ip_address)
);

-- ============================================
-- Password reset tokens
-- ============================================

CREATE TABLE IF NOT EXISTS PasswordResetTokens (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL,
    token VARCHAR(64) NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    used BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES Users(id),
    INDEX idx_user (user_id),
    INDEX idx_token (token)
);