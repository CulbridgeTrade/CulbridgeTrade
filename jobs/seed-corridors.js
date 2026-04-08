const fs = require('fs');
const path = require('path');
const db = require('../utils/db');

async function seedFromJSON() {
  const jsonPath = path.join(__dirname, '../config/dynamic-mappings.json');
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  
  for (const m of data.mappings) {
    const origin = m.corridorId.split('-')[0];
    const dest = m.corridorId.split('-')[1];
    
    await db.run(`
      INSERT OR REPLACE INTO corridor_mappings 
      (originCountry, destinationCountry, productCategory, requiredDocuments, mandatoryLabTests, 
       thresholds, mrlLimits, corridorVersion, validFrom)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      origin, dest, m.productCategory,
      JSON.stringify(m.requiredDocuments || []),
      JSON.stringify(m.requiredLabTests || []),
      JSON.stringify(m.thresholds || {}),
      JSON.stringify(m.mrlLimits || {}),
      m.version || 'v1',
      m.validFrom
    ]);
  }
  
  const count = await db.get('SELECT COUNT(*) as cnt FROM corridor_mappings');
  console.log(`Seeded ${count.cnt} corridor mappings from JSON`);
}

seedFromJSON().catch(console.error);

