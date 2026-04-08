
const axios = require('axios');

/**
 * Odoo eCommerce Connector
 */
class OdooConnector {
  constructor(url, db, username, password) {
    this.url = url;
    this.db = db;
    this.auth = { username, password };
  }

  async syncInventory(product) {
    try {
      await axios.post(`${this.url}/jsonrpc`, {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          service: 'object',
          method: 'execute_kw',
          args: [this.db, this.auth.username, this.auth.password, 'product.product', 'write', [[product.product_id], product]]
        }
      });
      console.log('Inventory synced:', product.product_id);
    } catch (error) {
      console.error('Odoo sync error:', error);
    }
  }
}

module.exports = OdooConnector;

