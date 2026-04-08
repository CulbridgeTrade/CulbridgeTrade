/**
 * RASFF - Rapid Alert System for Food and Feed
 * 
 * Purpose: Ground truth of enforcement behavior
 * 
 * Ingests alerts from RASFF database and provides:
 * - Historical rejection rates by product/country
 * - Hazard analysis
 * - Port-specific enforcement patterns
 * 
 * Integration:
 * - Feeds into XGBoost features
 * - Feeds into behavioral risk adjustments
 * 
 * Data Source: RASFF (EU Rapid Alert System)
 */

const fs = require('fs');
const path = require('path');

// ==================== CONFIGURATION ====================

const config = {
  // Storage path
  dataPath: path.join(__dirname, '..', 'data', 'rasff_alerts.json'),
  
  // Sync frequency (in milliseconds)
  // Default: 6 hours = 21600000 ms
  syncInterval: 6 * 60 * 60 * 1000,
  
  // Product categories to track
  productCategories: [
    'sesame seeds',
    'groundnuts',
    'peanuts',
    'cocoa beans',
    'cashew nuts',
    'ginger'
  ],
  
  // Hazard types
  hazardTypes: [
    'salmonella',
    'aflatoxin',
    'pesticide',
    'heavy metals',
    'mycotoxin',
    'foreign body',
    'listeria',
    'e.coli'
  ]
};

// ==================== IN-MEMORY STORAGE ====================

let alerts = {
  lastSynced: null,
  alerts: []
};

// ==================== SAMPLE DATA (MVP) ====================

// Historical RASFF alerts for Nigeria → EU (simulated)
const sampleAlerts = [
  // Sesame Seeds - High rejection rate
  { product: 'sesame seeds', hazard: 'salmonella', origin_country: 'Nigeria', action: 'rejected', port: 'Rotterdam', date: '2026-03-15' },
  { product: 'sesame seeds', hazard: 'salmonella', origin_country: 'Nigeria', action: 'rejected', port: 'Hamburg', date: '2026-03-12' },
  { product: 'sesame seeds', hazard: 'salmonella', origin_country: 'Nigeria', action: 'rejected', port: 'Antwerp', date: '2026-03-10' },
  { product: 'sesame seeds', hazard: 'salmonella', origin_country: 'Nigeria', action: 'rejected', port: 'Rotterdam', date: '2026-03-08' },
  { product: 'sesame seeds', hazard: 'pesticide', origin_country: 'Nigeria', action: 'rejected', port: 'Hamburg', date: '2026-03-05' },
  { product: 'sesame seeds', hazard: 'pesticide', origin_country: 'Nigeria', action: 'border_rejected', port: 'Rotterdam', date: '2026-03-01' },
  { product: 'sesame seeds', hazard: 'salmonella', origin_country: 'Nigeria', action: 'rejected', port: 'Antwerp', date: '2026-02-25' },
  { product: 'sesame seeds', hazard: 'aflatoxin', origin_country: 'Nigeria', action: 'rejected', port: 'Rotterdam', date: '2026-02-20' },
  { product: 'sesame seeds', hazard: 'salmonella', origin_country: 'Nigeria', action: 'rejected', port: 'Hamburg', date: '2026-02-15' },
  { product: 'sesame seeds', hazard: 'salmonella', origin_country: 'Nigeria', action: 'destroyed', port: 'Rotterdam', date: '2026-02-10' },
  
  // Groundnuts/Peanuts - High rejection
  { product: 'groundnuts', hazard: 'aflatoxin', origin_country: 'Nigeria', action: 'rejected', port: 'Rotterdam', date: '2026-03-14' },
  { product: 'groundnuts', hazard: 'aflatoxin', origin_country: 'Nigeria', action: 'rejected', port: 'Hamburg', date: '2026-03-09' },
  { product: 'groundnuts', hazard: 'aflatoxin', origin_country: 'Nigeria', action: 'destroyed', port: 'Antwerp', date: '2026-03-04' },
  { product: 'peanuts', hazard: 'aflatoxin', origin_country: 'Nigeria', action: 'rejected', port: 'Rotterdam', date: '2026-02-28' },
  { product: 'peanuts', hazard: 'pesticide', origin_country: 'Nigeria', action: 'rejected', port: 'Hamburg', date: '2026-02-22' },
  { product: 'groundnuts', hazard: 'aflatoxin', origin_country: 'Nigeria', action: 'rejected', port: 'Antwerp', date: '2026-02-18' },
  
  // Cocoa Beans
  { product: 'cocoa beans', hazard: 'heavy metals', origin_country: 'Nigeria', action: 'border_rejected', port: 'Rotterdam', date: '2026-03-11' },
  { product: 'cocoa beans', hazard: 'pesticide', origin_country: 'Nigeria', action: 'rejected', port: 'Hamburg', date: '2026-02-26' },
  { product: 'cocoa beans', hazard: 'cadmium', origin_country: 'Nigeria', action: 'border_rejected', port: 'Antwerp', date: '2026-02-12' },
  
  // Cashew Nuts
  { product: 'cashew nuts', hazard: 'pesticide', origin_country: 'Nigeria', action: 'rejected', port: 'Rotterdam', date: '2026-03-07' },
  { product: 'cashew nuts', hazard: 'salmonella', origin_country: 'Nigeria', action: 'rejected', port: 'Hamburg', date: '2026-02-23' },
  { product: 'cashew nuts', hazard: 'pesticide', origin_country: 'Nigeria', action: 'border_rejected', port: 'Antwerp', date: '2026-02-08' },
  
  // Ginger
  { product: 'ginger', hazard: 'pesticide', origin_country: 'Nigeria', action: 'rejected', port: 'Rotterdam', date: '2026-03-13' },
  { product: 'ginger', hazard: 'pesticide', origin_country: 'Nigeria', action: 'border_rejected', port: 'Hamburg', date: '2026-03-06' },
  { product: 'ginger', hazard: 'salmonella', origin_country: 'Nigeria', action: 'rejected', port: 'Antwerp', date: '2026-02-19' },
  
  // Mixed origins (for comparison)
  { product: 'sesame seeds', hazard: 'salmonella', origin_country: 'Ethiopia', action: 'rejected', port: 'Rotterdam', date: '2026-02-14' },
  { product: 'groundnuts', hazard: 'aflatoxin', origin_country: 'Ghana', action: 'rejected', port: 'Hamburg', date: '2026-02-11' }
];

// ==================== CORE FUNCTIONS ====================

/**
 * Initialize RASFF service
 */
async function initialize() {
  console.log('RASFF Service initializing...');
  await loadAlerts();
  
  // Initialize with sample data if empty
  if (alerts.alerts.length === 0) {
    await initializeSampleData();
  }
  
  console.log(`RASFF: ${alerts.alerts.length} alerts loaded`);
  return true;
}

/**
 * Load alerts from storage
 */
async function loadAlerts() {
  try {
    if (fs.existsSync(config.dataPath)) {
      const data = fs.readFileSync(config.dataPath, 'utf8');
      alerts = JSON.parse(data);
    }
  } catch (error) {
    console.log('No existing alerts found');
  }
}

/**
 * Save alerts to storage
 */
async function saveAlerts() {
  try {
    const dataDir = path.dirname(config.dataPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(config.dataPath, JSON.stringify(alerts, null, 2));
  } catch (error) {
    console.error('Failed to save alerts:', error.message);
  }
}

/**
 * Initialize sample data (for MVP)
 */
async function initializeSampleData() {
  console.log('Loading sample RASFF data...');
  
  alerts.alerts = sampleAlerts.map((alert, index) => ({
    id: `RASFF-${String(index + 1).padStart(4, '0')}`,
    ...alert,
    alert_date: new Date(alert.date).toISOString(),
    created_at: new Date().toISOString()
  }));
  
  alerts.lastSynced = new Date().toISOString();
  await saveAlerts();
}

/**
 * Sync from RASFF API (simulated for MVP)
 * In production, would fetch from RASFF RSS/API
 */
async function syncFromAPI() {
  console.log('Syncing alerts from RASFF...');
  
  // Simulated API sync
  // In production, would fetch from RASFF database/API
  
  alerts.lastSynced = new Date().toISOString();
  await saveAlerts();
  
  return {
    success: true,
    alertsCount: alerts.alerts.length,
    lastSynced: alerts.lastSynced
  };
}

/**
 * Add single alert
 */
async function addAlert(alertData) {
  const alert = {
    id: `RASFF-${Date.now()}`,
    ...alertData,
    alert_date: alertData.date || new Date().toISOString(),
    created_at: new Date().toISOString()
  };
  
  alerts.alerts.push(alert);
  await saveAlerts();
  
  return alert;
}

/**
 * Get rejection rate by product
 */
function getRejectionRateByProduct(product) {
  const productAlerts = alerts.alerts.filter(a => 
    a.product?.toLowerCase().includes(product.toLowerCase())
  );
  
  if (productAlerts.length === 0) return null;
  
  const rejected = productAlerts.filter(a => 
    a.action === 'rejected' || 
    a.action === 'border_rejected' ||
    a.action === 'destroyed'
  ).length;
  
  return {
    product,
    totalAlerts: productAlerts.length,
    rejections: rejected,
    rejectionRate: rejected / productAlerts.length,
    lastAlert: productAlerts[productAlerts.length - 1]?.alert_date
  };
}

/**
 * Get rejection rate by origin country
 */
function getRejectionRateByOrigin(country) {
  const countryAlerts = alerts.alerts.filter(a => 
    a.origin_country?.toLowerCase() === country.toLowerCase()
  );
  
  if (countryAlerts.length === 0) return null;
  
  const rejected = countryAlerts.filter(a => 
    a.action === 'rejected' || 
    a.action === 'border_rejected' ||
    a.action === 'destroyed'
  ).length;
  
  return {
    country,
    totalAlerts: countryAlerts.length,
    rejections: rejected,
    rejectionRate: rejected / countryAlerts.length
  };
}

/**
 * Get rejection rate by port
 */
function getRejectionRateByPort(port) {
  const portAlerts = alerts.alerts.filter(a => 
    a.port?.toLowerCase() === port.toLowerCase()
  );
  
  if (portAlerts.length === 0) return null;
  
  const rejected = portAlerts.filter(a => 
    a.action === 'rejected' || 
    a.action === 'border_rejected' ||
    a.action === 'destroyed'
  ).length;
  
  return {
    port,
    totalAlerts: portAlerts.length,
    rejections: rejected,
    rejectionRate: rejected / portAlerts.length
  };
}

/**
 * Get top hazards for product
 */
function getTopHazards(product, limit = 5) {
  const productAlerts = alerts.alerts.filter(a => 
    a.product?.toLowerCase().includes(product.toLowerCase())
  );
  
  const hazardCounts = {};
  for (const alert of productAlerts) {
    hazardCounts[alert.hazard] = (hazardCounts[alert.hazard] || 0) + 1;
  }
  
  const sorted = Object.entries(hazardCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
  
  return sorted.map(([hazard, count]) => ({
    hazard,
    count,
    percentage: count / productAlerts.length
  }));
}

/**
 * Get all alerts (with filters)
 */
function getAlerts(filters = {}) {
  let result = [...alerts.alerts];
  
  if (filters.product) {
    result = result.filter(a => 
      a.product?.toLowerCase().includes(filters.product.toLowerCase())
    );
  }
  
  if (filters.origin) {
    result = result.filter(a => 
      a.origin_country?.toLowerCase() === filters.origin.toLowerCase()
    );
  }
  
  if (filters.port) {
    result = result.filter(a => 
      a.port?.toLowerCase() === filters.port.toLowerCase()
    );
  }
  
  if (filters.hazard) {
    result = result.filter(a => 
      a.hazard?.toLowerCase().includes(filters.hazard.toLowerCase())
    );
  }
  
  if (filters.action) {
    result = result.filter(a => a.action === filters.action);
  }
  
  if (filters.since) {
    const sinceDate = new Date(filters.since);
    result = result.filter(a => new Date(a.alert_date) >= sinceDate);
  }
  
  return result;
}

/**
 * Get derived features for XGBoost / Decision Engine
 * Integration: XGBoost features, behavioral risk adjustments
 */
function getDerivedFeatures(shipmentData) {
  const { product, origin_country, destination_port } = shipmentData;
  
  const features = {
    productRejectionRate: 0,
    originRejectionRate: 0,
    portRejectionRate: 0,
    topHazards: [],
    enforcementIntensity: 'LOW',
    riskMultiplier: 1.0
  };
  
  // Get product rejection rate
  const productRate = product ? getRejectionRateByProduct(product) : null;
  if (productRate) {
    features.productRejectionRate = productRate.rejectionRate;
  }
  
  // Get origin rejection rate
  const originRate = origin_country ? getRejectionRateByOrigin(origin_country) : null;
  if (originRate) {
    features.originRejectionRate = originRate.rejectionRate;
  }
  
  // Get port rejection rate
  const portRate = destination_port ? getRejectionRateByPort(destination_port) : null;
  if (portRate) {
    features.portRejectionRate = portRate.rejectionRate;
  }
  
  // Get top hazards
  if (product) {
    features.topHazards = getTopHazards(product, 3);
  }
  
  // Calculate enforcement intensity
  const avgRate = (
    features.productRejectionRate + 
    features.originRejectionRate + 
    features.portRejectionRate
  ) / 3;
  
  if (avgRate > 0.5) {
    features.enforcementIntensity = 'VERY_HIGH';
    features.riskMultiplier = 1.5;
  } else if (avgRate > 0.3) {
    features.enforcementIntensity = 'HIGH';
    features.riskMultiplier = 1.3;
  } else if (avgRate > 0.15) {
    features.enforcementIntensity = 'MEDIUM';
    features.riskMultiplier = 1.15;
  } else {
    features.enforcementIntensity = 'LOW';
    features.riskMultiplier = 1.0;
  }
  
  return features;
}

/**
 * Get aggregate statistics
 */
function getStatistics() {
  const totalAlerts = alerts.alerts.length;
  const totalRejections = alerts.alerts.filter(a => 
    a.action === 'rejected' || 
    a.action === 'border_rejected' ||
    a.action === 'destroyed'
  ).length;
  
  const byProduct = {};
  const byOrigin = {};
  const byPort = {};
  
  for (const alert of alerts.alerts) {
    byProduct[alert.product] = (byProduct[alert.product] || 0) + 1;
    byOrigin[alert.origin_country] = (byOrigin[alert.origin_country] || 0) + 1;
    if (alert.port) {
      byPort[alert.port] = (byPort[alert.port] || 0) + 1;
    }
  }
  
  return {
    totalAlerts,
    totalRejections,
    overallRejectionRate: totalRejections / totalAlerts,
    byProduct,
    byOrigin,
    byPort,
    lastSynced: alerts.lastSynced
  };
}

/**
 * Get configuration
 */
function getConfig() {
  return {
    productCategories: config.productCategories,
    hazardTypes: config.hazardTypes,
    syncInterval: config.syncInterval,
    totalAlerts: alerts.alerts.length,
    lastSynced: alerts.lastSynced
  };
}

// Initialize on load
initialize().catch(console.error);

module.exports = {
  initialize,
  syncFromAPI,
  addAlert,
  getRejectionRateByProduct,
  getRejectionRateByOrigin,
  getRejectionRateByPort,
  getTopHazards,
  getAlerts,
  getDerivedFeatures,
  getStatistics,
  getConfig
};
