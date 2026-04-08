/**
 * Culbridge Authentication API Endpoints
 * 
 * Provides authentication endpoints:
 * - POST /auth/verify-tin - TIN verification with CAC/NEPC
 * - POST /auth/send-otp - SMS OTP delivery
 * - POST /auth/verify-otp - OTP verification
 * - POST /auth/signup - Account creation
 * - POST /auth/login - Session creation
 * - POST /auth/refresh - Token refresh
 * - POST /auth/logout - Session termination
 */

const express = require('express');
const crypto = require('crypto');
const { db } = require('../utils/db');

const app = express();
app.use(express.json());

// Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'culbridge_secret';
const OTP_EXPIRY_MINUTES = 5;
const SESSION_EXPIRY_DAYS = 7;

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Generate unique ID
 */
const generateId = (prefix) => `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

/**
 * Generate session token
 */
const generateSessionToken = () => crypto.randomBytes(32).toString('hex');

/**
 * Generate session hash (for audit)
 */
const generateSessionHash = (token, userId) => 
  crypto.createHash('sha256').update(`${token}:${userId}`).digest('hex');

/**
 * Format Nigerian phone number
 */
const formatPhoneNumber = (phone) => {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('0')) return '+234' + cleaned.substring(1);
  if (cleaned.startsWith('234')) return '+' + cleaned;
  return cleaned.startsWith('+') ? cleaned : '+234' + cleaned;
};

// ============================================
// ERROR CLASSES
// ============================================

class AuthError extends Error {
  constructor(code, message, statusCode = 400, retryable = false) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.retryable = retryable;
  }
}

// ============================================
// ENDPOINTS
// ============================================

/**
 * POST /auth/verify-tin
 * Verify TIN against CAC/NEPC database
 */
app.post('/auth/verify-tin', async (req, res) => {
  const { tin } = req.body;
  
  if (!tin) {
    return res.status(400).json({ code: 'VALIDATION_FAILED', message: 'TIN is required' });
  }
  
  const cleanedTIN = tin.replace(/[-\s]/g, '');
  
  if (!/^\d{8,12}$/.test(cleanedTIN)) {
    return res.status(400).json({ 
      code: 'TIN_FORMAT_INVALID', 
      message: 'TIN format invalid. Use format: 01234567-0001' 
    });
  }
  
  try {
    // Check if TIN already registered
    const existingUser = await db.get(
      'SELECT id, email FROM Users WHERE tin = ?',
      [cleanedTIN]
    );
    
    if (existingUser) {
      return res.status(409).json({
        code: 'TIN_EXISTS',
        message: 'This TIN is already registered with another account.'
      });
    }
    
    // Mock CAC/NEPC lookup (in production, integrate with real APIs)
    // Simulate lookup
    const mockCompanyData = {
      '01234567': { name: 'Acme Export Limited', address: '1 Industrial Avenue, Lagos' },
      '01234568': { name: 'Global Trading Co', address: '42 Commerce Street, Lagos' }
    };
    
    const companyData = mockCompanyData[cleanedTIN.substring(0, 8)];
    
    if (!companyData) {
      // Simulate CAC offline occasionally
      if (Math.random() < 0.1) {
        return res.status(503).json({
          code: 'CAC_OFFLINE',
          message: 'CAC registry temporarily unavailable. Retry in 2 minutes.',
          retryable: true
        });
      }
      
      return res.status(404).json({
        code: 'TIN_NOT_FOUND',
        message: 'TIN not found in CAC/NEPC records. Verify and retry.'
      });
    }
    
    res.json({
      companyName: companyData.name,
      address: companyData.address,
      tin: cleanedTIN,
      status: 'VERIFIED'
    });
    
  } catch (error) {
    console.error('TIN verification error:', error);
    res.status(500).json({
      code: 'SERVER_ERROR',
      message: 'Server error occurred. Our team has been notified.',
      retryable: true
    });
  }
});

/**
 * POST /auth/send-otp
 * Send OTP to phone number
 */
app.post('/auth/send-otp', async (req, res) => {
  const { phone, purpose } = req.body;
  
  if (!phone) {
    return res.status(400).json({ code: 'VALIDATION_FAILED', message: 'Phone number is required' });
  }
  
  const formattedPhone = formatPhoneNumber(phone);
  
  if (!/^\+234[7-9]\d{9}$/.test(formattedPhone)) {
    return res.status(400).json({
      code: 'PHONE_INVALID',
      message: 'Invalid Nigerian phone number format'
    });
  }
  
  try {
    // Check rate limiting
    const recentAttempts = await db.all(
      `SELECT id FROM OTPs 
       WHERE phone = ? AND created_at > datetime('now', '-5 minutes')`,
      [formattedPhone]
    );
    
    if (recentAttempts.length >= 3) {
      return res.status(429).json({
        code: 'RATE_LIMITED',
        message: 'Too many attempts. Please wait 5 minutes.',
        retryable: true
      });
    }
    
    // Generate OTP (4 digits)
    const otpCode = Math.floor(1000 + Math.random() * 9000).toString();
    const requestId = generateId('OTP');
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString();
    
    // Store OTP
    await db.run(
      `INSERT INTO OTPs (request_id, phone, code, purpose, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      [requestId, formattedPhone, otpCode, purpose || 'SIGNUP', expiresAt]
    );
    
    // In production, integrate with SMS provider (e.g., Twilio, Africa's Talking)
    console.log(`[MOCK SMS] OTP for ${formattedPhone}: ${otpCode}`);
    
    res.json({
      requestId,
      expiresIn: OTP_EXPIRY_MINUTES * 60
    });
    
  } catch (error) {
    console.error('OTP send error:', error);
    res.status(500).json({
      code: 'OTP_SEND_FAILED',
      message: 'Failed to send verification code. Check phone number and retry.',
      retryable: true
    });
  }
});

/**
 * POST /auth/verify-otp
 * Verify OTP code
 */
app.post('/auth/verify-otp', async (req, res) => {
  const { requestId, code } = req.body;
  
  if (!requestId || !code) {
    return res.status(400).json({ code: 'VALIDATION_FAILED', message: 'Request ID and code required' });
  }
  
  try {
    const otpRecord = await db.get(
      'SELECT * FROM OTPs WHERE request_id = ? AND used = 0',
      [requestId]
    );
    
    if (!otpRecord) {
      return res.status(404).json({
        code: 'OTP_NOT_FOUND',
        message: 'OTP request not found'
      });
    }
    
    if (new Date(otpRecord.expires_at) < new Date()) {
      return res.status(400).json({
        code: 'OTP_EXPIRED',
        message: 'Verification code expired. Request a new one.'
      });
    }
    
    if (otpRecord.code !== code) {
      // Increment attempt count
      await db.run(
        'UPDATE OTPs SET attempts = attempts + 1 WHERE request_id = ?',
        [requestId]
      );
      
      return res.status(400).json({
        code: 'OTP_INVALID',
        message: 'Invalid verification code. Please check and retry.'
      });
    }
    
    // Mark OTP as used
    await db.run(
      'UPDATE OTPs SET used = 1, verified_at = datetime(\'now\') WHERE request_id = ?',
      [requestId]
    );
    
    res.json({ verified: true });
    
  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({
      code: 'SERVER_ERROR',
      message: 'Server error occurred.',
      retryable: true
    });
  }
});

/**
 * POST /auth/signup
 * Create new user account
 */
app.post('/auth/signup', async (req, res) => {
  const { email, tin, companyName, address, contactName, contactRole, phone, categories, password } = req.body;
  
  // Validation
  if (!email || !tin || !password || !contactName || !phone) {
    return res.status(400).json({
      code: 'VALIDATION_FAILED',
      message: 'Please check all required fields and try again.'
    });
  }
  
  try {
    // Check if email exists
    const existingEmail = await db.get('SELECT id FROM Users WHERE email = ?', [email]);
    if (existingEmail) {
      return res.status(409).json({
        code: 'EMAIL_EXISTS',
        message: 'This email is already registered. Please sign in.'
      });
    }
    
    // Check if TIN exists
    const existingTIN = await db.get('SELECT id FROM Users WHERE tin = ?', [tin.replace(/[-\s]/g, '')]);
    if (existingTIN) {
      return res.status(409).json({
        code: 'TIN_EXISTS',
        message: 'This TIN is already registered with another account.'
      });
    }
    
    // Hash password
    const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
    const salt = crypto.randomBytes(16).toString('hex');
    const hashedPassword = crypto.createHash('sha256').update(`${salt}:${passwordHash}`).digest('hex');
    
    // Create user
    const userId = generateId('USER');
    await db.run(
      `INSERT INTO Users (id, email, password_hash, salt, role, created_at)
       VALUES (?, ?, ?, ?, 'EXPORTER', datetime('now'))`,
      [userId, email, hashedPassword, salt]
    );
    
    // Create entity (company)
    const entityId = generateId('ENT');
    await db.run(
      `INSERT INTO Entities (id, user_id, name, tin, address, tier, is_verified, aeo_status, created_at)
       VALUES (?, ?, ?, ?, ?, 'STANDARD', 0, 0, datetime('now'))`,
      [entityId, userId, companyName, tin.replace(/[-\s]/g, ''), address]
    );
    
    // Add export categories
    if (categories && categories.length > 0) {
      for (const category of categories) {
        await db.run(
          `INSERT INTO UserExportCategories (user_id, category) VALUES (?, ?)`,
          [userId, category]
        );
      }
    }
    
    // Generate session
    const sessionToken = generateSessionToken();
    const sessionHash = generateSessionToken(sessionToken);
    const expiresAt = new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
    
    await db.run(
      `INSERT INTO Sessions (user_id, token, token_hash, expires_at, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
      [userId, sessionToken, sessionHash, expiresAt]
    );
    
    res.status(201).json({
      user: {
        id: userId,
        email,
        role: 'EXPORTER',
        permissions: ['create_shipment', 'view_own_shipments', 'submit_shipment']
      },
      entity: {
        id: entityId,
        name: companyName,
        tier: 'STANDARD',
        aeoStatus: false,
        isVerified: false
      },
      sessionToken,
      sessionHash,
      expiresAt
    });
    
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({
      code: 'SERVER_ERROR',
      message: 'Server error occurred. Our team has been notified.',
      retryable: true
    });
  }
});

/**
 * POST /auth/login
 * Authenticate user and create session
 */
app.post('/auth/login', async (req, res) => {
  const { email, tin, password, rememberDevice } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({
      code: 'VALIDATION_FAILED',
      message: 'Email and password are required'
    });
  }
  
  try {
    // Find user
    const user = await db.get('SELECT * FROM Users WHERE email = ?', [email]);
    
    if (!user) {
      return res.status(401).json({
        code: 'AUTH_FAILED',
        message: 'Invalid email or password'
      });
    }
    
    // Verify password
    const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
    const hashedPassword = crypto.createHash('sha256').update(`${user.salt}:${passwordHash}`).digest('hex');
    
    if (hashedPassword !== user.password_hash) {
      return res.status(401).json({
        code: 'AUTH_FAILED',
        message: 'Invalid email or password'
      });
    }
    
    // Get entity
    const entity = await db.get(
      'SELECT * FROM Entities WHERE user_id = ?',
      [user.id]
    );
    
    // Generate session
    const sessionToken = generateSessionToken();
    const sessionHash = crypto.createHash('sha256').update(`${sessionToken}:${user.id}`).digest('hex');
    const expiryDays = rememberDevice ? 30 : SESSION_EXPIRY_DAYS;
    const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString();
    
    await db.run(
      `INSERT INTO Sessions (user_id, token, token_hash, expires_at, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
      [user.id, sessionToken, sessionHash, expiresAt]
    );
    
    res.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        permissions: user.role === 'ADMIN' 
          ? ['*'] 
          : ['create_shipment', 'view_own_shipments', 'submit_shipment', 'view_all_shipments']
      },
      entity: entity ? {
        id: entity.id,
        name: entity.name,
        tier: entity.tier,
        aeoStatus: entity.aeo_status === 1,
        isVerified: entity.is_verified === 1
      } : null,
      sessionToken,
      sessionHash,
      expiresAt
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      code: 'SERVER_ERROR',
      message: 'Server error occurred.',
      retryable: true
    });
  }
});

/**
 * POST /auth/refresh
 * Refresh session token
 */
app.post('/auth/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  
  if (!refreshToken) {
    return res.status(400).json({ code: 'VALIDATION_FAILED', message: 'Refresh token required' });
  }
  
  try {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const session = await db.get(
      'SELECT * FROM Sessions WHERE token_hash = ? AND expires_at > datetime(\'now\')',
      [tokenHash]
    );
    
    if (!session) {
      return res.status(401).json({
        code: 'SESSION_EXPIRED',
        message: 'Your session has expired. Please sign in again.'
      });
    }
    
    // Generate new token
    const newToken = generateSessionToken();
    const newHash = crypto.createHash('sha256').update(`${newToken}:${session.user_id}`).digest('hex');
    const expiresAt = new Date(Date.now() + SESSION_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
    
    await db.run(
      'UPDATE Sessions SET token = ?, token_hash = ?, expires_at = ? WHERE id = ?',
      [newToken, newHash, expiresAt, session.id]
    );
    
    res.json({
      sessionToken: newToken,
      expiresAt
    });
    
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({ code: 'SERVER_ERROR', message: 'Server error', retryable: true });
  }
});

/**
 * POST /auth/logout
 * Terminate session
 */
app.post('/auth/logout', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(400).json({ code: 'VALIDATION_FAILED', message: 'Token required' });
  }
  
  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await db.run(
      'DELETE FROM Sessions WHERE token_hash = ?',
      [tokenHash]
    );
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ code: 'SERVER_ERROR', message: 'Server error', retryable: true });
  }
});

// ============================================
// START SERVER
// ============================================

const PORT = process.env.AUTH_PORT || 3001;
app.listen(PORT, () => {
  console.log(`Culbridge Auth API running on http://localhost:${PORT}`);
  console.log('Endpoints:');
  console.log('  POST /auth/verify-tin');
  console.log('  POST /auth/send-otp');
  console.log('  POST /auth/verify-otp');
  console.log('  POST /auth/signup');
  console.log('  POST /auth/login');
  console.log('  POST /auth/refresh');
  console.log('  POST /auth/logout');
});

module.exports = app;