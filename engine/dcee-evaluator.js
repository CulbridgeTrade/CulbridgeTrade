const fs = require('fs');
const path = require('path');

class DCEE {
  constructor() {
    this.rulesPath = path.join(__dirname, 'dcee-rules-cocoa-nl.json');
    this.rules = require(this.rulesPath);
  }

  validateInput(input) {
    const required = ['product', 'origin_country', 'destination_country', 'entry_port', 'use_case'];
    for (let field of required) {
      if (!input[field]) {
        throw new Error(`Missing required input: ${field}`);
      }
    }
  }

  matchAppliesIf(rule, input) {
    const applies = rule.applies_if || {};
    return Object.entries(applies).every(([key, val]) => {
      if (typeof val === 'string') {
        return input[key] === val;
      } else if (Array.isArray(val)) {
        return val.includes(input[key]);
      }
      return false;
    });
  }

  evaluate(input) {
    this.validateInput(input);

    const matchedRules = this.rules.filter(rule => this.matchAppliesIf(rule, input));
    matchedRules.sort((a, b) => a.priority - b.priority);

    const documents = matchedRules.filter(r => r.type === 'document').map(r => r.payload);
    const constraints = matchedRules.filter(r => r.type === 'constraint').map(r => r.payload);
    const actions = matchedRules.filter(r => r.type === 'action').map(r => r.payload).sort((a, b) => a.step - b.step);

    const output = {
      documents,
      constraints,
      actions,
      status: documents.length > 0 && actions.length > 0 ? 'VALID' : 'INVALID'
    };

    this.validateOutput(output);

    return output;
  }

  validateOutput(output) {
    const required_groups = ['core_documents', 'food_safety_constraints', 'export_clearance_steps'];
    output.covered_groups = ['core_documents']; // From matched
    for (let group of required_groups) {
      if (!output.covered_groups.includes(group)) {
        throw new Error(`Missing rule group: ${group}`);
      }
    }
    if (output.documents.length === 0) throw new Error('No documents generated');
    if (output.actions.length === 0) throw new Error('No actions generated');
    for (let doc of output.documents) {
      if (!doc.issuer) throw new Error('Incomplete document: no issuer');
    }
  }

}

module.exports = DCEE;

// Usage
// const dcee = new DCEE();
// const output = dcee.evaluate({product: 'cocoa_beans', origin_country: 'NG', destination_country: 'NL', entry_port: 'rotterdam', use_case: 'food_import'});

