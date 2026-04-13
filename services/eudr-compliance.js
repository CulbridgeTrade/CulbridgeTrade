/**
 * EUDR / GeoCledian Compliance Service
 * 
 * Purpose: Prevent EU shipment bans by proving "deforestation-free" status
 * - EUDR: EU Deforestation Regulation compliance
 * - GeoCledian: Spatial deforestation risk scoring
 * 
 * Integration: Deterministic Engine
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(process.env.RENDER_DISK_PATH || '/tmp', 'culbridge', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ==================== CONFIGURATION ====================

const config = {
  // EUDR API (simulated - in production would use real EUDR system)
  eudr: {
    apiBaseUrl: 'https://ec.europa.eu/eudr/api',
    // Product categories under EUDR
    regulatedProducts: [
      'cocoa beans', 'coffee', 'timber', 'palm oil',
      'soybeans', 'beef', 'rubber', 'shea'
    ],
    // HS codes for regulated products
    hsCodes: {
      '180100': 'cocoa beans',
      '090111': 'coffee',
      '440710': 'timber',
      '151190': 'palm oil',
      '120190': 'soybeans',
      '020110': 'beef',
      '400110': 'rubber'
    }
  },
  
  // GeoCledian API (simulated - spatial risk)
  geocledian: {
    apiBaseUrl: 'https://geocledian.com/api',
    // Risk thresholds
    highRiskThreshold: 0.5,
    mediumRiskThreshold: 0.25
  },
  
  // Storage
  dataPath: path.join(DATA_DIR, 'eudr_compliance.json')
};

// ==================== IN-MEMORY STORAGE ====================

let complianceData = {
  lastChecked: null,
  records: []
};

// ==================== SAMPLE DATA ====================

// Sample EUDR compliance records
const sampleRecords = [
  {
    shipmentId: 'COCOA-NG-001',
    product: 'cocoa beans',
    hsCode: '180100',
    exporterId: 'EXP-NG-001',
    exporterName: 'Premium Cocoa Exports Ltd',
    origin: { country: 'Nigeria', region: 'Ondo', coordinates: { lat: 7.0, lon: 4.7 } },
    farmPlotId: 'PLOT-NG-ODO-001',
    harvestDate: '2026-01-15',
    eudrStatus: 'COMPLIANT',
    deforestationFree: true,
    geocledianRiskScore: 0.12,
    geocledianRiskLevel: 'LOW',
    riskFactors: [],
    checkedAt: '2026-03-20T10:00:00Z',
    certificate: 'EUDR-CERT-001'
  },
  {
    shipmentId: 'COCOA-NG-002',
    product: 'cocoa beans',
    hsCode: '180100',
    exporterId: 'EXP-NG-002',
    exporterName: 'Nigerian Cocoa Co',
    origin: { country: 'Nigeria', region: 'Edo', coordinates: { lat: 6.5, lon: 5.6 } },
    farmPlotId: 'PLOT-NG-EDO-002',
    harvestDate: '2026-02-01',
    eudrStatus: 'COMPLIANT',
    deforestationFree: true,
    geocledianRiskScore: 0.28,
    geocledianRiskLevel: 'MEDIUM',
    riskFactors: ['proximity_to_forest'],
    checkedAt: '2026-03-18T14:30:00Z',
    certificate: 'EUDR-CERT-002'
  },
  {
    shipmentId: 'COCOA-GH-001',
    product: 'cocoa beans',
    hsCode: '180100',
    exporterId: 'EXP-GH-001',
    exporterName: 'Ghana Sustainable Cocoa',
    origin: { country: 'Ghana', region: 'Ashanti', coordinates: { lat: 6.8, lon: -1.5 } },
    farmPlotId: 'PLOT-GH-ASH-001',
    harvestDate: '2026-01-20',
    eudrStatus: 'COMPLIANT',
    deforestationFree: true,
    geocledianRiskScore: 0.08,
    geocledianRiskLevel: 'LOW',
    riskFactors: [],
    checkedAt: '2026-03-19T09:15:00Z',
    certificate: 'EUDR-CERT-003'
  },
  {
    shipmentId: 'TIMBER-LBR-001',
    product: 'timber',
    hsCode: '440710',
    exporterId: 'EXP-LBR-001',
    exporterName: 'Liberia Forest Products',
    origin: { country: 'Liberia', region: 'Nimba', coordinates: { lat: 7.5, lon: -8.5 } },
    farmPlotId: 'PLOT-LBR-NIM-001',
    harvestDate: '2025-12-10',
    eudrStatus: 'NON_COMPLIANT',
    deforestationFree: false,
    geocledianRiskScore: 0.78,
    geocledianRiskLevel: 'HIGH',
    riskFactors: ['recent_deforestation', 'protected_area_proximity', 'no_plot_documentation'],
    checkedAt: '2026-03-15T11:00:00Z',
    certificate: null,
    denialReason: 'Deforestation detected within 5-year period'
  },
  {
    shipmentId: 'COFFEE-ETH-001',
    product: 'coffee',
    hsCode: '090111',
    exporterId: 'EXP-ETH-001',
    exporterName: 'Ethiopian Coffee Export',
    origin: { country: 'Ethiopia', region: 'Oromia', coordinates: { lat: 9.0, lon: 38.7 } },
    farmPlotId: 'PLOT-ETH-ORO-001',
    harvestDate: '2026-01-05',
    eudrStatus: 'COMPLIANT',
    deforestationFree: true,
    geocledianRiskScore: 0.05,
    geocledianRiskLevel: 'LOW',
    riskFactors: [],
    checkedAt: '2026-03-21T08:45:00Z',
    certificate: 'EUDR-CERT-004'
  }
];

// ==================== CORE FUNCTIONS ====================

/**
 * Initialize EUDR service
 */
async function initialize() {
  console.log('EUDR/GeoCledian Service initializing...');
  await loadData();
  console.log(`EUDR: ${complianceData.records.length} compliance records loaded`);
  return true;
}

/**
 * Load data from storage
 */
async function loadData() {
  try {
    if (fs.existsSync(config.dataPath)) {
      const data = fs.readFileSync(config.dataPath, 'utf8');
      complianceData = JSON.parse(data);
    } else {
      complianceData.records = sampleRecords;
      complianceData.lastChecked = new Date().toISOString();
      saveData();
    }
  } catch (error) {
    console.log('Loading sample EUDR data...');
    complianceData.records = sampleRecords;
    complianceData.lastChecked = new Date().toISOString();
    saveData();
  }
}

/**
 * Save data to storage
 */
function saveData() {
  try {
    fs.writeFileSync(config.dataPath, JSON.stringify(complianceData, null, 2));
  } catch (error) {
    console.error('Failed to save EUDR data:', error.message);
  }
}

/**
 * Check EUDR compliance for a shipment
 * Integration: Deterministic Engine
 */
async function checkEUDR(shipmentData) {
  // Support both id and shipmentId field names
  const shipmentId = shipmentData.shipmentId || shipmentData.id;
  const { product, hsCode, exporterId, origin, farmPlotId, harvestDate, coordinates } = shipmentData;
  
  // Check if product is regulated
  const isRegulated = config.eudr.regulatedProducts.includes(product?.toLowerCase()) || 
                      Object.values(config.eudr.hsCodes).includes(product?.toLowerCase());
  
  if (!isRegulated) {
    return {
      applicable: false,
      message: 'Product not regulated by EUDR',
      eudrStatus: 'NOT_APPLICABLE',
      riskScore: 0
    };
  }
  
  // Check if we have a record
  const existing = complianceData.records.find(r => r.shipmentId === shipmentId);
  if (existing) {
    return buildResult(existing);
  }
  
  // Simulate API call - in production would call EUDR/GeoCledian API
  const result = await simulateEUDRCheck(shipmentData);
  
  // Store result
  complianceData.records.push(result);
  complianceData.lastChecked = new Date().toISOString();
  saveData();
  
  return buildResult(result);
}

/**
 * Simulate EUDR/GeoCledian API call
 */
async function simulateEUDRCheck(shipmentData) {
  const { shipmentId, product, exporterId, origin, farmPlotId, coordinates, harvestDate } = shipmentData;
  
  // Simulate GeoCledian risk score based on coordinates
  // In production, would call real API
  let riskScore = Math.random() * 0.3; // Low to medium for most
  
  // High risk for certain regions (simulated)
  if (origin?.region === 'Amazon' || origin?.region === 'Borneo') {
    riskScore = 0.7 + Math.random() * 0.3;
  }
  
  const riskLevel = riskScore > config.geocledian.highRiskThreshold ? 'HIGH' :
                    riskScore > config.geocledian.mediumRiskThreshold ? 'MEDIUM' : 'LOW';
  
  const isCompliant = riskScore < config.geocledian.highRiskThreshold;
  
  const result = {
    shipmentId,
    product,
    hsCode: config.eudr.hsCodes[Object.keys(config.eudr.hsCodes).find(k => config.eudr.hsCodes[k] === product)] || '000000',
    exporterId,
    exporterName: shipmentData.exporterName || 'Unknown',
    origin: origin || { country: 'Unknown', region: 'Unknown', coordinates: coordinates || {} },
    farmPlotId: farmPlotId || null,
    harvestDate: harvestDate || new Date().toISOString().split('T')[0],
    eudrStatus: isCompliant ? 'COMPLIANT' : 'NON_COMPLIANT',
    deforestationFree: isCompliant,
    geocledianRiskScore: riskScore,
    geocledianRiskLevel: riskLevel,
    riskFactors: isCompliant ? [] : ['high_deforestation_risk'],
    checkedAt: new Date().toISOString(),
    certificate: isCompliant ? `EUDR-CERT-${Date.now()}` : null,
    denialReason: isCompliant ? null : 'High deforestation risk detected'
  };
  
  return result;
}

/**
 * Build result object
 */
function buildResult(record) {
  return {
    applicable: true,
    shipmentId: record.shipmentId,
    product: record.product,
    eudrStatus: record.eudrStatus,
    deforestationFree: record.deforestationFree,
    riskScore: record.geocledianRiskScore,
    riskLevel: record.geocledianRiskLevel,
    riskFactors: record.riskFactors,
    farmPlotId: record.farmPlotId,
    certificate: record.certificate,
    denialReason: record.denialReason,
    checkedAt: record.checkedAt,
    compliant: record.eudrStatus === 'COMPLIANT'
  };
}

/**
 * Get compliance by shipment ID
 */
function getCompliance(shipmentId) {
  const record = complianceData.records.find(r => r.shipmentId === shipmentId);
  if (!record) return null;
  return buildResult(record);
}

/**
 * Get all compliance records
 */
function getAllRecords(filters = {}) {
  let result = [...complianceData.records];
  
  if (filters.status) {
    result = result.filter(r => r.eudrStatus === filters.status);
  }
  if (filters.country) {
    result = result.filter(r => r.origin?.country === filters.country);
  }
  if (filters.exporterId) {
    result = result.filter(r => r.exporterId === filters.exporterId);
  }
  
  return result;
}

/**
 * Get compliance statistics
 */
function getStatistics() {
  const total = complianceData.records.length;
  const compliant = complianceData.records.filter(r => r.eudrStatus === 'COMPLIANT').length;
  const nonCompliant = complianceData.records.filter(r => r.eudrStatus === 'NON_COMPLIANT').length;
  
  const byCountry = {};
  const byProduct = {};
  
  for (const record of complianceData.records) {
    byCountry[record.origin?.country] = (byCountry[record.origin?.country] || 0) + 1;
    byProduct[record.product] = (byProduct[record.product] || 0) + 1;
  }
  
  return {
    total,
    compliant,
    nonCompliant,
    complianceRate: total > 0 ? compliant / total : 0,
    byCountry,
    byProduct,
    lastChecked: complianceData.lastChecked
  };
}

/**
 * Add new compliance record manually
 */
function addRecord(recordData) {
  const record = {
    ...recordData,
    checkedAt: new Date().toISOString()
  };
  
  // Update existing or add new
  const existingIndex = complianceData.records.findIndex(r => r.shipmentId === recordData.shipmentId);
  if (existingIndex >= 0) {
    complianceData.records[existingIndex] = record;
  } else {
    complianceData.records.push(record);
  }
  
  complianceData.lastChecked = new Date().toISOString();
  saveData();
  
  return buildResult(record);
}

/**
 * Get configuration
 */
function getConfig() {
  return {
    regulatedProducts: config.eudr.regulatedProducts,
    highRiskThreshold: config.geocledian.highRiskThreshold,
    mediumRiskThreshold: config.geocledian.mediumRiskThreshold,
    totalRecords: complianceData.records.length,
    lastChecked: complianceData.lastChecked
  };
}

// Initialize on load
initialize().catch(console.error);

module.exports = {
  initialize,
  checkEUDR,
  getCompliance,
  getAllRecords,
  getStatistics,
  addRecord,
  getConfig
};
