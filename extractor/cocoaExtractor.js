/**
 * Cocoa Document Extraction Layer - Deterministic MVP
 * Extracts exact fields from lab reports/certificates for EU enforcement engine
 * No AI, strict regex + text matching only
 */

const fs = require('fs');
const path = require('path');

// Field mappings from spec
const FIELDS = {
  shipment_id: { regex: /shipment[_ ]?id[:\s]*([A-Z0-9\-]+)/i, type: 'string' },
  batch_number: { regex: /batch[_ ]?(?:no|number)[:\s]*([A-Z0-9\-]+)/i, type: 'string' },
  botanical_name: { regex: /botanical[_ ]?name[:\s]*([A-Za-z\s]+)/i, type: 'string', validate: 'Theobroma cacao' },
  lab_name: { regex: /lab(?:oratory)?[:\s]*([A-Za-z\s,]+)/i, type: 'string' },
  lab_accreditation: { regex: /iso[_ ]?17025|accreditation[:\s]*([A-Za-z\s]+)/i, type: 'string', validate: 'ISO 17025' },
  lab_expiry_date: { regex: /(?:lab[_ ]?(?:accred|exp)iry|valid[_ ]?until)[:\s]*(\d{4}[-\/]\d{2}[-\/]\d{2})/, type: 'date' },
  report_date: { regex: /(?:test|report|analysis)[_ ]?date[:\s]*(\d{4}[-\/]\d{2}[-\/]\d{2})/, type: 'date' },
  aflatoxin_b1: { regex: /aflatoxin[_ ]?b1[:\s]*([0-9.]+)\s*µ?g\/kg/i, type: 'float' },
  aflatoxin_total: { regex: /aflatoxin[_ ]?(?:total|sum)[:\s]*([0-9.]+)\s*µ?g\/kg/i, type: 'float' },
  moisture_percent: { regex: /moisture[_ ]?(?:content|%)[:\s]*([0-9.]+)\s*%?/i, type: 'float' },
  pesticide_residues: { regex: /pesticide[:\s]*([A-Za-z]+)\s*[0-9.]+.*?mrl[:\s]*([0-9.]+)/gs, type: 'array' },
  cert_origin_number: { regex: /certificate[_ ]?of[_ ]?origin[_ ]?(?:no|num)[:\s]*([A-Z0-9\-]+)/i, type: 'string' },
  phyto_cert_number: { regex: /phytosanitary[_ ]?(?:cert|certificate)[_ ]?(?:no|num)[:\s]*([A-Z0-9\-]+)/i, type: 'string' },
  health_cert_number: { regex: /health[_ ]?(?:cert|certificate)[_ ]?(?:no|num)[:\s]*([A-Z0-9\-]+)/i, type: 'string' },
  traceability_geo: { regex: /geo[_ ]?(?:coord|location|lat)[, ]?([0-9.-]+)[, ]?([0-9.-]+)/, type: 'string' },
  traceability_farm: { regex: /farm[_ ]?(?:name|id|info)[:\s]*([A-Za-z0-9\s\-]+)/i, type: 'string' },
  hs_code: { regex: /hs[_ ]?code[:\s]*(\d{6,})/, type: 'string', validate: /^18/ },
  exporter_id: { regex: /exporter[_ ]?id[:\s]*([A-Z0-9\-]+)/i, type: 'string' },
  cci_number: { regex: /cci[_ ]?(?:no|number)[:\s]*([A-Z0-9\-]+)/i, type: 'string' },
  trms_id: { regex: /trms[_ ]?(?:id|no)[:\s]*([A-Z0-9\-]+)/i, type: 'string' },
  ness_paid: { regex: /ness[_ ]?fee[_ ]?paid|ness[_ ]?status[:\s]*paid|yes/i, type: 'boolean' },
  naqs_inspection_date: { regex: /naqs[_ ]?(?:inspection|date)[:\s]*(\d{4}[-\/]\d{2}[-\/]\d{2})/i, type: 'date' },
  naqs_passed: { regex: /naqs[_ ]?(?:passed|status|result)[:\s]*pass|compliant/i, type: 'boolean' }
};

class CocoaExtractor {
  extractFromText(text, documentType) {
    const extracted = {};
    const sources = [];

    Object.entries(FIELDS).forEach(([field, config]) => {
      const match = text.match(config.regex);
      if (match) {
        let value = match[1].trim();
        if (config.type === 'float') value = parseFloat(value);
        if (config.type === 'date') value = new Date(value).toISOString().split('T')[0];
        if (config.type === 'array') {
          value = text.match(config.regex)?.map(m => ({ name: m[1], value: parseFloat(m[2]), mrl: parseFloat(m[3]) })) || [];
        }

        // Validate
        if (config.validate && value !== config.validate) {
          extracted[field] = null; // Invalid
        } else {
          extracted[field] = value;
        }
        sources.push({ field, source: documentType, match: match[0] });
      }
    });

    // Batch linkage check
    if (extracted.shipment_batch_number && extracted.lab_batch_number && extracted.shipment_batch_number !== extracted.lab_batch_number) {
      extracted.batch_mismatch = true;
    }

    // Lab freshness <6 months
    if (extracted.report_date) {
      const months = (new Date() - new Date(extracted.report_date)) / (1000 * 60 * 60 * 24 * 30);
      extracted.report_fresh = months < 6;
    }

    return {
      extracted,
      audit_sources: sources,
      extraction_timestamp: new Date().toISOString()
    };
  }

  // Simulate multi-doc extraction
  async extractShipment(shipmentId, documentPaths) {
    const allText = {};
    for (const [type, filePath] of Object.entries(documentPaths)) {
      const text = await fs.promises.readFile(filePath, 'utf8');
      allText[type] = this.extractFromText(text, type);
    }

    // Merge + validate
    const merged = {};
    Object.keys(FIELDS).forEach(field => {
      for (const type of Object.keys(allText)) {
        if (allText[type].extracted[field]) {
          merged[field] = allText[type].extracted[field];
          break;
        }
      }
    });

    return {
      shipment_id: shipmentId,
      ...merged,
      extraction_complete: true,
      total_fields_extracted: Object.keys(merged).length,
      audit_sources: Object.values(allText).flatMap(t => t.audit_sources)
    };
  }
}

module.exports = CocoaExtractor;

// Usage: feeds directly to RuleEngine.evaluate()

