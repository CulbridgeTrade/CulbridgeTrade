
const axios = require('axios');

/**
 * OpenELIS Integration - Lab tests & digital signatures
 * API: https://openelis-global.org (self-hosted)
 */
class OpenELISIntegration {
  constructor(apiKey, baseUrl = 'https://your-openelis.net/api') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async getLabResults(batchNumber) {
    try {
      const response = await axios.get(`${this.baseUrl}/tests?batch=${batchNumber}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` }
      });
      return {
        batch_number: batchNumber,
        lab_results: response.data.tests.map(t => ({
          test: t.name,
          result: t.value,
          unit: t.unit,
          timestamp: t.test_date,
          signature: t.digital_signature || null
        })),
        lab_id: response.data.lab_id,
        lab_report_date: response.data.date
      };
    } catch (error) {
      console.error('OpenELIS error:', error);
      return null;
    }
  }
}

module.exports = OpenELISIntegration;

