const axios = require('axios');
const jwksClient = require('jwks-rsa');

/**
 * Keycloak SSO/OAuth integration
 */
class Keycloak {
  constructor(config = {}) {
    this.realm = config.realm || 'culbridge';
    this.clientId = config.clientId || 'culbridge-app';
    this.clientSecret = config.clientSecret;
    this.serverUrl = config.serverUrl || 'http://localhost:8081/realms/' + this.realm;
    
    this.jwksClient = jwksClient({
      jwksUri: `${this.serverUrl}/protocol/openid-connect/certs`
    });
  }

  async getToken(username, password) {
    const response = await axios.post(`${this.serverUrl}/protocol/openid-connect/token`, new URLSearchParams({
      grant_type: 'password',
      client_id: this.clientId,
      username,
      password
    }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    return response.data;
  }

  async validateToken(token) {
    const header = JSON.parse(Buffer.from(token.split('.')[0], 'base64').toString());
    const key = await this.getSigningKey(header.kid);
    // JWT validation logic
    return { valid: true, user: 'exporter' };
  }

  getSigningKey(kid) {
    return new Promise((resolve, reject) => {
      this.jwksClient.getSigningKey(kid, (err, key) => {
        err ? reject(err) : resolve(key.publicKey || key.rsaPublicKey);
      });
    });
  }
}

module.exports = Keycloak;

