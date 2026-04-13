/**
 * RASFF Live Scraper Service
 * 
 * Purpose: Real-time ingestion of RASFF alerts from EU database
 * - Alerts exporters immediately when Germany bans specific batch
 * - Enables proactive re-testing before shipping
 * 
 * Sources:
 * - RASFF Food Portal (https://rasff.ec.europa.eu/)
 * - RSS feeds
 * - Open data APIs
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(process.env.RENDER_DISK_PATH || '/tmp', 'culbridge', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ==================== CONFIGURATION ====================

const config = {
  // RASFF data sources
  sources: {
    portal: 'https://ec.europa.eu/food/food/rasff',
    rssFeed: 'https://ec.europa.eu/food/food/rasff/feed.xml',
    // Alternative: European data portal
    dataPortal: 'https://data.europa.eu/data/datasets/rasff'
  },
  
  // Sync settings
  syncInterval: 6 * 60 * 60 * 1000, // 6 hours
  maxRetries: 3,
  timeout: 30000,
  
  // Alert thresholds for immediate notification
  notifyOn: ['salmonella', 'aflatoxin', 'pesticide'],
  
  // Storage
  dataPath: path.join(DATA_DIR, 'rasff_live.json'),
  historyPath: path.join(DATA_DIR, 'rasff_history.json')
};

// ==================== IN-MEMORY STORAGE ====================

let liveAlerts = {
  lastFetch: null,
  lastNewAlert: null,
  alerts: [],
  notifications: []
};

// ==================== SAMPLE LIVE DATA ====================

// Simulated live alerts (in production, would scrape real RASFF)
const sampleLiveAlerts = [
  {
    id: 'RASFF-2026-1234',
    type: 'alert',
    status: 'final',
    category: 'food',
    hazard: 'salmonella',
    product: 'sesame seeds',
    productOriginalName: 'Sesamum indicum',
    origin: { country: 'Nigeria', countryCode: 'NG' },
    destination: { country: 'Germany', countryCode: 'DE' },
    portOfEntry: 'Hamburg',
    distribution: ['Germany', 'Netherlands'],
    measures: ['destroyed', 'border_rejected'],
    actionTaken: 'Official detention and destruction',
    date: '2026-03-25',
    reference: '2026.1234',
    notifyingCountry: 'DE'
  },
  {
    id: 'RASFF-2026-1235',
    type: 'alert',
    status: 'final',
    category: 'food',
    hazard: 'pesticide_residue',
    product: 'groundnuts',
    productOriginalName: 'Arachis hypogaea',
    origin: { country: 'Nigeria', countryCode: 'NG' },
    destination: { country: 'Netherlands', countryCode: 'NL' },
    portOfEntry: 'Rotterdam',
    distribution: ['Netherlands', 'Belgium'],
    measures: ['rejected_for_uses_as_such'],
    actionTaken: 'Return to origin',
    date: '2026-03-24',
    reference: '2026.1235',
    notifyingCountry: 'NL'
  },
  {
    id: 'RASFF-2026-1236',
    type: 'information',
    status: 'final',
    category: 'food',
    hazard: 'aflatoxin',
    product: 'cocoa beans',
    productOriginalName: 'Theobroma cacao',
    origin: { country: 'Ghana', countryCode: 'GH' },
    destination: { country: 'Germany', countryCode: 'DE' },
    portOfEntry: 'Hamburg',
    distribution: ['Germany'],
    measures: ['physical_treatment'],
    actionTaken: 'Withdrawal from market',
    date: '2026-03-23',
    reference: '2026.1236',
    notifyingCountry: 'DE'
  },
  {
    id: 'RASFF-2026-1237',
    type: 'alert',
    status: 'final',
    category: 'food',
    hazard: 'cadmium',
    product: 'cocoa beans',
    productOriginalName: 'Theobroma cacao',
    origin: { country: 'Ivory Coast', countryCode: 'CI' },
    destination: { country: 'Belgium', countryCode: 'BE' },
    portOfEntry: 'Antwerp',
    distribution: ['Belgium', 'France'],
    measures: ['border_rejected'],
    actionTaken: 'Re-exported',
    date: '2026-03-22',
    reference: '2026.1237',
    notifyingCountry: 'BE'
  },
  {
    id: 'RASFF-2026-1238',
    type: 'alert',
    status: 'final',
    category: 'food',
    hazard: 'salmonella',
    product: 'herbs',
    productOriginalName: 'Moringa oleifera',
    origin: { country: 'Nigeria', countryCode: 'NG' },
    destination: { country: 'United Kingdom', countryCode: 'UK' },
    portOfEntry: 'Felixstowe',
    distribution: ['United Kingdom'],
    measures: ['destruction'],
    actionTaken: 'Official detention',
    date: '2026-03-21',
    reference: '2026.1238',
    notifyingCountry: 'UK'
  }
];

// ==================== CORE FUNCTIONS ====================

/**
 * Initialize scraper
 */
async function initialize() {
  console.log('RASFF Live Scraper initializing...');
  await loadLiveAlerts();
  console.log(`RASFF Live: ${liveAlerts.alerts.length} alerts loaded`);
  return true;
}

/**
 * Load from storage
 */
async function loadLiveAlerts() {
  try {
    if (fs.existsSync(config.dataPath)) {
      const data = fs.readFileSync(config.dataPath, 'utf8');
      liveAlerts = JSON.parse(data);
    }
  } catch (error) {
    console.log('No existing live alerts');
  }
}

/**
 * Save to storage
 */
async function saveLiveAlerts() {
  try {
    fs.writeFileSync(config.dataPath, JSON.stringify(liveAlerts, null, 2));
  } catch (error) {
    console.error('Failed to save live alerts:', error.message);
  }
}

/**
 * Fetch live alerts from RASFF (simulated for MVP)
 * In production, would scrape RASFF portal or use API
 */
async function fetchLiveAlerts() {
  console.log('Fetching live RASFF alerts...');
  
  try {
    // Simulated fetch - in production would scrape real data
    // const response = await scrapeRASFFPortal();
    
    // Simulate new alerts appearing
    const newAlerts = simulateNewAlerts();
    
    // Add to storage
    const previousCount = liveAlerts.alerts.length;
    liveAlerts.alerts = [...newAlerts, ...liveAlerts.alerts].slice(0, 100);
    liveAlerts.lastFetch = new Date().toISOString();
    
    // Check for new alerts that need notification
    if (liveAlerts.alerts.length > previousCount) {
      const newOnes = liveAlerts.alerts.slice(0, liveAlerts.alerts.length - previousCount);
      for (const alert of newOnes) {
        if (config.notifyOn.includes(alert.hazard)) {
          liveAlerts.notifications.push({
            alertId: alert.id,
            type: 'CRITICAL',
            hazard: alert.hazard,
            product: alert.product,
            origin: alert.origin.country,
            destination: alert.destination.country,
            message: `URGENT: ${alert.hazard.toUpperCase()} detected in ${alert.product} from ${alert.origin.country}`,
            timestamp: new Date().toISOString()
          });
        }
      }
    }
    
    await saveLiveAlerts();
    
    return {
      success: true,
      alertsFetched: newAlerts.length,
      totalAlerts: liveAlerts.alerts.length,
      lastFetch: liveAlerts.lastFetch
    };
  } catch (error) {
    console.error('Failed to fetch RASFF alerts:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Simulate new alerts (for MVP)
 */
function simulateNewAlerts() {
  // Return sample data as "new" alerts
  return sampleLiveAlerts.map(alert => ({
    ...alert,
    fetchedAt: new Date().toISOString()
  }));
}

/**
 * Get alerts by country of origin
 */
function getAlertsByOrigin(country) {
  return liveAlerts.alerts.filter(a => 
    a.origin?.country?.toLowerCase() === country.toLowerCase()
  );
}

/**
 * Get alerts by destination country
 */
function getAlertsByDestination(country) {
  return liveAlerts.alerts.filter(a => 
    a.destination?.country?.toLowerCase() === country.toLowerCase()
  );
}

/**
 * Get alerts by product
 */
function getAlertsByProduct(product) {
  return liveAlerts.alerts.filter(a => 
    a.product?.toLowerCase().includes(product.toLowerCase())
  );
}

/**
 * Get alerts by hazard
 */
function getAlertsByHazard(hazard) {
  return liveAlerts.alerts.filter(a => 
    a.hazard?.toLowerCase() === hazard.toLowerCase()
  );
}

/**
 * Get alerts by port of entry
 */
function getAlertsByPort(port) {
  return liveAlerts.alerts.filter(a => 
    a.portOfEntry?.toLowerCase() === port.toLowerCase()
  );
}

/**
 * Get recent alerts (last N days)
 */
function getRecentAlerts(days = 7) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  
  return liveAlerts.alerts.filter(a => new Date(a.date) >= cutoff);
}

/**
 * Get notifications
 */
function getNotifications(limit = 10) {
  return liveAlerts.notifications.slice(-limit);
}

/**
 * Check if specific product/origin combination has recent alerts
 */
function checkProductRisk(product, originCountry) {
  const alerts = liveAlerts.alerts.filter(a => 
    a.product?.toLowerCase().includes(product.toLowerCase()) &&
    a.origin?.country?.toLowerCase() === originCountry.toLowerCase()
  );
  
  if (alerts.length === 0) return null;
  
  const recentAlerts = alerts.slice(0, 5);
  const hazards = [...new Set(alerts.map(a => a.hazard))];
  
  return {
    product,
    origin: originCountry,
    totalAlerts: alerts.length,
    recentAlerts: recentAlerts.length,
    hazards,
    lastAlert: alerts[0]?.date,
    riskLevel: alerts.length > 5 ? 'HIGH' : alerts.length > 2 ? 'MEDIUM' : 'LOW',
    recommendations: generateRecommendations(alerts)
  };
}

/**
 * Generate recommendations based on alerts
 */
function generateRecommendations(alerts) {
  const recommendations = [];
  const hazards = [...new Set(alerts.map(a => a.hazard))];
  
  if (hazards.includes('salmonella')) {
    recommendations.push('MANDATORY: Test for Salmonella before shipping');
  }
  if (hazards.includes('aflatoxin')) {
    recommendations.push('MANDATORY: Test for aflatoxin levels');
  }
  if (hazards.includes('pesticide_residue')) {
    recommendations.push('MANDATORY: Full pesticide panel required');
  }
  if (hazards.includes('cadmium')) {
    recommendations.push('REQUIRED: Heavy metals test for cocoa');
  }
  
  // Add destination-specific advice
  const destinations = [...new Set(alerts.map(a => a.destination.country))];
  for (const dest of destinations) {
    recommendations.push(`Enhanced inspection likely for ${dest}`);
  }
  
  return recommendations;
}

/**
 * Get all live alerts
 */
function getAllAlerts(limit = 50) {
  return liveAlerts.alerts.slice(0, limit);
}

/**
 * Get statistics
 */
function getStatistics() {
  const total = liveAlerts.alerts.length;
  
  const byHazard = {};
  const byOrigin = {};
  const byDestination = {};
  const byPort = {};
  
  for (const alert of liveAlerts.alerts) {
    byHazard[alert.hazard] = (byHazard[alert.hazard] || 0) + 1;
    byOrigin[alert.origin?.country] = (byOrigin[alert.origin?.country] || 0) + 1;
    byDestination[alert.destination?.country] = (byDestination[alert.destination?.country] || 0) + 1;
    if (alert.portOfEntry) {
      byPort[alert.portOfEntry] = (byPort[alert.portOfEntry] || 0) + 1;
    }
  }
  
  return {
    totalAlerts: total,
    byHazard,
    byOrigin,
    byDestination,
    byPort,
    lastFetch: liveAlerts.lastFetch,
    notificationsCount: liveAlerts.notifications.length
  };
}

/**
 * Get configuration
 */
function getConfig() {
  return {
    sources: config.sources,
    syncInterval: config.syncInterval,
    notifyOn: config.notifyOn,
    totalAlerts: liveAlerts.alerts.length,
    lastFetch: liveAlerts.lastFetch
  };
}

// Initialize on load
initialize().catch(console.error);

module.exports = {
  initialize,
  fetchLiveAlerts,
  getAlertsByOrigin,
  getAlertsByDestination,
  getAlertsByProduct,
  getAlertsByHazard,
  getAlertsByPort,
  getRecentAlerts,
  getNotifications,
  checkProductRisk,
  getAllAlerts,
  getStatistics,
  getConfig
};
