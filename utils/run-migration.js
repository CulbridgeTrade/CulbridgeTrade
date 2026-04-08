const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '../culbridge.db');
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

