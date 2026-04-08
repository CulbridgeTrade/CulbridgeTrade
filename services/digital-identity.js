
const axios = require('axios');

/**
 * vLEI + OpenOwnership - Digital Passport Anti-Fraud
 */
class DigitalIdentity {
  async verifyExporter(exporterId) {
    try {
      // vLEI API
      const vlei = await axios.get(`https://api.vlei.global/lei/${exporterId}`);
      if (vlei.data.status !== 'active') {
        return { verification_status: 'BLOCK_SHIPMENT', reason: 'vLEI inactive' };
      }

      // OpenOwnership beneficial owners
      const owners = await axios.get(`https://api.openownership.org/entities/${exporterId}`);
      for (const owner of owners.data.beneficial_owners) {
        if (owner.PEP_status || owner.sanctions_list_check !== 'cleared') {
          return { verification_status: 'BLOCK_SHIPMENT', reason: 'PEP/sanctioned owner' };
        }
      }

      return {
        exporter_id: exporterId,
        vLEI: vlei.data,
        beneficial_owners: owners.data.beneficial_owners,
        verification_status: 'VERIFIED',
        last_verified: new Date().toISOString()
      };
    } catch (error) {
      console.error('Digital Identity error:', error);
      return { verification_status: 'PENDING', reason: 'API error' };
    }
  }
}

module.exports = DigitalIdentity;

