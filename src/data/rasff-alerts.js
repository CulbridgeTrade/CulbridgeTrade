// Active RASFF Alerts - Manually maintained for MVP
const RASFF_ALERTS = [
  // SESAME - CHLORPYRIFOS
  { reference: "2024.1847", date: "2024-03-15", commodity: "sesame seeds", hazard: "pesticide residues", chemical: "Chlorpyrifos", origin_states: ["Kano", "Jigawa", "Yobe", "Borno"], severity: "CRITICAL", status: "OPEN", description: "Chlorpyrifos at 0.45 mg/kg. EU MRL 0.01." },
  { reference: "2024.1923", date: "2024-04-02", commodity: "sesame seeds", hazard: "pesticide residues", chemical: "Chlorpyrifos", origin_states: ["Kano", "Kaduna"], severity: "HIGH", status: "OPEN", description: "Multiple Chlorpyrifos detections." },
  
  // SESAME - ENDOSULFAN
  { reference: "2023.2156", date: "2023-11-20", commodity: "sesame seeds", hazard: "pesticide residues", chemical: "Endosulfan", origin_states: ["Kano", "Katsina"], severity: "CRITICAL", status: "OPEN", description: "Endosulfan (banned in EU) detected." },
  
  // GINGER - PROFENOFOS
  { reference: "2024.1702", date: "2024-02-28", commodity: "ginger", hazard: "pesticide residues", chemical: "Profenofos", origin_states: ["Kaduna", "Nasarawa", "Benue"], severity: "CRITICAL", status: "OPEN", description: "Profenofos at 0.12 mg/kg. EU default 0.01." },
  { reference: "2024.1789", date: "2024-03-10", commodity: "ginger", hazard: "pesticide residues", chemical: "Profenofos", origin_states: ["Kaduna", "Niger"], severity: "HIGH", status: "OPEN", description: "Continued Profenofos detections." },
  
  // COCOA - OCHRATOXIN
  { reference: "2024.1654", date: "2024-02-15", commodity: "cocoa beans", hazard: "mycotoxins", chemical: "Ochratoxin A", origin_states: ["Cross River", "Ondo", "Osun"], severity: "HIGH", status: "OPEN", description: "Ochratoxin A at 45 ppb. EU limit 30 ppb." },
  
  // COCOA - CADMIUM
  { reference: "2024.1712", date: "2024-03-01", commodity: "cocoa beans", hazard: "heavy metals", chemical: "Cadmium", origin_states: ["Ondo", "Osun", "Edo"], severity: "MEDIUM", status: "OPEN", description: "Elevated cadmium levels." }
];

function getActiveAlertsForCommodity(commodity) {
  return RASFF_ALERTS.filter(alert => 
    alert.status === "OPEN" && 
    alert.commodity.toLowerCase().includes(commodity.toLowerCase())
  );
}

function checkRASFFMatch(chemical, commodity) {
  return RASFF_ALERTS.find(alert =>
    alert.status === "OPEN" &&
    alert.commodity.toLowerCase().includes(commodity.toLowerCase()) &&
    alert.chemical && alert.chemical.toLowerCase() === chemical.toLowerCase()
  ) || null;
}

module.exports = { RASFF_ALERTS, getActiveAlertsForCommodity, checkRASFFMatch };
