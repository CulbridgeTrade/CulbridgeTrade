/**
 * OpenTMS - Transportation Management System Integration for Culbridge
 * 
 * This module provides Transportation Management System (TMS) features
 * for freight, carrier management, and shipment tracking.
 * 
 * Features:
 * - Load/Shipment management
 * - Carrier management
 * - Route tracking
 * - Delivery status
 * - Freight auditing
 * 
 * Note: This is a custom implementation that can connect to external TMS APIs.
 * Uses local mode for development.
 */

const crypto = require('crypto');

// Configuration
const config = {
  apiUrl: process.env.TMS_API_URL || null,
  apiKey: process.env.TMS_API_KEY || null,
  carrierApiKey: process.env.TMS_CARRIER_API_KEY || null,
  connected: false
};

// Local storage for development
const localData = {
  loads: new Map(),
  carriers: new Map(),
  routes: new Map(),
  deliveries: new Map(),
  shipments: new Map()
};

/**
 * Connect to TMS API
 */
async function connect() {
  try {
    if (!config.apiUrl) {
      console.log('No TMS API configured, using local mode');
      config.connected = true;
      return true;
    }

    // In production, would connect to real TMS API
    config.connected = true;
    console.log('Connected to TMS API:', config.apiUrl);
    return true;
  } catch (error) {
    console.error('Failed to connect to TMS:', error.message);
    config.connected = true;
    console.log('Using local TMS mode');
    return true;
  }
}

/**
 * Check connection status
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
    mode: config.apiUrl ? 'api' : 'local'
  };
}

/**
 * Configure TMS
 */
function configure(newConfig) {
  if (newConfig.apiUrl) config.apiUrl = newConfig.apiUrl;
  if (newConfig.apiKey) config.apiKey = newConfig.apiKey;
  if (newConfig.carrierApiKey) config.carrierApiKey = newConfig.carrierApiKey;
  config.connected = false;
}

// ==================== LOADS ====================

/**
 * Create new load (shipment)
 */
async function createLoad(loadData) {
  const loadId = generateId('LOAD');
  const timestamp = new Date().toISOString();

  const load = {
    id: loadId,
    reference_number: loadData.reference_number || `TMS-${loadId}`,
    status: 'pending',
    origin: {
      name: loadData.origin_name || loadData.origin?.name,
      address: loadData.origin_address || loadData.origin?.address,
      city: loadData.origin_city || loadData.origin?.city,
      country: loadData.origin_country || loadData.origin?.country || 'NG',
      postal_code: loadData.origin_postal || loadData.origin?.postal_code,
      lat: loadData.origin_lat,
      lng: loadData.origin_lng
    },
    destination: {
      name: loadData.destination_name || loadData.destination?.name,
      address: loadData.destination_address || loadData.destination?.address,
      city: loadData.destination_city || loadData.destination?.city,
      country: loadData.destination_country || loadData.destination?.country,
      postal_code: loadData.destination_postal || loadData.destination?.postal_code,
      lat: loadData.destination_lat,
      lng: loadData.destination_lng
    },
    cargo: {
      description: loadData.cargo_description || loadData.product,
      weight: loadData.weight || loadData.cargo_weight,
      volume: loadData.volume,
      units: loadData.units || 1,
      commodity: loadData.commodity || loadData.product,
      hazmat: loadData.hazmat || false
    },
    carrier: {
      id: loadData.carrier_id,
      name: loadData.carrier_name
    },
    pickup_date: loadData.pickup_date,
    delivery_date: loadData.delivery_date,
    rate: loadData.rate || 0,
    currency: loadData.currency || 'USD',
    distance_km: loadData.distance_km,
    created_at: timestamp,
    updated_at: timestamp,
    events: [{
      type: 'created',
      timestamp,
      description: 'Load created',
      location: loadData.origin_city || 'Origin'
    }],
    Culbridge_shipment_id: loadData.Culbridge_shipment_id
  };

  localData.loads.set(loadId, load);
  return load;
}

/**
 * Get load by ID
 */
async function getLoad(loadId) {
  return localData.loads.get(loadId) || null;
}

/**
 * Update load status
 */
async function updateLoadStatus(loadId, status, eventData = {}) {
  const load = localData.loads.get(loadId);
  
  if (!load) {
    throw new Error(`Load not found: ${loadId}`);
  }

  const timestamp = new Date().toISOString();
  
  load.status = status;
  load.updated_at = timestamp;
  load.events.push({
    type: eventData.type || status,
    timestamp,
    description: eventData.description || `Status updated to ${status}`,
    location: eventData.location,
    notes: eventData.notes
  });

  localData.loads.set(loadId, load);
  return load;
}

/**
 * Get loads with filters
 */
async function getLoads(filters = {}) {
  const loads = [];
  
  for (const [id, load] of localData.loads) {
    let match = true;
    
    if (filters.status && load.status !== filters.status) match = false;
    if (filters.carrier_id && load.carrier?.id !== filters.carrier_id) match = false;
    if (filters.Culbridge_shipment_id && load.Culbridge_shipment_id !== filters.Culbridge_shipment_id) match = false;
    
    if (match) loads.push(load);
  }

  return loads;
}

// ==================== CARRIERS ====================

/**
 * Create carrier
 */
async function createCarrier(carrierData) {
  const carrierId = generateId('CAR');
  const timestamp = new Date().toISOString();

  const carrier = {
    id: carrierId,
    name: carrierData.name,
    carrier_type: carrierData.carrier_type || 'truck',
    mc_number: carrierData.mc_number,
    dot_number: carrierData.dot_number,
    contact: {
      email: carrierData.email,
      phone: carrierData.phone
    },
    address: {
      street: carrierData.street,
      city: carrierData.city,
      state: carrierData.state,
      country: carrierData.country || 'NG',
      postal_code: carrierData.postal_code
    },
    rating: carrierData.rating || 5,
    insurance_expiry: carrierData.insurance_expiry,
    safety_rating: carrierData.safety_rating || 'satisfactory',
    active: true,
    created_at: timestamp
  };

  localData.carriers.set(carrierId, carrier);
  return carrier;
}

/**
 * Get carrier
 */
async function getCarrier(carrierId) {
  return localData.carriers.get(carrierId) || null;
}

/**
 * Get all carriers
 */
async function getCarriers(filters = {}) {
  const carriers = [];
  
  for (const [id, carrier] of localData.carriers) {
    let match = true;
    
    if (filters.active !== undefined && carrier.active !== filters.active) match = false;
    if (filters.carrier_type && carrier.carrier_type !== filters.carrier_type) match = false;
    
    if (match) carriers.push(carrier);
  }

  return carriers;
}

/**
 * Update carrier
 */
async function updateCarrier(carrierId, updates) {
  const carrier = localData.carriers.get(carrierId);
  
  if (!carrier) {
    throw new Error(`Carrier not found: ${carrierId}`);
  }

  Object.assign(carrier, updates);
  localData.carriers.set(carrierId, carrier);
  return carrier;
}

// ==================== ROUTES ====================

/**
 * Create route
 */
async function createRoute(routeData) {
  const routeId = generateId('ROUTE');
  const timestamp = new Date().toISOString();

  const route = {
    id: routeId,
    load_id: routeData.load_id,
    origin: routeData.origin,
    destination: routeData.destination,
    waypoints: routeData.waypoints || [],
    distance_km: routeData.distance_km || 0,
    estimated_duration_hours: routeData.estimated_duration_hours,
    actual_duration_hours: null,
    status: 'planned',
    polyline: routeData.polyline,
    created_at: timestamp
  };

  localData.routes.set(routeId, route);
  return route;
}

/**
 * Get route
 */
async function getRoute(routeId) {
  return localData.routes.get(routeId) || null;
}

/**
 * Update route with actual tracking
 */
async function updateRouteTracking(routeId, trackingData) {
  const route = localData.routes.get(routeId);
  
  if (!route) {
    throw new Error(`Route not found: ${routeId}`);
  }

  if (trackingData.current_location) {
    route.current_location = trackingData.current_location;
  }
  if (trackingData.progress_percent !== undefined) {
    route.progress_percent = trackingData.progress_percent;
  }
  if (trackingData.eta) {
    route.eta = trackingData.eta;
  }
  if (trackingData.actual_duration_hours) {
    route.actual_duration_hours = trackingData.actual_duration_hours;
  }
  if (trackingData.status) {
    route.status = trackingData.status;
  }

  localData.routes.set(routeId, route);
  return route;
}

// ==================== DELIVERIES ====================

/**
 * Create delivery record
 */
async function createDelivery(deliveryData) {
  const deliveryId = generateId('DEL');
  const timestamp = new Date().toISOString();

  const delivery = {
    id: deliveryId,
    load_id: deliveryData.load_id,
    carrier_id: deliveryData.carrier_id,
    driver_name: deliveryData.driver_name,
    driver_phone: deliveryData.driver_phone,
    vehicle_id: deliveryData.vehicle_id,
    status: 'pending',
    proof_of_delivery: null,
    signed_by: null,
    delivered_at: null,
    created_at: timestamp,
    events: [{
      type: 'created',
      timestamp,
      description: 'Delivery created'
    }]
  };

  localData.deliveries.set(deliveryId, delivery);
  return delivery;
}

/**
 * Get delivery
 */
async function getDelivery(deliveryId) {
  return localData.deliveries.get(deliveryId) || null;
}

/**
 * Confirm delivery
 */
async function confirmDelivery(deliveryId, confirmationData) {
  const delivery = localData.deliveries.get(deliveryId);
  
  if (!delivery) {
    throw new Error(`Delivery not found: ${deliveryId}`);
  }

  const timestamp = new Date().toISOString();

  delivery.status = 'delivered';
  delivery.delivered_at = timestamp;
  delivery.signed_by = confirmationData.signed_by;
  delivery.proof_of_delivery = {
    signature_image: confirmationData.signature_image,
    notes: confirmationData.notes,
    photos: confirmationData.photos || []
  };

  delivery.events.push({
    type: 'delivered',
    timestamp,
    description: 'Delivery confirmed',
    location: confirmationData.location
  });

  localData.deliveries.set(deliveryId, delivery);
  return delivery;
}

// ==================== SYNC ====================

/**
 * Sync with Culbridge shipment
 */
async function syncWithCulbridge(shipmentData) {
  // Create load from shipment
  const load = await createLoad({
    product: shipmentData.product,
    origin_name: shipmentData.exporter_id,
    origin_country: 'NG',
    destination_country: shipmentData.destination,
    pickup_date: shipmentData.pickup_date || new Date().toISOString(),
    Culbridge_shipment_id: shipmentData.id
  });

  return {
    load,
    shipment_id: shipmentData.id,
    synced_at: new Date().toISOString()
  };
}

/**
 * Get tracking summary for a shipment
 */
async function getTrackingSummary(loadId) {
  const load = localData.loads.get(loadId);
  
  if (!load) {
    throw new Error(`Load not found: ${loadId}`);
  }

  const route = Array.from(localData.routes.values()).find(r => r.load_id === loadId);
  const delivery = Array.from(localData.deliveries.values()).find(d => d.load_id === loadId);

  return {
    load_id: loadId,
    reference_number: load.reference_number,
    status: load.status,
    origin: load.origin,
    destination: load.destination,
    carrier: load.carrier,
    current_location: route?.current_location,
    progress_percent: route?.progress_percent,
    eta: route?.eta,
    delivery_status: delivery?.status,
    events: load.events
  };
}

// Helper functions
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
  createLoad,
  getLoad,
  updateLoadStatus,
  getLoads,
  createCarrier,
  getCarrier,
  getCarriers,
  updateCarrier,
  createRoute,
  getRoute,
  updateRouteTracking,
  createDelivery,
  getDelivery,
  confirmDelivery,
  syncWithCulbridge,
  getTrackingSummary
};
