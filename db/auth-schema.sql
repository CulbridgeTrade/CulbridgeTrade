-- =========================================================
-- CULBRIDGE AUTH SYSTEM - POSTGRESQL PRODUCTION SCHEMA
-- =========================================================


-- =========================================================
-- USERS
-- =========================================================
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(50) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,

    role VARCHAR(20) NOT NULL DEFAULT 'EXPORTER'
        CHECK (role IN ('EXPORTER', 'AGENT', 'ADMIN', 'COMPLIANCE')),

    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DELETED')),

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);



-- =========================================================
-- ENTITIES (COMPANIES / EXPORTERS)
-- =========================================================
CREATE TABLE IF NOT EXISTS entities (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    name VARCHAR(255) NOT NULL,
    tin VARCHAR(20) UNIQUE NOT NULL,
    address TEXT,
    rc_number VARCHAR(50),

    tier VARCHAR(20) NOT NULL DEFAULT 'STANDARD'
        CHECK (tier IN ('STANDARD', 'PREMIUM', 'AEO')),

    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    aeo_status BOOLEAN NOT NULL DEFAULT FALSE,
    aeo_expiry_date DATE,

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_entities_user_id ON entities(user_id);
CREATE INDEX IF NOT EXISTS idx_entities_tin ON entities(tin);



-- =========================================================
-- SESSIONS (JWT / LOGIN TRACKING)
-- =========================================================
CREATE TABLE IF NOT EXISTS sessions (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,

    ip_address VARCHAR(45),
    user_agent TEXT,

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_activity_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);



-- =========================================================
-- OTP VERIFICATION
-- =========================================================
CREATE TABLE IF NOT EXISTS otps (
    id VARCHAR(50) PRIMARY KEY,
    request_id VARCHAR(50) UNIQUE NOT NULL,

    phone VARCHAR(20) NOT NULL,
    code VARCHAR(10) NOT NULL,

    purpose VARCHAR(50) NOT NULL DEFAULT 'SIGNUP',

    expires_at TIMESTAMP NOT NULL,

    used BOOLEAN NOT NULL DEFAULT FALSE,
    verified_at TIMESTAMP,

    attempts INTEGER NOT NULL DEFAULT 0,

    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otps_phone ON otps(phone);
CREATE INDEX IF NOT EXISTS idx_otps_request_id ON otps(request_id);
CREATE INDEX IF NOT EXISTS idx_otps_expires_at ON otps(expires_at);



-- =========================================================
-- USER EXPORT CATEGORIES
-- =========================================================
CREATE TABLE IF NOT EXISTS user_export_categories (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    category VARCHAR(50) NOT NULL,

    created_at TIMESTAMP NOT NULL DEFAULT NOW(),

    UNIQUE(user_id, category)
);

CREATE INDEX IF NOT EXISTS idx_user_export_categories_user_id
ON user_export_categories(user_id);



-- =========================================================
-- AUTH AUDIT LOGS
-- =========================================================
CREATE TABLE IF NOT EXISTS auth_logs (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) REFERENCES users(id) ON DELETE SET NULL,

    event_type VARCHAR(50) NOT NULL,

    ip_address VARCHAR(45),
    user_agent TEXT,

    details JSONB,

    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_logs_user_id ON auth_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_logs_event_type ON auth_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_auth_logs_created_at ON auth_logs(created_at);



-- =========================================================
-- LOGIN ATTEMPTS (RATE LIMITING)
-- =========================================================
CREATE TABLE IF NOT EXISTS login_attempts (
    id VARCHAR(50) PRIMARY KEY,

    email VARCHAR(255) NOT NULL,
    ip_address VARCHAR(45) NOT NULL,

    attempts INTEGER NOT NULL DEFAULT 1,
    locked_until TIMESTAMP,

    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip_address);



-- =========================================================
-- PASSWORD RESET TOKENS
-- =========================================================
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,

    used BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_user_id ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_token ON password_reset_tokens(token);



-- =========================================================
-- OPTIONAL: CLEANUP TRIGGER (UPDATED_AT)
-- =========================================================
-- (You can add trigger later if needed)