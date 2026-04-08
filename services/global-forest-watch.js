const axios = require('axios');

/**
 * Global Forest Watch API integration for EUDR deforestation alerts
 * GFW API: https://data-api.globalforestwatch.org/
 */
class GlobalForestWatch {
  constructor() {
    this.baseURL = 'https://data-api.globalforestwatch.org';
    this.apiKey = process.env.GFW_API_KEY || 'demo'; // Add to .env
  }

  async getDeforestationAlerts(lon, lat, dateRange = '2020-01-01,2024-01-01') {
    try {
      const response = await axios.get(`${this.baseURL}/dataset/gfw`, {
        params: {
          lon,
          lat,
          period: dateRange,
          thresh: 30, // % tree cover loss
          access_token: this.apiKey
        }
      });
      return {
        alerts: response.data.data || [],
        risk: response.data.data.length > 0 ? 'HIGH' : 'LOW',
        totalLossHa: response.data.data.reduce((sum, alert) => sum + (alert.loss || 0), 0)
      };
    } catch (error) {
      console.error('GFW API error:', error.message);
      return { risk: 'UNKNOWN', alerts: [] };
    }
  }

  async checkFarmPlot(plotGeoJSON) {
    const centroid = plotGeoJSON.features[0].geometry.coordinates[0][0]; // polygon centroid
    const lon = centroid[0];
    const lat = centroid[1];
    
    const alerts = await this.getDeforestationAlerts(lon, lat);
    
    return {
      plot: plotGeoJSON,
      gfw_alerts: alerts,
      eudr_compliant: alerts.risk === 'LOW',
      risk_score: alerts.risk === 'HIGH' ? 0.8 : 0.1
    };
  }

  async batchCheckPlots(plots) {
    const results = [];
    for (const plot of plots) {
      results.push(await this.checkFarmPlot(plot));
    }
    return results;
  }
}

module.exports = GlobalForestWatch;

