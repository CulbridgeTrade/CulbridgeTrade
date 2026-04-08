const axios = require('axios');

/**
 * GeoNode integration - Open source geospatial CMS
 */
class GeoNode {
  constructor(baseURL = process.env.GEONODE_URL || 'http://localhost:8000') {
    this.baseURL = baseURL;
  }

  async login(username, password) {
    try {
      const response = await axios.post(`${this.baseURL}/api/o/token/`, {
        username,
        password,
        grant_type: 'password'
      });
      this.token = response.data.access_token;
      return true;
    } catch (error) {
      return false;
    }
  }

  async uploadLayer(layerData) {
    const formData = new FormData();
    formData.append('base_file', layerData.file);
    formData.append('name', layerData.name);
    
    return axios.post(`${this.baseURL}/upload/`, formData, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'multipart/form-data'
      }
    });
  }

  async getLayers() {
    return axios.get(`${this.baseURL}/api/layers/`, {
      headers: { Authorization: `Bearer ${this.token}` }
    });
  }

  async farmPlotsEUDR(geojson) {
    // Upload farm plots for EUDR verification
    return await this.uploadLayer({
      name: 'culbridge-farm-plots',
      file: Buffer.from(JSON.stringify(geojson))
    });
  }
}

module.exports = GeoNode;

