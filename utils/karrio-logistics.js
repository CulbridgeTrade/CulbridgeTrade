
const axios = require('axios');

/**
 * Karrio Self-Hosted Logistics - Labels/tracking
 */
class KarrioLogistics {
  constructor(apiKey, baseUrl = 'http://localhost:9000') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async generateLabels(shipmentData) {
    try {
      const response = await axios.post(`${this.baseUrl}/shipments/create`, shipmentData, {
        headers: { Authorization: `Token ${this.apiKey}` }
      });
      return {
        tracking_number: response.data.tracking_number,
        label_url: response.data.label_url,
        carriers: response.data.carriers
      };
    } catch (error) {
      console.error('Karrio error:', error);
      return null;
    }
  }
}

module.exports = KarrioLogistics;

