const fuse = require('fuse.js');
const fs = require('fs');
const path = require('path');
const { run } = require('./utils/db');

class HSCodeValidator {
  constructor() {
this.hsCodes = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'hs-codes.json'), 'utf8'));
    this.fuse = new Fuse(this.hsCodes, {
      keys: ['description', 'product_name'],
      threshold: 0.4 // Deterministic fuzzy matching
    });
  }

  async validateHSCode(productDescription, category = 'agro-export') {
    const results = this.fuse.search(productDescription);
    
    if (results.length === 0) {
      return { matches: [], confidence: 0, error: 'No match found' };
    }

    const top3 = results.slice(0, 3).map(r => ({
      hs_code: r.item.code,
      description: r.item.description,
      confidence: (1 - r.score) * 100
    }));

    const selected = top3[0]; // Auto-select top match (deterministic)
    
    // Log to central module outputs
    const ModuleLogger = require('../utils/moduleLogger');
    await ModuleLogger.storeOutput(this.currentShipmentId, 'HSCodeValidator', {
      validated_hs_code: selected.hs_code,
      hs_mapping: selected.description,
      commodity_description: productDescription,
      confidence: selected.confidence,
      alternatives: top3.slice(1)
    });

    return {
      topMatch: selected.hs_code,
      confidence: selected.confidence,
      alternatives: top3.slice(1),
      validated_deterministic: true
    };
  }

  setShipmentId(id) {
    this.currentShipmentId = id;
  }
}

module.exports = HSCodeValidator;

// Deterministic test data
if (require.main === module) {
  const validator = new HSCodeValidator();
  console.log(validator.validateHSCode('Sesame seeds'));
}

// API Endpoint integration ready

