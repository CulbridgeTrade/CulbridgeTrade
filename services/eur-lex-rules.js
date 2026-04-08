
const axios = require('axios');

/**
 * EUR-Lex + EU Pesticides DB - Regulatory MRLs/prohibited
 * API: https://eur-lex.europa.eu/api
 */
class EURLexRules {
  async getMRLs(hsCode) {
    // Poll EU Pesticides DB
    try {
      const response = await axios.get(`https://food.ec.europa.eu/pesticides/mrl/api/${hsCode}`);
      return {
        hs_code: hsCode,
        mrl_limits: response.data.mrl,
        prohibited: response.data.prohibited,
        updated: response.data.last_update
      };
    } catch (error) {
      console.error('EUR-Lex error:', error);
      return { mrl_limits: {}, prohibited: [] };
    }
  }
}

module.exports = EURLexRules;

