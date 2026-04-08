
const axios = require('axios');

/**
 * FarmOS Integration - Farm/crop tracking for traceability
 * API: https://api.farmos.net (self-hosted)
 */
class FarmOSIntegration {
  constructor(apiKey, baseUrl = 'https://your-farmos.net/api') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async getFarmData(farmerId) {
    try {
      const response = await axios.get(`${this.baseUrl}/farms/${farmerId}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` }
      });
      return {
        shipment_id: response.data.shipment_id,
        farmer_id: farmerId,
        field_geo: response.data.geo,
        harvest_date: response.data.harvest_date,
        crop_type: response.data.crop,
        batch_number: response.data.batch
      };
    } catch (error) {
      console.error('FarmOS error:', error);
      return null;
    }
  }

  async getBatchTrace(batchNumber) {
    // Return farm chain for batch
    return {
      batch_number: batchNumber,
      farms: ['FARM001', 'FARM002'],
      traceability_chain: true
    };
  }
}

module.exports = FarmOSIntegration;

