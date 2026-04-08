// RASFF Alerts - Manually maintained for MVP
export const RASFF_ALERTS = [
  // Add real RASFF alerts here as they are published
  // Source: rasff.eu — search Nigeria + sesame/cocoa
];

export function getActiveAlertsForCommodity(commodity) {
  return RASFF_ALERTS.filter(alert => 
    alert.active && 
    alert.commodity.toLowerCase().includes(commodity.toLowerCase())
  );
}

export function checkRASFFMatch(chemical, commodity) {
  return RASFF_ALERTS.find(alert =>
    alert.active &&
    alert.commodity.toLowerCase().includes(commodity.toLowerCase()) &&
    alert.chemical?.toLowerCase() === chemical.toLowerCase()
  ) || null;
}
