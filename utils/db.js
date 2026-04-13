const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(process.env.RENDER_DISK_PATH || '/tmp', 'culbridge', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = process.env.DATABASE_PATH || path.join(DATA_DIR, 'culbridge.db');

let db;

function getDB() {
  if (!db) {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('DB connection error:', err);
      } else {
        console.log('Connected to SQLite DB');
      }
    });
  }
  return db;
}

// Promisified db.exec for sequential execution
function execSQL(sql, errorMsg) {
  return new Promise((resolve, reject) => {
    getDB().exec(sql, (err) => {
      if (err) {
        console.error(errorMsg + ':', err.message);
        // Don't reject - continue with other scripts
        resolve();
      } else {
        resolve();
      }
    });
  });
}

async function initDB() {
  // Run schema (includes all module output tables)
  await execSQL(
    require('fs').readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8'),
    'Schema error'
  );
  console.log('Schema applied');
  
  // Run init data
  await execSQL(
    require('fs').readFileSync(path.join(__dirname, '..', 'db', 'init.sql'), 'utf8'),
    'Init data error'
  );
  console.log('Sample data inserted');
}

function run(query, params = []) {
  return new Promise((resolve, reject) => {
    getDB().run(query, params, function(err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function all(query, params = []) {
  return new Promise((resolve, reject) => {
    getDB().all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function get(query, params = []) {
  return new Promise((resolve, reject) => {
    getDB().get(query, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

module.exports = { initDB, run, all, get, getDB };

