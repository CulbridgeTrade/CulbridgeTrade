const SentinelHub = require('@sentinel-hub/sentinelhub-js');
const axios = require('axios');

/**
 * Sentinel Hub API - Satellite imagery for crop monitoring/deforestation
 */
class SentinelHub {
  constructor() {
    this.sh = new SentinelHub({
      shClientId: process.env.SENTINEL_HUB_CLIENT_ID,
      shClientSecret: process.env.SENTINEL_HUB_CLIENT_SECRET
    });
  }

  async getNDVI(lon, lat, bbox, fromDate = '2024-01-01', toDate = '2024-03-01') {
    try {
      const evalRequest = {
        input: [{
          dataCollection: {
            id: 'S2L2A'
          },
          processing: {
            defaultBBOX: bbox,
            defaultCRS: 'EPSG:4326',
            evalscript: `
              // NDVI = (NIR - RED) / (NIR + RED)
              let ndvi = index(NDVI('B08', 'B04'));
              return [ndvi, ndvi, 1-ndvi];
            `
          },
          mosaickingOrder: 'mostRecent'
        }],
        aggregation: {
          bbox,
          fromTime: fromDate + 'T00:00:00Z',
          resolution: { width: 512, height: 512 },
          toTime: toDate + 'T23:59:59Z',
          crs: 'EPSG:4326',
          upscaleMethod: 'BILINEAR'
        }
      };

      const response = await axios.post('https://services.sentinel-hub.com/api/v1/process', evalRequest, {
        headers: {
          Authorization: `Bearer ${await this.getAccessToken()}`
        }
      });

      return response.data;
    } catch (error) {
      console.error('Sentinel Hub error:', error.message);
      return null;
    }
  }

  async cropHealthIndex(lon, lat, bbox) {
    const imagery = await this.getNDVI(lon, lat, bbox);
    
    if (!imagery) return { health: 'UNKNOWN' };
    
    // Calculate NDVI mean
    const ndviMean = imagery.data.reduce((sum, pixel) => sum + pixel[0], 0) / imagery.data.length;
    
    return {
      ndvi_mean: ndviMean,
      health: ndviMean > 0.6 ? 'HEALTHY' : ndviMean > 0.3 ? 'STRESSED' : 'POOR',
      imagery
    };
  }

  async getAccessToken() {
    // Simplified - use SH JS SDK auth
    return 'demo-token'; // Replace with real OAuth flow
  }
}

module.exports = SentinelHub;

