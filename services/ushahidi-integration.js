/**
 * Ushahidi Integration - Community-Driven Market & Security Alerts
 * 
 * Purpose: Real-time market data and security alerts
 * - Navigate "pay or die" banditry
 * - Logistics bottleneck alerts
 * - Market price information
 * - Regional risk mapping
 * 
 * Ushahidi: Originally crisis mapping, adapted for trade intelligence
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(process.env.RENDER_DISK_PATH || '/tmp', 'culbridge', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ==================== CONFIGURATION ====================

const config = {
  // Service settings
  service: 'Ushahidi',
  version: '1.0.0',
  
  // Alert categories
  categories: [
    'security',
    'market_price',
    'logistics',
    'infrastructure',
    'weather',
    'regulatory',
    'export_alert'
  ],
  
  // Risk levels
  riskLevels: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
  
  // Regions of interest
  regions: [
    { country: 'Nigeria', code: 'NG', states: ['Lagos', 'Kano', 'Oyo', 'Delta', 'Rivers'] },
    { country: 'Ghana', code: 'GH', regions: ['Ashanti', 'Greater Accra', 'Western'] },
    { country: 'Ivory Coast', code: 'CI', regions: ['Abidjan', 'Daloa', 'Bouafle'] },
    { country: 'Cameroon', code: 'CM', regions: ['Littoral', 'Southwest', 'Northwest'] }
  ],
  
  // Storage
  dataPath: path.join(DATA_DIR, 'ushahidi_alerts.json'),
  reportsPath: path.join(DATA_DIR, 'ushahidi_reports.json'),
  pricesPath: path.join(DATA_DIR, 'ushahidi_prices.json')
};

// ==================== IN-MEMORY STORAGE ====================

let alerts = {
  lastUpdated: null,
  alerts: []
};

let reports = {
  lastUpdated: null,
  reports: []
};

let prices = {
  lastUpdated: null,
  prices: []
};

// ==================== SAMPLE DATA ====================

// Sample security/logistics alerts
const sampleAlerts = [
  // Security alerts
  {
    id: 'USH-2026-001',
    category: 'security',
    type: 'banditry',
    title: 'Bandit Activity on Lagos-Kano Highway',
    description: 'Reports of armed banditry near Katina forest. Multiple transport companies holding cargo.',
    region: { country: 'Nigeria', state: 'Niger' },
    coordinates: { lat: 10.4, lon: 7.2 },
    riskLevel: 'CRITICAL',
    affectedRoutes: ['Lagos-Kano'],
    date: '2026-03-25',
    source: 'community',
    verified: true,
    upvotes: 45,
    response: 'reroute'
  },
  {
    id: 'USH-2026-002',
    category: 'security',
    type: 'checkpoint_extortion',
    title: 'Multiple Illegal Checkpoints - Benin Border',
    description: 'Extortion checkpoints increasing near Seme border. Average delay 3 hours.',
    region: { country: 'Nigeria', state: 'Ogun' },
    coordinates: { lat: 6.4, lon: 2.9 },
    riskLevel: 'HIGH',
    affectedRoutes: ['Lagos-Seme', ' Cotonou'],
    date: '2026-03-24',
    source: 'community',
    verified: true,
    upvotes: 32,
    response: 'avoid'
  },
  {
    id: 'USH-2026-003',
    category: 'logistics',
    type: 'port_delay',
    title: 'Port Congestion - Apapa Terminal',
    description: 'Container clearance backlog extending to 21 days. Truck turnaround 96+ hours.',
    region: { country: 'Nigeria', state: 'Lagos' },
    coordinates: { lat: 6.5, lon: 3.3 },
    riskLevel: 'HIGH',
    affectedRoutes: ['Apapa Port'],
    date: '2026-03-23',
    source: 'port_authority',
    verified: true,
    upvotes: 78,
    response: 'delay_expected'
  },
  // Market price alerts
  {
    id: 'USH-2026-004',
    category: 'market_price',
    type: 'price_spike',
    title: 'Sesame Price Increase - 40%',
    description: 'Market price surge due to export demand. Local farmers holding stock.',
    region: { country: 'Nigeria', state: 'Oyo' },
    priceImpact: '+40%',
    date: '2026-03-22',
    source: 'market',
    verified: true,
    upvotes: 15
  },
  {
    id: 'USH-2026-005',
    category: 'market_price',
    type: 'price_drop',
    title: 'Cocoa Price Decline',
    description: 'Price adjustment following international market movement.',
    region: { country: 'Ghana', region: 'Ashanti' },
    priceImpact: '-8%',
    date: '2026-03-21',
    source: 'market',
    verified: false,
    upvotes: 8
  },
  // Infrastructure alerts
  {
    id: 'USH-2026-006',
    category: 'infrastructure',
    type: 'road_damage',
    title: 'Bridge Closure - Ife-Ilesha Road',
    description: 'Culvert collapse. Alternative route adds 4 hours.',
    region: { country: 'Nigeria', state: 'Osun' },
    coordinates: { lat: 7.5, lon: 4.5 },
    riskLevel: 'MEDIUM',
    affectedRoutes: ['Ibadan-Ilesha'],
    date: '2026-03-20',
    source: 'community',
    verified: true,
    upvotes: 22,
    response: 'reroute'
  },
  // Export alerts
  {
    id: 'USH-2026-007',
    category: 'export_alert',
    type: 'customs_delay',
    title: 'Customs Strike - Tin Can Island',
    description: 'Strike action by customs officers. Operations suspended.',
    region: { country: 'Nigeria', state: 'Lagos' },
    riskLevel: 'HIGH',
    affectedRoutes: ['Tin Can Port'],
    date: '2026-03-19',
    source: 'customs',
    verified: true,
    upvotes: 56,
    response: 'use_alternative_port'
  },
  // Weather alerts
  {
    id: 'USH-2026-008',
    category: 'weather',
    type: 'flood_warning',
    title: 'Flood Alert - Niger River Delta',
    description: 'Heavy rainfall causing flooding. Road access restricted.',
    region: { country: 'Nigeria', state: 'Delta' },
    coordinates: { lat: 5.5, lon: 6.0 },
    riskLevel: 'MEDIUM',
    affectedRoutes: ['Warri-Benin'],
    date: '2026-03-18',
    source: 'weather_service',
    verified: true,
    upvotes: 19,
    response: 'delay_expected'
  }
];

// Sample market prices
const samplePrices = [
  { product: 'sesame seeds', region: 'Nigeria-Oyo', pricePerKg: 850, currency: 'NGN', date: '2026-03-25', trend: 'up' },
  { product: 'sesame seeds', region: 'Nigeria-Kano', pricePerKg: 820, currency: 'NGN', date: '2026-03-25', trend: 'stable' },
  { product: 'cocoa beans', region: 'Nigeria-Ondo', pricePerKg: 2100, currency: 'NGN', date: '2026-03-25', trend: 'down' },
  { product: 'cocoa beans', region: 'Ghana-Ashanti', pricePerKg: 12.50, currency: 'USD', date: '2026-03-25', trend: 'down' },
  { product: 'cocoa beans', region: 'Ivory Coast-Daloa', pricePerKg: 1050, currency: 'XOF', date: '2026-03-25', trend: 'stable' },
  { product: 'groundnuts', region: 'Nigeria-Kano', pricePerKg: 450, currency: 'NGN', date: '2026-03-25', trend: 'up' },
  { product: 'cashew nuts', region: 'Nigeria-Benue', pricePerKg: 1200, currency: 'NGN', date: '2026-03-25', trend: 'stable' },
  { product: 'ginger', region: 'Nigeria-Kogi', pricePerKg: 380, currency: 'NGN', date: '2026-03-25', trend: 'up' }
];

// ==================== CORE FUNCTIONS ====================

/**
 * Initialize Ushahidi service
 */
async function initialize() {
  console.log('Ushahidi Service initializing...');
  await loadData();
  console.log(`Ushahidi: ${alerts.alerts.length} alerts, ${prices.prices.length} prices`);
  return true;
}

/**
 * Load data from storage
 */
async function loadData() {
  try {
    if (fs.existsSync(config.dataPath)) {
      const data = fs.readFileSync(config.dataPath, 'utf8');
      alerts = JSON.parse(data);
    } else {
      alerts.alerts = sampleAlerts;
      alerts.lastUpdated = new Date().toISOString();
    }
    
    if (fs.existsSync(config.pricesPath)) {
      const data = fs.readFileSync(config.pricesPath, 'utf8');
      prices = JSON.parse(data);
    } else {
      prices.prices = samplePrices;
      prices.lastUpdated = new Date().toISOString();
    }
    
    saveData();
  } catch (error) {
    console.log('Loading sample Ushahidi data...');
    alerts.alerts = sampleAlerts;
    alerts.lastUpdated = new Date().toISOString();
    prices.prices = samplePrices;
    prices.lastUpdated = new Date().toISOString();
    saveData();
  }
}

/**
 * Save data to storage
 */
function saveData() {
  try {
    fs.writeFileSync(config.dataPath, JSON.stringify(alerts, null, 2));
    fs.writeFileSync(config.pricesPath, JSON.stringify(prices, null, 2));
  } catch (error) {
    console.error('Failed to save Ushahidi data:', error.message);
  }
}

/**
 * Get all alerts with filters
 */
function getAlerts(filters = {}) {
  let result = [...alerts.alerts];
  
  if (filters.category) {
    result = result.filter(a => a.category === filters.category);
  }
  if (filters.riskLevel) {
    result = result.filter(a => a.riskLevel === filters.riskLevel);
  }
  if (filters.country) {
    result = result.filter(a => a.region?.country === filters.country);
  }
  if (filters.state) {
    result = result.filter(a => a.region?.state === filters.state);
  }
  if (filters.type) {
    result = result.filter(a => a.type === filters.type);
  }
  if (filters.verified) {
    result = result.filter(a => a.verified === true);
  }
  
  // Sort by date and risk level
  result.sort((a, b) => {
    const riskOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    return riskOrder[a.riskLevel] - riskOrder[b.riskLevel];
  });
  
  return result;
}

/**
 * Get alerts by region
 */
function getAlertsByRegion(country, state = null) {
  return alerts.alerts.filter(a => {
    if (a.region.country !== country) return false;
    if (state && a.region.state !== state) return false;
    return true;
  });
}

/**
 * Get critical alerts
 */
function getCriticalAlerts() {
  return alerts.alerts.filter(a => a.riskLevel === 'CRITICAL' || a.riskLevel === 'HIGH');
}

/**
 * Get security alerts only
 */
function getSecurityAlerts() {
  return alerts.alerts.filter(a => a.category === 'security');
}

/**
 * Get logistics alerts
 */
function getLogisticsAlerts() {
  return alerts.alerts.filter(a => a.category === 'logistics');
}

/**
 * Check route safety
 */
function checkRouteSafety(route) {
  const routeAlerts = alerts.alerts.filter(a => {
    if (!a.affectedRoutes) return false;
    return a.affectedRoutes.some(r => route.toLowerCase().includes(r.toLowerCase()));
  });
  
  if (routeAlerts.length === 0) {
    return {
      route,
      status: 'CLEAR',
      alerts: [],
      riskLevel: 'LOW',
      recommendation: 'Route appears clear'
    };
  }
  
  // Get highest risk
  const riskLevels = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
  const maxRisk = routeAlerts.reduce((max, a) => 
    riskLevels[a.riskLevel] > riskLevels[max.riskLevel] ? a : max
  , routeAlerts[0]);
  
  return {
    route,
    status: maxRisk.riskLevel === 'CRITICAL' ? 'BLOCKED' : 'CAUTION',
    alerts: routeAlerts.length,
    riskLevel: maxRisk.riskLevel,
    latestAlert: maxRisk.date,
    recommendation: maxRisk.response || 'Check alternative routes',
    alertDetails: routeAlerts.slice(0, 3)
  };
}

/**
 * Get market prices
 */
function getMarketPrices(product = null, region = null) {
  let result = [...prices.prices];
  
  if (product) {
    result = result.filter(p => p.product.toLowerCase().includes(product.toLowerCase()));
  }
  if (region) {
    result = result.filter(p => p.region.toLowerCase().includes(region.toLowerCase()));
  }
  
  return result;
}

/**
 * Get price comparison
 */
function getPriceComparison(product) {
  const productPrices = prices.prices.filter(p => 
    p.product.toLowerCase().includes(product.toLowerCase())
  );
  
  if (productPrices.length === 0) {
    return { product, error: 'No price data available' };
  }
  
  const pricesByRegion = productPrices.reduce((acc, p) => {
    acc[p.region] = p.pricePerKg;
    return acc;
  }, {});
  
  const avgPrice = productPrices.reduce((sum, p) => sum + p.pricePerKg, 0) / productPrices.length;
  
  // Normalize to USD for comparison
  const exchangeRates = { NGN: 0.00065, USD: 1, XOF: 0.0016 };
  
  const usdPrices = productPrices.map(p => ({
    ...p,
    priceUSD: p.pricePerKg * (exchangeRates[p.currency] || 1)
  }));
  
  const avgUSD = usdPrices.reduce((sum, p) => sum + p.priceUSD, 0) / usdPrices.length;
  
  return {
    product,
    regions: pricesByRegion,
    averagePrice: avgPrice,
    averagePriceUSD: avgUSD,
    lowest: Math.min(...usdPrices.map(p => p.priceUSD)),
    highest: Math.max(...usdPrices.map(p => p.priceUSD)),
    trend: productPrices[0]?.trend || 'stable'
  };
}

/**
 * Add new alert
 */
function addAlert(alertData) {
  const alert = {
    id: `USH-${Date.now()}`,
    ...alertData,
    date: alertData.date || new Date().toISOString().split('T')[0],
    upvotes: 0,
    verified: false,
    source: alertData.source || 'api'
  };
  
  alerts.alerts.unshift(alert);
  alerts.lastUpdated = new Date().toISOString();
  saveData();
  
  return alert;
}

/**
 * Vote for alert (verify)
 */
function upvoteAlert(alertId) {
  const alert = alerts.alerts.find(a => a.id === alertId);
  if (!alert) return null;
  
  alert.upvotes = (alert.upvotes || 0) + 1;
  alert.verified = alert.upvotes >= 5; // Auto-verify at 5 upvotes
  
  saveData();
  return alert;
}

/**
 * Get regional risk summary
 */
function getRegionalRiskSummary(country) {
  const regionAlerts = getAlertsByRegion(country);
  
  const byCategory = {};
  const byRisk = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  
  for (const alert of regionAlerts) {
    byCategory[alert.category] = (byCategory[alert.category] || 0) + 1;
    byRisk[alert.riskLevel]++;
  }
  
  const overallRisk = byRisk.CRITICAL > 0 ? 'CRITICAL' :
                    byRisk.HIGH > 0 ? 'HIGH' :
                    byRisk.MEDIUM > 0 ? 'MEDIUM' : 'LOW';
  
  return {
    country,
    totalAlerts: regionAlerts.length,
    byCategory,
    byRisk,
    overallRisk,
    lastUpdated: alerts.lastUpdated
  };
}

/**
 * Get statistics
 */
function getStatistics() {
  const byCategory = alerts.alerts.reduce((acc, a) => {
    acc[a.category] = (acc[a.category] || 0) + 1;
    return acc;
  }, {});
  
  const byRisk = alerts.alerts.reduce((acc, a) => {
    acc[a.riskLevel] = (acc[a.riskLevel] || 0) + 1;
    return acc;
  }, {});
  
  const criticalRoutes = alerts.alerts
    .filter(a => a.affectedRoutes && (a.riskLevel === 'CRITICAL' || a.riskLevel === 'HIGH'))
    .map(a => a.affectedRoutes)
    .flat();
  
  return {
    totalAlerts: alerts.alerts.length,
    byCategory,
    byRisk,
    criticalRoutesAffected: [...new Set(criticalRoutes)],
    pricesCount: prices.prices.length,
    lastUpdated: alerts.lastUpdated
  };
}

/**
 * Get configuration
 */
function getConfig() {
  return {
    service: config.service,
    version: config.version,
    categories: config.categories,
    riskLevels: config.riskLevels,
    regions: config.regions,
    alertsCount: alerts.alerts.length,
    pricesCount: prices.prices.length
  };
}

// Initialize on load
initialize().catch(console.error);

module.exports = {
  initialize,
  getAlerts,
  getAlertsByRegion,
  getCriticalAlerts,
  getSecurityAlerts,
  getLogisticsAlerts,
  checkRouteSafety,
  getMarketPrices,
  getPriceComparison,
  addAlert,
  upvoteAlert,
  getRegionalRiskSummary,
  getStatistics,
  getConfig
};
