// Culbridge RASFF Alerts Integration
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, '../culbridge.db');

async function getRasffAlerts(commodity) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH);
    db.all(
      "SELECT * FROM rasff_alerts WHERE prod_desc LIKE ? ORDER BY fetched_at DESC LIMIT 10",
      [`%${commodity}%`],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
    db.close();
  });
}

async function checkCommodityRisk(commodity) {
  const alerts = await getRasffAlerts(commodity);
  
  const highRisk = alerts.some(a => a.risk && a.risk.toLowerCase().includes('serious'));
  
  return {
    commodity,
    alertCount: alerts.length,
    highRisk,
    recentAlerts: alerts.slice(0, 3)
  };
}

module.exports = { getRasffAlerts, checkCommodityRisk };

