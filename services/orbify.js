/**
 * Orbify integration - Orbital imagery analytics
 * Satellite data marketplace API
 */
const axios = require('axios');

class Orbify {
  constructor() {
    this.apiUrl = 'https://api.orbify.com/v1';
    this.apiKey = process.env.ORBIFY_API_KEY || 'demo';
  }

  async getOrbitalImagery(lon, lat, dateRange = '2024-01-01T00:00:00Z/2024-03-01T23:59:59Z') {
    try {
      const response = await axios.get(`${this.apiUrl}/search`, {
        params: {
          lon,
          lat,
          date: dateRange,
          collections: 'sentinel-2-l2a,planet-nicfi',
          api_key: this.apiKey
        }
      });
      return response.data;
    } catch (error) {
      console.error('Orbify error:', error.message);
      return { features: [] };
    }
  }

  async analyzeDeforestation(lon, lat) {
    const imagery = await this.getOrbitalImagery(lon, lat);
    const change = imagery.features.filter(f => f.properties.change);
    
    return {
      deforestation_events: change.length,
      risk_level: change.length > 5 ? 'HIGH' : 'LOW',
      imagery_count: imagery.features.length
    };
  }

  async cropNDVI(lon, lat) {
    // Similar to Sentinel Hub
    const imagery = await this.getOrbitalImagery(lon, lat);
    return {
      ndvi_available: imagery.features.some(f => f.properties.ndvi),
      datasets: imagery.features
    };
  }
}

module.exports = Orbify;

