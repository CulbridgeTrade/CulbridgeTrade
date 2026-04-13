const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(process.env.RENDER_DISK_PATH || '/tmp', 'culbridge', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const dbPath = process.env.DATABASE_PATH || path.join(DATA_DIR, 'culbridge.db');
const sqlPath = path.join(__dirname, '../db/corridor-schema-updates.sql');

const db = new sqlite3.Database(dbPath);

fs.readFile(sqlPath, 'utf8', (err, sql) => {
  if (err) {
    console.error('Error reading SQL:', err);
    return;
  }
  db.exec(sql, (err) => {
    if (err) {
      console.error('Migration error:', err);
    } else {
      console.log('Migration corridor-schema-updates.sql executed successfully.');
    }
    db.close();
  });
});

