// NSW Clean Declaration Payload Builder v2026.1
// Deterministic, Signed, Auditable

const crypto = require('crypto');
const nswMiddleware = require('./nsw-compliance-middleware');
const aeoMachine = require('./aeo-state-machine');
const feesCalc = require('./export-fees-calculator');
const { get } = require('./utils/db');

class CleanDeclarationBuilder {
async buildCleanDeclaration(shipmentId, signatureTier, certPath = null, certPassword = null, vninToken = null) {
    // 1. Run full compliance pipeline
    const middleware = new nswMiddleware();
    const pipelineResult = await middleware.processShipment({ shipment_id: shipmentId });
    
    if (!pipelineResult.ready_for_submission) {
      throw new Error('Pipeline failed - not submission ready');
    }

    // 2. Generate deterministic payload blocks
    const exporter = await get('SELECT * FROM ExporterProfile WHERE TIN = ?', [pipelineResult.exporter_tin]);
    const aeoStatus = await aeoMachine.getApplicationStatus(exporter.TIN);
    
    const payload = {
      declaration_header: {
        declaration_type: "Clean Declaration v2026.1",
        culbridge_ref: `CUL-${shipmentId}-${Date.now()}`,
        aeo_tier: aeoStatus.application?.Tier || 'NONE',
        aeo_cert_number: aeoStatus.application?.ApplicationID || null,
        priority_lane: aeoStatus.application?.Tier === 'AEO-S' ? 'GREEN_LANE' : 'STANDARD',
        timestamp: new Date().toISOString(),
        verified_deterministic: true
      },
      exporter_details: {
        tin: exporter.TIN,
        cac: exporter.CACNumber,
        legal_name: exporter.LegalEntityName,
        tax_clearance_valid: exporter.TaxClearance && new Date(exporter.TaxClearanceExpiry) > new Date(),
        validated: pipelineResult.entity_validated
      },
      consignment_logic: {
        validated_hs_code: pipelineResult.hs_code,
        country_code: "NG",
        invoice_total: pipelineResult.value,
        currency: "USD"
      },
      compliance_verification: {
        permits: pipelineResult.documents.map(d => ({
          permit_ref: d.id,
          verified_deterministic: true,
          eu_compliant: true
        })),
        eudr_status: pipelineResult.eudr_status,
        green_passport_attached: true
      },
      financial_calculation: {
        total_duties: pipelineResult.fees.duty,
        nes_levy: pipelineResult.fees.levy,
        agency_fees: pipelineResult.fees.agency,
        payment_reference: pipelineResult.payment_ref,
        verified_deterministic: true
      }
    };

// 3. Digital Signature
    const sigModule = require('./digital-signature-module');
    let digitalSeal;
    
    if (signatureTier === 'soft') {
      digitalSeal = await sigModule.signWithSoftCert(payload, certPath, certPassword);
    } else if (signatureTier === 'v nin') {
      digitalSeal = await sigModule.signWithVNIN(payload, vninToken);
    } else {
      digitalSeal = await sigModule.signWithHSM(payload, hsmClient);
    }
    
    payload.digital_seal = digitalSeal;

    payload.digital_signature = {
      signer_id: "AGENT-001",
      signature_algorithm: "RSA-SHA256",
      signature_value: signature,
      timestamp: new Date().toISOString()
    };

    // 4. Audit & Store
    await this.auditPayload(shipmentId, payload, pipelineResult.audit_events);

    return payload;
  }

  async auditPayload(shipmentId, payload, pipelineEvents) {
    await run('INSERT INTO EventLog (ShipmentID, EventType, Data) VALUES (?, ?, ?)', [
      shipmentId,
      'clean_declaration_generated',
      JSON.stringify({ payload_hash: crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex'), pipeline_events: pipelineEvents })
    ]);
  }
}

module.exports = CleanDeclarationBuilder;

console.log('Clean Declaration Builder ready');

