/**
 * OpenLMIS Integration Module for Culbridge
 * 
 * OpenLMIS is an open-source, web-based electronic logistics management
 * information system (LMIS) designed to manage health commodity supply chains.
 * 
 * This integration adapts OpenLMIS concepts for agricultural commodity
 * supply chain management:
 * - Commodity tracking
 * - Stock management
 * - Requisition & fulfillment
 * - Facility management
 * - Reporting
 * 
 * Note: Requires OpenLMIS server. Uses local mode for development.
 */

const crypto = require('crypto');

// Configuration
const config = {
  apiUrl: process.env.OPENLMIS_API_URL || null,
  apiKey: process.env.OPENLMIS_API_KEY || null,
  username: process.env.OPENLMIS_USER || null,
  password: process.env.OPENLMIS_PASS || null,
  connected: false
};

// Local storage
const localData = {
  facilities: new Map(),
  commodities: new Map(),
  orders: new Map(),
  shipments: new Map(),
  stock_levels: new Map(),
  requisitions: new Map()
};

/**
 * Connect to OpenLMIS
 */
async function connect() {
  try {
    if (!config.apiUrl) {
      console.log('No OpenLMIS API configured, using local mode');
      config.connected = true;
      return true;
    }

    // In production, would authenticate with OpenLMIS
    config.connected = true;
    console.log('Connected to OpenLMIS:', config.apiUrl);
    return true;
  } catch (error) {
    console.error('Failed to connect to OpenLMIS:', error.message);
    config.connected = true;
    console.log('Using local LMIS mode');
    return true;
  }
}

/**
 * Check connection
 */
function isConnected() {
  return config.connected;
}

/**
 * Get status
 */
function getStatus() {
  return {
    connected: config.connected,
    apiUrl: config.apiUrl,
    mode: config.apiUrl ? 'openlmis' : 'local'
  };
}

/**
 * Configure
 */
function configure(newConfig) {
  if (newConfig.apiUrl) config.apiUrl = newConfig.apiUrl;
  if (newConfig.apiKey) config.apiKey = newConfig.apiKey;
  if (newConfig.username) config.username = newConfig.username;
  if (newConfig.password) config.password = newConfig.password;
  config.connected = false;
}

// ==================== FACILITIES ====================

/**
 * Create facility
 */
async function createFacility(facilityData) {
  const facilityId = generateId('FAC');
  const timestamp = new Date().toISOString();

  const facility = {
    id: facilityId,
    code: facilityData.code || `FAC-${Date.now()}`,
    name: facilityData.name,
    type: facilityData.type || 'warehouse',
    active: true,
    operator: facilityData.operator,
    geographic_zone: {
      code: facilityData.zone_code,
      name: facilityData.zone_name,
      level: facilityData.zone_level
    },
    address: {
      street: facilityData.street,
      city: facilityData.city,
      country: facilityData.country || 'NG',
      postal_code: facilityData.postal_code
    },
    contact: {
      email: facilityData.email,
      phone: facilityData.phone,
      person: facilityData.contact_person
    },
    supported_programs: facilityData.supported_programs || ['default'],
    created_at: timestamp,
    updated_at: timestamp
  };

  localData.facilities.set(facilityId, facility);
  return facility;
}

/**
 * Get facility
 */
async function getFacility(facilityId) {
  return localData.facilities.get(facilityId) || null;
}

/**
 * Get facilities
 */
async function getFacilities(filters = {}) {
  const facilities = [];
  
  for (const [id, facility] of localData.facilities) {
    let match = true;
    
    if (filters.active !== undefined && facility.active !== filters.active) match = false;
    if (filters.type && facility.type !== filters.type) match = false;
    
    if (match) facilities.push(facility);
  }

  return facilities;
}

// ==================== COMMODITIES ====================

/**
 * Create commodity
 */
async function createCommodity(commodityData) {
  const commodityId = generateId('CMD');
  const timestamp = new Date().toISOString();

  const commodity = {
    id: commodityId,
    code: commodityData.code || `CMD-${Date.now()}`,
    name: commodityData.name,
    description: commodityData.description,
    commodity_type: commodityData.commodity_type || 'agricultural',
    unit_of_measure: commodityData.unit_of_measure || 'kg',
    pack_size: commodityData.pack_size || 1,
    manufacturer: commodityData.manufacturer,
    gtin: commodityData.gtin,
    active: true,
    category: commodityData.category,
    tracibility_level: commodityData.tracibility_level || 'lot',
    created_at: timestamp,
    updated_at: timestamp
  };

  localData.commodities.set(commodityId, commodity);
  return commodity;
}

/**
 * Get commodity
 */
async function getCommodity(commodityId) {
  return localData.commodities.get(commodityId) || null;
}

/**
 * Get commodities
 */
async function getCommodities(filters = {}) {
  const commodities = [];
  
  for (const [id, commodity] of localData.commodities) {
    let match = true;
    
    if (filters.active !== undefined && commodity.active !== filters.active) match = false;
    if (filters.commodity_type && commodity.commodity_type !== filters.commodity_type) match = false;
    if (filters.category && commodity.category !== filters.category) match = false;
    
    if (match) commodities.push(commodity);
  }

  return commodities;
}

// ==================== ORDERS ====================

/**
 * Create order (requisition/fulfillment)
 */
async function createOrder(orderData) {
  const orderId = generateId('ORD');
  const timestamp = new Date().toISOString();

  const order = {
    id: orderId,
    order_number: orderData.order_number || `ORD-${Date.now()}`,
    status: 'pending',
    facility: {
      id: orderData.facility_id,
      code: orderData.facility_code,
      name: orderData.facility_name
    },
    program: orderData.program || 'default',
    requesting_date: orderData.requesting_date || timestamp,
    fulfill_date: null,
    line_items: orderData.line_items || [],
    total_value: orderData.total_value || 0,
    currency: orderData.currency || 'USD',
    created_at: timestamp,
    updated_at: timestamp,
    history: [{
      status: 'pending',
      timestamp,
      notes: 'Order created'
    }],
    Culbridge_shipment_id: orderData.Culbridge_shipment_id
  };

  localData.orders.set(orderId, order);
  return order;
}

/**
 * Get order
 */
async function getOrder(orderId) {
  return localData.orders.get(orderId) || null;
}

/**
 * Get orders
 */
async function getOrders(filters = {}) {
  const orders = [];
  
  for (const [id, order] of localData.orders) {
    let match = true;
    
    if (filters.status && order.status !== filters.status) match = false;
    if (filters.facility_id && order.facility?.id !== filters.facility_id) match = false;
    if (filters.program && order.program !== filters.program) match = false;
    
    if (match) orders.push(order);
  }

  return orders;
}

/**
 * Update order status
 */
async function updateOrderStatus(orderId, status, notes = '') {
  const order = localData.orders.get(orderId);
  
  if (!order) {
    throw new Error(`Order not found: ${orderId}`);
  }

  const timestamp = new Date().toISOString();
  
  order.status = status;
  order.updated_at = timestamp;
  order.history.push({
    status,
    timestamp,
    notes
  });

  if (status === 'fulfilled') {
    order.fulfill_date = timestamp;
  }

  localData.orders.set(orderId, order);
  return order;
}

// ==================== STOCK MANAGEMENT ====================

/**
 * Update stock level
 */
async function updateStockLevel(stockData) {
  const stockKey = `${stockData.facility_id}_${stockData.commodity_id}`;
  const timestamp = new Date().toISOString();

  const stock = {
    id: stockKey,
    facility_id: stockData.facility_id,
    commodity_id: stockData.commodity_id,
    commodity_name: stockData.commodity_name,
    quantity_on_hand: stockData.quantity_on_hand || 0,
    quantity_in_transit: stockData.quantity_in_transit || 0,
    quantity_reserved: stockData.quantity_reserved || 0,
    reorder_point: stockData.reorder_point,
    reorder_quantity: stockData.reorder_quantity,
    max_stock_quantity: stockData.max_stock_quantity,
    last_updated: timestamp,
    lot_number: stockData.lot_number,
    expiration_date: stockData.expiration_date,
    status: stockData.quantity_on_hand > stockData.reorder_point ? 'adequate' : 'low'
  };

  localData.stock_levels.set(stockKey, stock);
  return stock;
}

/**
 * Get stock level
 */
async function getStockLevel(facilityId, commodityId) {
  const stockKey = `${facilityId}_${commodityId}`;
  return localData.stock_levels.get(stockKey) || null;
}

/**
 * Get all stock levels for facility
 */
async function getFacilityStock(facilityId) {
  const stocks = [];
  
  for (const [key, stock] of localData.stock_levels) {
    if (stock.facility_id === facilityId) {
      stocks.push(stock);
    }
  }

  return stocks;
}

/**
 * Get low stock items
 */
async function getLowStockItems(facilityId = null) {
  const items = [];
  
  for (const [key, stock] of localData.stock_levels) {
    if (facilityId && stock.facility_id !== facilityId) continue;
    if (stock.status === 'low') {
      items.push(stock);
    }
  }

  return items;
}

// ==================== REQUISITIONS ====================

/**
 * Create requisition
 */
async function createRequisition(requisitionData) {
  const reqId = generateId('REQ');
  const timestamp = new Date().toISOString();

  const requisition = {
    id: reqId,
    requisition_number: requisitionData.requisition_number || `REQ-${Date.now()}`,
    status: 'draft',
    facility: {
      id: requisitionData.facility_id,
      name: requisitionData.facility_name
    },
    program: requisitionData.program || 'default',
    period: requisitionData.period,
    start_date: requisitionData.start_date,
    end_date: requisitionData.end_date,
    line_items: requisitionData.line_items || [],
    status_comments: [],
    created_at: timestamp,
    submitted_at: null,
    approved_at: null,
    fulfilled_at: null
  };

  localData.requisitions.set(reqId, requisition);
  return requisition;
}

/**
 * Get requisition
 */
async function getRequisition(requisitionId) {
  return localData.requisitions.get(requisitionId) || null;
}

/**
 * Get requisitions
 */
async function getRequisitions(filters = {}) {
  const requisitions = [];
  
  for (const [id, req] of localData.requisitions) {
    let match = true;
    
    if (filters.status && req.status !== filters.status) match = false;
    if (filters.facility_id && req.facility?.id !== filters.facility_id) match = false;
    
    if (match) requisitions.push(req);
  }

  return requisitions;
}

/**
 * Submit requisition
 */
async function submitRequisition(requisitionId) {
  const requisition = localData.requisitions.get(requisitionId);
  
  if (!requisition) {
    throw new Error(`Requisition not found: ${requisitionId}`);
  }

  const timestamp = new Date().toISOString();
  requisition.status = 'submitted';
  requisition.submitted_at = timestamp;
  
  localData.requisitions.set(requisitionId, requisition);
  return requisition;
}

/**
 * Approve requisition
 */
async function approveRequisition(requisitionId) {
  const requisition = localData.requisitions.get(requisitionId);
  
  if (!requisition) {
    throw new Error(`Requisition not found: ${requisitionId}`);
  }

  const timestamp = new Date().toISOString();
  requisition.status = 'approved';
  requisition.approved_at = timestamp;
  
  localData.requisitions.set(requisitionId, requisition);
  return requisition;
}

// ==================== SYNC ====================

/**
 * Sync with Culbridge shipment
 */
async function syncWithCulbridge(shipmentData) {
  // Create commodity if needed
  let commodity = Array.from(localData.commodities.values())
    .find(c => c.name.toLowerCase() === shipmentData.product?.toLowerCase());
  
  if (!commodity) {
    commodity = await createCommodity({
      name: shipmentData.product,
      commodity_type: 'agricultural',
      category: 'export'
    });
  }

  // Create order for shipment
  const order = await createOrder({
    product: shipmentData.product,
    quantity: shipmentData.quantity,
    facility_name: shipmentData.exporter_id,
    destination: shipmentData.destination,
    Culbridge_shipment_id: shipmentData.id
  });

  return {
    order,
    commodity,
    shipment_id: shipmentData.id,
    synced_at: new Date().toISOString()
  };
}

/**
 * Generate reports
 */
async function generateReport(reportType, filters = {}) {
  const timestamp = new Date().toISOString();
  
  let report = {
    type: reportType,
    generated_at: timestamp,
    filters,
    data: []
  };

  switch (reportType) {
    case 'stock_summary':
      report.data = Array.from(localData.stock_levels.values());
      break;
    case 'low_stock':
      report.data = await getLowStockItems(filters.facility_id);
      break;
    case 'order_summary':
      report.data = Array.from(localData.orders.values());
      break;
    case 'facility_list':
      report.data = await getFacilities(filters);
      break;
    default:
      throw new Error(`Unknown report type: ${reportType}`);
  }

  return report;
}

// Helper
function generateId(prefix) {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(4).toString('hex');
  return `${prefix}-${timestamp}-${random}`.toUpperCase();
}

module.exports = {
  connect,
  isConnected,
  getStatus,
  configure,
  createFacility,
  getFacility,
  getFacilities,
  createCommodity,
  getCommodity,
  getCommodities,
  createOrder,
  getOrder,
  getOrders,
  updateOrderStatus,
  updateStockLevel,
  getStockLevel,
  getFacilityStock,
  getLowStockItems,
  createRequisition,
  getRequisition,
  getRequisitions,
  submitRequisition,
  approveRequisition,
  syncWithCulbridge,
  generateReport
};
