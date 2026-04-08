
const axios = require('axios');

/**
 * Ushahidi Real-time Road Security
 */
class UshahidiRoadSecurity {
  async getLiveAlerts() {
    try {
      const response = await axios.get('https://your-ushahidi.ng/api/reports?category=road_block');
      return response.data.reports.map(r => ({
        lat: r.incident.geometry.coordinates[1],
        lon: r.incident.geometry.coordinates[0],
        timestamp: r.date,
        status: r.values.status, // clear/blocked/hazard
        alert_id: r.id
      }));
    } catch (error) {
      console.error('Ushahidi error:', error);
      return [];
    }
  }

  calculateSafeRoute(current, destination, alerts) {
    // Simplified - real impl uses graph algo
    const safePath = [current, destination].filter(point => !alerts.some(a => 
      Math.abs(a.lat - point.lat) < 0.1 && Math.abs(a.lon - point.lon) < 0.1
    ));
    return safePath.length === 2 ? safePath : [current];
  }
}

module.exports = UshahidiRoadSecurity;

