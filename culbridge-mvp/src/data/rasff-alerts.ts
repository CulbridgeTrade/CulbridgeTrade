// Active RASFF Alerts - Manually maintained for MVP
// Nigerian-origin commodities with active alerts

export interface RASFFAlert {
  reference: string;
  date: string;
  commodity: string;
  hazard: string;
  chemical?: string;
  origin_states: string[];
  severity: "CRITICAL" | "HIGH" | "MEDIUM";
  status: "OPEN" | "CLOSED";
  description: string;
}

export const RASFF_ALERTS: RASFFAlert[] = [
  // === SESAME - CHLORPYRIFOS ALERTS ===
  {
    reference: "2024.1847",
    date: "2024-03-15",
    commodity: "sesame seeds",
    hazard: "pesticide residues",
    chemical: "Chlorpyrifos",
    origin_states: ["Kano", "Jigawa", "Yobe", "Borno"],
    severity: "CRITICAL",
    status: "OPEN",
    description: "Chlorpyrifos residue detected at 0.45 mg/kg. EU MRL is 0.01 mg/kg. Shipment rejected."
  },
  {
    reference: "2024.1923",
    date: "2024-04-02",
    commodity: "sesame seeds",
    hazard: "pesticide residues",
    chemical: "Chlorpyrifos",
    origin_states: ["Kano", "Kaduna"],
    severity: "HIGH",
    status: "OPEN",
    description: "Multiple detections of Chlorpyrifos above MRL from Nigerian sesame exports."
  },
  
  // === SESAME - ENDOSULFAN ALERTS ===
  {
    reference: "2023.2156",
    date: "2023-11-20",
    commodity: "sesame seeds",
    hazard: "pesticide residues",
    chemical: "Endosulfan",
    origin_states: ["Kano", "Katsina"],
    severity: "CRITICAL",
    status: "OPEN",
    description: "Endosulfan (banned in EU) detected. Zero tolerance applies."
  },
  
  // === GINGER - PROFENOFOS ALERTS ===
  {
    reference: "2024.1702",
    date: "2024-02-28",
    commodity: "ginger",
    hazard: "pesticide residues",
    chemical: "Profenofos",
    origin_states: ["Kaduna", "Nasarawa", "Benue"],
    severity: "CRITICAL",
    status: "OPEN",
    description: "Profenofos detected at 0.12 mg/kg. EU default MRL is 0.01 mg/kg."
  },
  {
    reference: "2024.1789",
    date: "2024-03-10",
    commodity: "ginger",
    hazard: "pesticide residues",
    chemical: "Profenofos",
    origin_states: ["Kaduna", "Niger"],
    severity: "HIGH",
    status: "OPEN",
    description: "Continued Profenofos detections in Nigerian ginger."
  },
  
  // === COCOA - OCHRATOXIN ALERTS ===
  {
    reference: "2024.1654",
    date: "2024-02-15",
    commodity: "cocoa beans",
    hazard: "mycotoxins",
    chemical: "Ochratoxin A",
    origin_states: ["Cross River", "Ondo", "Osun"],
    severity: "HIGH",
    status: "OPEN",
    description: "Ochratoxin A detected at 45 ppb. EU limit is 30 ppb for roasted cocoa."
  },
  
  // === COCOA - CADMIUM ALERTS ===
  {
    reference: "2024.1712",
    date: "2024-03-01",
    commodity: "cocoa beans",
    hazard: "heavy metals",
    chemical: "Cadmium",
    origin_states: ["Ondo", "Osun", "Edo"],
    severity: "MEDIUM",
    status: "OPEN",
    description: "Elevated cadmium levels detected. EU limit is 0.30 mg/kg."
  }
];

export function getActiveAlertsForCommodity(commodity: string): RASFFAlert[] {
  return RASFF_ALERTS.filter(alert => 
    alert.status === "OPEN" && 
    alert.commodity.toLowerCase().includes(commodity.toLowerCase())
  );
}

export function checkRASFFMatch(chemical: string, commodity: string): RASFFAlert | null {
  return RASFF_ALERTS.find(alert =>
    alert.status === "OPEN" &&
    alert.commodity.toLowerCase().includes(commodity.toLowerCase()) &&
    alert.chemical?.toLowerCase() === chemical.toLowerCase()
  ) ?? null;
}

export default RASFF_ALERTS;
