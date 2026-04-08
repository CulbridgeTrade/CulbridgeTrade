/**
 * Database Migration System
 * 
 * FIXES: No database migrations - Schema changes manual
 */

const fs = require('fs');
const path = require('path');

const MIGRATION_DIR = path.join(__dirname, '../db/migrations');

// Ensure migrations directory exists
if (!fs.existsSync(MIGRATION_DIR)) {
  fs.mkdirSync(MIGRATION_DIR, { recursive: true });
}

/**
 * Migration runner
 */
class MigrationRunner {
  constructor(db) {
    this.db = db;
    this.tableName = '_migrations';
  }
  
  /**
   * Ensure migrations table exists
   */
  async ensureTable() {
    const sql = `
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        executed_at TEXT NOT NULL
      )
    `;
    await this.db.exec(sql);
  }
  
  /**
   * Get executed migrations
   */
  async getExecuted() {
    await this.ensureTable();
    const rows = await this.db.all(`SELECT name FROM ${this.tableName}`);
    return new Set(rows.map(r => r.name));
  }
  
  /**
   * Create migration file
   */
  static create(name) {
    const timestamp = Date.now();
    const filename = `${timestamp}_${name}.sql`;
    const filepath = path.join(MIGRATION_DIR, filename);
    
    const template = `-- Migration: ${name}
-- Created: ${new Date().toISOString()}

-- UP Migration (apply changes)
-- WRITE YOUR SQL HERE

-- DOWN Migration (rollback changes)
-- WRITE ROLLBACK SQL HERE
`;
    
    fs.writeFileSync(filepath, template);
    console.log(`Created migration: ${filename}`);
    return filename;
  }
  
  /**
   * Run pending migrations
   */
  async run() {
    await this.ensureTable();
    
    const executed = await this.getExecuted();
    const files = fs.readdirSync(MIGRATION_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();
    
    const pending = files.filter(f => !executed.has(f));
    
    console.log(`\n=== MIGRATIONS ===`);
    console.log(`Executed: ${executed.size}`);
    console.log(`Pending: ${pending.length}`);
    
    for (const file of pending) {
      console.log(`Running: ${file}`);
      
      const filepath = path.join(MIGRATION_DIR, file);
      const content = fs.readFileSync(filepath, 'utf-8');
      
      // Split on UP marker
      const upSql = content.split('-- DOWN Migration')[0]
        .replace('-- Migration:.*', '')
        .replace('-- Created:.*', '')
        .trim();
      
      if (upSql) {
        await this.db.exec(upSql);
        await this.db.run(
          `INSERT INTO ${this.tableName} (name, executed_at) VALUES (?, ?)`,
          [file, new Date().toISOString()]
        );
        console.log(`✓ Applied: ${file}`);
      }
    }
    
    console.log('=== DONE ===\n');
  }
  
  /**
   * Rollback last migration
   */
  async rollback() {
    await this.ensureTable();
    
    const last = await this.db.get(
      `SELECT name FROM ${this.tableName} ORDER BY id DESC LIMIT 1`
    );
    
    if (!last) {
      console.log('No migrations to rollback');
      return;
    }
    
    console.log(`Rolling back: ${last.name}`);
    
    const filepath = path.join(MIGRATION_DIR, last.name);
    const content = fs.readFileSync(filepath, 'utf-8');
    
    // Get DOWN migration
    const parts = content.split('-- DOWN Migration');
    const downSql = parts[1]?.trim();
    
    if (downSql) {
      await this.db.exec(downSql);
      await this.db.run(
        `DELETE FROM ${this.tableName} WHERE name = ?`,
        [last.name]
      );
      console.log(`✓ Rolled back: ${last.name}`);
    } else {
      console.log('No DOWN migration found');
    }
  }
}

/**
 * Create sample migration files if they don't exist
 */
function initializeMigrations() {
  const migrations = [
    {
      name: 'create_shipments_table',
      sql: `
-- UP
CREATE TABLE IF NOT EXISTS shipments (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  product_name TEXT,
  hs_code TEXT,
  origin_country TEXT,
  destination_country TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- DOWN
DROP TABLE IF EXISTS shipments;
`
    },
    {
      name: 'create_labs_table',
      sql: `
-- UP
CREATE TABLE IF NOT EXISTS labs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  country TEXT,
  accreditation TEXT,
  verified INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- DOWN
DROP TABLE IF EXISTS labs;
`
    },
    {
      name: 'create_rules_table',
      sql: `
-- UP
CREATE TABLE IF NOT EXISTS rules (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  product_category TEXT,
  corridor TEXT,
  condition TEXT,
  effect_type TEXT,
  message TEXT,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- DOWN
DROP TABLE IF EXISTS rules;
`
    }
  ];
  
  for (const m of migrations) {
    const filename = `000_initial_${m.name}.sql`;
    const filepath = path.join(MIGRATION_DIR, filename);
    
    if (!fs.existsSync(filepath)) {
      const content = `-- Migration: ${m.name}\n-- Created: ${new Date().toISOString()}\n\n${m.sql}`;
      fs.writeFileSync(filepath, content);
    }
  }
}

// Initialize on load
initializeMigrations();

module.exports = { MigrationRunner };