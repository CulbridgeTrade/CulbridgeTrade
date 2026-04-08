/**
 * Odoo WMS Integration Module for Culbridge
 * 
 * This module provides integration with Odoo ERP's Warehouse Management System (WMS)
 * for inventory and warehouse operations.
 * 
 * Odoo is an open-source ERP system. The stock/inventory module provides WMS features:
 * - Warehouse management
 * - Inventory tracking
 * - Stock transfers
 * - Location management
 * - Batch/serial number tracking
 * 
 * Note: Requires a running Odoo server with stock module.
 * Uses mock data when not connected for development.
 */

const Odoo = require('odoo-await');
const crypto = require('crypto');

// Configuration
const config = {
  host: process.env.ODOO_HOST || 'localhost',
  port: process.env.ODOO_PORT || 8069,
  database: process.env.ODOO_DB || 'odoo',
  username: process.env.ODOO_USER || 'admin',
  password: process.env.ODOO_PASS || 'admin',
  connected: false,
  client: null
};

// In-memory cache for development
const localWarehouse = {
  locations: new Map(),
  transfers: new Map(),
  inventories: new Map(),
  shipments: new Map()
};

/**
 * Connect to Odoo server
 */
async function connect() {
  try {
    config.client = new Odoo({
      host: config.host,
      port: config.port,
      database: config.database,
      username: config.username,
      password: config.password
    });

    await config.client.connect();
    config.connected = true;
    console.log('Connected to Odoo server:', config.host);
    return true;
  } catch (error) {
    console.error('Failed to connect to Odoo:', error.message);
    // Fall back to local mode
    config.connected = true;
    console.log('Using local warehouse mode for development');
    return true;
  }
}

/**
 * Check if connected
 */
function isConnected() {
  return config.connected;
}

/**
 * Get connection status
 */
function getStatus() {
  return {
    connected: config.connected,
    host: config.host,
    port: config.port,
    database: config.database,
    mode: config.client ? 'odoo' : 'local'
  };
}

/**
 * Configure connection
 */
function configure(newConfig) {
  if (newConfig.host) config.host = newConfig.host;
  if (newConfig.port) config.port = newConfig.port;
  if (newConfig.database) config.database = newConfig.database;
  if (newConfig.username) config.username = newConfig.username;
  if (newConfig.password) config.password = newConfig.password;
  
  config.connected = false;
}

/**
 * Get warehouse locations from Odoo
 */
async function getLocations() {
  if (!config.client) {
    return getMockLocations();
  }

  try {
    const locations = await config.client.searchRead('stock.location', [], [
      'id', 'name', 'complete_name', 'location_id', 'usage', 'active'
    ]);
    return locations;
  } catch (error) {
    console.error('Error fetching locations:', error.message);
    return getMockLocations();
  }
}

/**
 * Get warehouses
 */
async function getWarehouses() {
  if (!config.client) {
    return getMockWarehouses();
  }

  try {
    const warehouses = await config.client.searchRead('stock.warehouse', [], [
      'id', 'name', 'code', 'partner_id', 'lot_stock_id'
    ]);
    return warehouses;
  } catch (error) {
    console.error('Error fetching warehouses:', error.message);
    return getMockWarehouses();
  }
}

/**
 * Get stock moves for a product
 */
async function getStockMoves(productId = null) {
  if (!config.client) {
    return getMockStockMoves();
  }

  try {
    const domain = productId ? [['product_id', '=', productId]] : [];
    const moves = await config.client.searchRead('stock.move', domain, [
      'id', 'name', 'product_id', 'product_uom_qty', 'state',
      'location_id', 'location_dest_id', 'date', 'picking_id'
    ]);
    return moves;
  } catch (error) {
    console.error('Error fetching stock moves:', error.message);
    return getMockStockMoves();
  }
}

/**
 * Create stock transfer (picking)
 * @param {Object} transferData - Transfer data
 */
async function createTransfer(transferData) {
  const transferId = generateId('TRANS');
  const timestamp = new Date().toISOString();

  const transfer = {
    id: transferId,
    odoo_id: null,
    picking_type: transferData.picking_type || 'internal',
    partner_id: transferData.partner_id,
    location_id: transferData.location_id,
    location_dest_id: transferData.location_dest_id,
    origin: transferData.origin || 'Culbridge',
    state: 'draft',
    moves: transferData.moves || [],
    created_at: timestamp,
   Culbridge_shipment_id: transferData.Culbridge_shipment_id
  };

  if (config.client) {
    try {
      const odooId = await config.client.create('stock.picking', {
        picking_type_id: transferData.picking_type_id || 1,
        partner_id: transferData.partner_id || false,
        location_id: transferData.location_id || 1,
        location_dest_id: transferData.location_dest_id || 1,
        origin: transferData.origin || 'Culbridge',
        note: `Culbridge Shipment: ${transferData.Culbridge_shipment_id}`
      });
      transfer.odoo_id = odooId;
    } catch (error) {
      console.error('Error creating transfer in Odoo:', error.message);
    }
  }

  localWarehouse.transfers.set(transferId, transfer);
  return transfer;
}

/**
 * Get transfer by ID
 */
async function getTransfer(transferId) {
  let transfer = localWarehouse.transfers.get(transferId);

  if (!transfer && config.client) {
    try {
      const [odooTransfer] = await config.client.searchRead('stock.picking', [
        ['id', '=', parseInt(transferId)]
      ], ['id', 'name', 'state', 'origin', 'partner_id']);
      return odooTransfer;
    } catch (error) {
      return null;
    }
  }

  return transfer;
}

/**
 * Get all transfers
 */
async function getTransfers(filters = {}) {
  const transfers = [];
  
  for (const [id, transfer] of localWarehouse.transfers) {
    let match = true;
    
    if (filters.state && transfer.state !== filters.state) match = false;
    if (filters.picking_type && transfer.picking_type !== filters.picking_type) match = false;
    if (filters.Culbridge_shipment_id && transfer.Culbridge_shipment_id !== filters.Culbridge_shipment_id) match = false;
    
    if (match) transfers.push(transfer);
  }

  // If connected to Odoo, also fetch real transfers
  if (config.client) {
    try {
      const domain = [];
      if (filters.origin) domain.push(['origin', 'ilike', filters.origin]);
      
      const odooTransfers = await config.client.searchRead('stock.picking', domain, [
        'id', 'name', 'state', 'origin', 'partner_id', 'scheduled_date'
      ]);
      
      for (const t of odooTransfers) {
        transfers.push({
          id: `ODOO-${t.id}`,
          odoo_id: t.id,
          name: t.name,
          state: t.state,
          origin: t.origin,
          partner_id: t.partner_id,
          scheduled_date: t.scheduled_date
        });
      }
    } catch (error) {
      console.error('Error fetching Odoo transfers:', error.message);
    }
  }

  return transfers;
}

/**
 * Update transfer state
 */
async function updateTransferState(transferId, newState) {
  const transfer = localWarehouse.transfers.get(transferId);
  
  if (!transfer) {
    throw new Error(`Transfer not found: ${transferId}`);
  }

  const validStates = ['draft', 'cancel', 'waiting', 'confirmed', 'assigned', 'done'];
  if (!validStates.includes(newState)) {
    throw new Error(`Invalid state: ${newState}`);
  }

  transfer.state = newState;
  transfer.updated_at = new Date().toISOString();

  if (config.client && transfer.odoo_id) {
    try {
      await config.client.write('stock.picking', [transfer.odoo_id], {
        state: newState
      });
    } catch (error) {
      console.error('Error updating Odoo transfer:', error.message);
    }
  }

  localWarehouse.transfers.set(transferId, transfer);
  return transfer;
}

/**
 * Get inventory locations
 */
async function getInventoryLocations() {
  return getLocations();
}

/**
 * Create inventory adjustment
 */
async function createInventoryAdjustment(adjustmentData) {
  const adjId = generateId('INV');
  const timestamp = new Date().toISOString();

  const adjustment = {
    id: adjId,
    odoo_id: null,
    name: adjustmentData.name || `Adjustment ${adjId}`,
    location_id: adjustmentData.location_id,
    product_id: adjustmentData.product_id,
    product_qty: adjustmentData.product_qty || 0,
    state: 'draft',
    created_at: timestamp,
    Culbridge_shipment_id: adjustmentData.Culbridge_shipment_id
  };

  if (config.client) {
    try {
      const odooId = await config.client.create('stock.inventory', {
        name: adjustment.name,
        location_id: adjustment.location_id,
        start_date: timestamp
      });
      adjustment.odoo_id = odooId;
    } catch (error) {
      console.error('Error creating inventory in Odoo:', error.message);
    }
  }

  localWarehouse.inventories.set(adjId, adjustment);
  return adjustment;
}

/**
 * Get product lots/batches
 */
async function getProductLots(productId = null) {
  if (!config.client) {
    return getMockLots();
  }

  try {
    const domain = productId ? [['product_id', '=', productId]] : [];
    const lots = await config.client.searchRead('stock.production.lot', domain, [
      'id', 'name', 'product_id', 'company_id', 'create_date'
    ]);
    return lots;
  } catch (error) {
    console.error('Error fetching lots:', error.message);
    return getMockLots();
  }
}

/**
 * Sync shipment with Odoo WMS
 */
async function syncWithOdoo(shipmentData) {
  const result = {
    shipment_id: shipmentData.id,
    warehouse_transfer: null,
    inventory_adjustment: null,
    lots_created: [],
    synced_at: new Date().toISOString()
  };

  // Create transfer for shipment
  const transfer = await createTransfer({
    picking_type: 'outgoing',
    origin: `Culbridge-${shipmentData.id}`,
    location_id: shipmentData.warehouse_location_id || 8,
    location_dest_id: shipmentData.customer_location_id || 5,
    moves: [{
      product_id: shipmentData.product_id,
      product_uom_qty: shipmentData.quantity || 1
    }],
    Culbridge_shipment_id: shipmentData.id
  });

  result.warehouse_transfer = transfer;

  // Update transfer to done if configured
  if (shipmentData.auto_complete) {
    await updateTransferState(transfer.id, 'done');
  }

  return result;
}

/**
 * Get Odoo stock info for product
 */
async function getProductStock(productId) {
  if (!config.client) {
    return {
      product_id: productId,
      on_hand: 100,
      incoming: 0,
      outgoing: 0,
      available: 100
    };
  }

  try {
    const [product] = await config.client.searchRead('product.product', [
      ['id', '=', productId]
    ], ['id', 'name', 'qty_available', 'incoming_qty', 'outgoing_qty', 'virtual_available']);

    return {
      product_id: productId,
      on_hand: product?.qty_available || 0,
      incoming: product?.incoming_qty || 0,
      outgoing: product?.outgoing_qty || 0,
      available: product?.virtual_available || 0
    };
  } catch (error) {
    console.error('Error fetching product stock:', error.message);
    return null;
  }
}

// Helper functions
function generateId(prefix) {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(4).toString('hex');
  return `${prefix}-${timestamp}-${random}`.toUpperCase();
}

function getMockLocations() {
  return [
    { id: 1, name: 'Physical Locations', complete_name: 'Physical Locations', usage: 'view' },
    { id: 2, name: 'WH/Stock', complete_name: 'WH/Stock', usage: 'internal' },
    { id: 3, name: 'WH/Input', complete_name: 'WH/Input', usage: 'internal' },
    { id: 4, name: 'WH/Output', complete_name: 'WH/Output', usage: 'internal' },
    { id: 5, name: 'Partners', complete_name: 'Partners', usage: 'partner' }
  ];
}

function getMockWarehouses() {
  return [
    { id: 1, name: 'Main Warehouse', code: 'WH01' },
    { id: 2, name: 'Distribution Center', code: 'DC01' }
  ];
}

function getMockStockMoves() {
  return [
    {
      id: 1,
      name: 'Shipment CB-001',
      product_id: [1, 'Sesame Seeds'],
      product_uom_qty: 1000,
      state: 'done',
      date: new Date().toISOString()
    }
  ];
}

function getMockLots() {
  return [
    { id: 1, name: 'LOT-2024-001', product_id: [1, 'Sesame Seeds'] },
    { id: 2, name: 'LOT-2024-002', product_id: [1, 'Sesame Seeds'] }
  ];
}

module.exports = {
  connect,
  isConnected,
  getStatus,
  configure,
  getLocations,
  getWarehouses,
  getStockMoves,
  createTransfer,
  getTransfer,
  getTransfers,
  updateTransferState,
  getInventoryLocations,
  createInventoryAdjustment,
  getProductLots,
  syncWithOdoo,
  getProductStock
};
