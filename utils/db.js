const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const IS_PROD = process.env.NODE_ENV === 'production';

/**
 * 🔴 STORAGE STRATEGY
 * - PROD: SHOULD NOT rely on SQLite file system (use Postgres)
 * - DEV: SQLite file fallback
 */

const DATA_DIR =
  process.env.DATA_DIR ||
  path.join(process.env.RENDER_DISK_PATH || '/tmp', 'culbridge', 'data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH =
  process.env.DATABASE_PATH ||
  path.join(DATA_DIR, 'culbridge.db');

let dbInstance = null;

/**
 * DB CONNECTION
 */
function getDB() {
  if (IS_PROD) {
    console.warn(
      '⚠️ SQLite used in production mode. Consider migrating to PostgreSQL.'
    );
  }

  if (!dbInstance) {
    dbInstance = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('❌ DB connection failed:', err.message);
      } else {
        console.log('✅ Connected to SQLite DB:', DB_PATH);
      }
    });
  }

  return dbInstance;
}

/**
 * EXEC SQL (SAFE)
 */
function execSQL(sql, context = 'SQL error') {
  return new Promise((resolve) => {
    getDB().exec(sql, (err) => {
      if (err) {
        console.error(`❌ ${context}:`, err.message);
        return resolve(false);
      }
      resolve(true);
    });
  });
}

/**
 * INIT DB
 */
async function initDB() {
  try {
    const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
    const initPath = path.join(__dirname, '..', 'db', 'init.sql');

    if (fs.existsSync(schemaPath)) {
      await execSQL(fs.readFileSync(schemaPath, 'utf8'), 'Schema error');
      console.log('✅ Schema applied');
    }

    if (fs.existsSync(initPath)) {
      await execSQL(fs.readFileSync(initPath, 'utf8'), 'Init data error');
      console.log('✅ Init data inserted');
    }
  } catch (err) {
    console.error('❌ DB initialization failed:', err.message);
  }
}

/**
 * QUERY HELPERS
 */
function run(query, params = []) {
  return new Promise((resolve, reject) => {
    getDB().run(query, params, function (err) {
      if (err) return reject(err);
      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function all(query, params = []) {
  return new Promise((resolve, reject) => {
    getDB().all(query, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function get(query, params = []) {
  return new Promise((resolve, reject) => {
    getDB().get(query, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

module.exports = {
  initDB,
  run,
  all,
  get,
  getDB,
};