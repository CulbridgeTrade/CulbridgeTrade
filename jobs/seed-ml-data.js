const db = require('../utils/db');
const { v4: uuidv4 } = require('uuid');

// Seed 100+ synthetic training samples per corridor/commodity
// Targets: commodity x corridor x exporter history

const COMMODITIES = ['sesame', 'cocoa', 'cashew', 'ginger'];
const CORRIDORS = [
  {origin: 'NG', dest: 'NL'},
  {origin: 'NG', dest: 'DE'},
  {origin: 'NG', dest: 'BE'}  // new
];
const OUTCOMES = ['PASS', 'BLOCKER', 'WARNING'];  // weighted

async function seedMLData() {
  const count = 0;
  for (const commodity of COMMODITIES) {
    for (const corridor of CORRIDORS) {
      for (let i = 0; i < 25; i++) {  // 25 x 4 comm x 3 corr = 300 samples
        const features = {
          aflatoxin_b1: Math.random() * 10,
          cadmium: Math.random() * 1,
          lab_tier: Math.floor(Math.random() * 3) + 1,
          exporter_tier: 1 + Math.floor(Math.random() * 3),
          rasff_rate: Math.random(),
          docs_complete: Math.random() > 0.1
        };
        const outcome = OUTCOMES[Math.floor(Math.random() * OUTCOMES.length)];

        await db.run(`
          INSERT INTO ml_training_data (shipment_id, commodity, origin_country, dest_country, outcome, features, created_at)
          VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        `, [uuidv4(), commodity, corridor.origin, corridor.dest, outcome, JSON.stringify(features)]);
        count++;
      }
    }
  }
  console.log(`Seeded ${count} ML training samples`);
}

// First create table if missing (add to schema later)
await db.run(`CREATE TABLE IF NOT EXISTS ml_training_data (
  id INTEGER PRIMARY KEY,
  shipment_id TEXT,
  commodity TEXT,
  origin_country TEXT,
  dest_country TEXT,
  outcome TEXT CHECK(outcome IN ('PASS','BLOCKER','WARNING')),
  features TEXT,  -- JSON
  model_version TEXT DEFAULT 'v0.1',
  created_at DATETIME
)`);

seedMLData().catch(console.error);

