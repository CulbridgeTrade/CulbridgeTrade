// Culbridge NEPC Exporter Verification Integration
const axios = require('axios');

const NEPC_BASE = process.env.NEPC_SERVICE_URL || 'http://localhost:8001';

async function verifyExporter(companyName) {
  try {
    const response = await axios.post(`${NEPC_BASE}/nepc-verify`, { company: companyName }, {
      timeout: 30000
    });
    return response.data;
  } catch (error) {
    console.error('NEPC verification failed:', error.message);
    return { company: companyName, status: 'Service unavailable', verified: false };
  }
}

// Integration into shipment flow
async function nepcPreCheck(exporterName) {
  const result = await verifyExporter(exporterName);
  
  if (!result.verified) {
    throw new Error(`Exporter "${exporterName}" not verified by NEPC: ${result.status}`);
  }
  
  return result;
}

module.exports = { verifyExporter, nepcPreCheck };

