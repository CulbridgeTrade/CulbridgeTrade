/**
 * Field-Level Encryption Module
 * Protects sensitive data: PII, financial amounts, HS codes, certificate data
 * Uses AES-256-CBC with random IV per encryption
 */

const crypto = require('crypto');

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

/**
 * Encrypt sensitive field value
 * @param {string} plaintext - Value to encrypt
 * @param {string} keyOverride - Optional override key for specific fields
 * @returns {string} - Base64 encoded IV:encrypted:tag
 */
function encryptField(plaintext, keyOverride = null) {
  if (!plaintext) return null;
  
  const key = keyOverride || ENCRYPTION_KEY;
  const keyBuffer = Buffer.from(key, 'hex');
  
  // Generate random IV
  const iv = crypto.randomBytes(IV_LENGTH);
  
  // Create cipher
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);
  
  // Encrypt
  let encrypted = cipher.update(String(plaintext), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  // Return IV + encrypted data (base64 encoded)
  return `${iv.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt sensitive field value
 * @param {string} encryptedValue - Base64 encoded IV:encrypted
 * @param {string} keyOverride - Optional override key
 * @returns {string} - Decrypted plaintext
 */
function decryptField(encryptedValue, keyOverride = null) {
  if (!encryptedValue) return null;
  
  const key = keyOverride || ENCRYPTION_KEY;
  const keyBuffer = Buffer.from(key, 'hex');
  
  try {
    const parts = encryptedValue.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted value format');
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    
    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv);
    
    // Decrypt
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption failed:', error.message);
    return null;
  }
}

/**
 * Encrypt object fields based on schema
 * @param {object} data - Data object to encrypt
 * @param {string[]} fields - Array of field names to encrypt
 * @returns {object} - Object with encrypted fields
 */
function encryptFields(data, fields) {
  const encrypted = { ...data };
  
  for (const field of fields) {
    if (encrypted[field] !== undefined && encrypted[field] !== null) {
      encrypted[field] = encryptField(encrypted[field]);
    }
  }
  
  return encrypted;
}

/**
 * Decrypt object fields based on schema
 * @param {object} data - Encrypted data object
 * @param {string[]} fields - Array of field names to decrypt
 * @returns {object} - Object with decrypted fields
 */
function decryptFields(data, fields) {
  const decrypted = { ...data };
  
  for (const field of fields) {
    if (decrypted[field] !== undefined && decrypted[field] !== null) {
      decrypted[field] = decryptField(decrypted[field]);
    }
  }
  
  return decrypted;
}

// Field categories for encryption
const ENCRYPTION_SCHEMAS = {
  // PII fields
  PII: ['tin', 'rc_number', 'cac_reference', 'passport_number', 'national_id'],
  
  // Financial fields
  FINANCIAL: ['amount', 'total_estimated_costs', 'duty', 'nes_levy', 'payment_amount', 'account_number'],
  
  // Certificate data
  CERTIFICATES: ['certificate_data', 'lab_results', 'test_results', 'phytosanitary_data'],
  
  // HS Codes (sensitive for competitive reasons)
  HS_CODES: ['validated_hs_code', 'hs_mapping'],
  
  // Compliance data
  COMPLIANCE: ['farm_coordinates', 'farm_polygons', 'gps_coordinates']
};

/**
 * Encrypt data based on category
 * @param {object} data - Data to encrypt
 * @param {string} category - Category from ENCRYPTION_SCHEMAS
 * @returns {object} - Data with encrypted fields
 */
function encryptByCategory(data, category) {
  const fields = ENCRYPTION_SCHEMAS[category];
  if (!fields) {
    console.warn(`Unknown encryption category: ${category}`);
    return data;
  }
  return encryptFields(data, fields);
}

/**
 * Decrypt data based on category
 * @param {object} data - Data to decrypt
 * @param {string} category - Category from ENCRYPTION_SCHEMAS
 * @returns {object} - Data with decrypted fields
 */
function decryptByCategory(data, category) {
  const fields = ENCRYPTION_SCHEMAS[category];
  if (!fields) {
    console.warn(`Unknown encryption category: ${category}`);
    return data;
  }
  return decryptFields(data, fields);
}

/**
 * Hash sensitive field (one-way, for comparisons)
 * @param {string} value - Value to hash
 * @returns {string} - SHA-256 hash
 */
function hashField(value) {
  return crypto
    .createHash('sha256')
    .update(String(value))
    .digest('hex');
}

/**
 * Generate encryption key from user/tenant
 * @param {string} identifier - User ID or tenant ID
 * @returns {string} - Derived key
 */
function deriveKey(identifier) {
  return crypto
    .pbkdf2Sync(identifier, 'culbridge_salt', 100000, 32, 'sha256')
    .toString('hex');
}

module.exports = {
  encryptField,
  decryptField,
  encryptFields,
  decryptFields,
  encryptByCategory,
  decryptByCategory,
  hashField,
  deriveKey,
  ENCRYPTION_SCHEMAS,
  ALGORITHM
};