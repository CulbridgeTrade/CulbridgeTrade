const feesData = require('./export-fees-mvp.json');

class ExportFeesCalculator {
  calculateShipmentFees(shipment) {
    let totalFee = 0;
    let timelineMin = 0;
    let timelineMax = 0;
    const breakdown = [];

    for (const certRef of shipment.required_certificates) {
      const cert = feesData.certificates.find(c => c.certificate_id === certRef.certificate_id);
      const agency = feesData.agencies.find(a => a.agency_id === cert.issuing_agency_id);
      
      let fee = cert.base_fee_naira || 0;
      
      // Variable fee calculation (simplified)
      if (cert.variable_fee_info) {
        if (cert.variable_fee_info.type === 'weight-based') {
          fee += Math.min(shipment.products.reduce((sum, p) => sum + p.weight_kg, 0) * 25, 50000);
        }
      }
      
      // Fast-track
      if (certRef.fast_track && cert.fast_track_fee_naira) {
        fee += cert.fast_track_fee_naira;
        timelineMin += cert.fast_track_processing_days[0];
        timelineMax += cert.fast_track_processing_days[1];
      } else {
        timelineMin += cert.processing_time_days[0];
        timelineMax += cert.processing_time_days[1];
      }
      
      breakdown.push({
        certificate_id: cert.certificate_id,
        agency_name: agency.name,
        fee_naira: fee,
        processing_days: certRef.fast_track ? cert.fast_track_processing_days : cert.processing_time_days
      });
      
      totalFee += fee;
    }
    
    return {
      shipment_id: shipment.shipment_id,
      total_estimated_fee_naira: totalFee,
      estimated_processing_days: [Math.round(timelineMin * 100) / 100, Math.round(timelineMax * 100) / 100],
      certificate_breakdown: breakdown,
      critical_path_days: timelineMax,
      agencies_contacted: breakdown.map(b => b.agency_name).filter((v, i, a) => a.indexOf(v) === i)
    };
  }
}

module.exports = ExportFeesCalculator;

console.log('Export Fees Calculator loaded. Use calculateAndStoreFees(shipment) to calculate and log.');


console.log('Export Fees Calculator loaded. Test with: node export-fees-calculator.js');
