// EU MRL Database - Sesame and Cocoa only for MVP
// Values in mg/kg
const EU_MRL_DATABASE = [
  // === SESAME SEEDS ===
  { chemical: "Chlorpyrifos", commodity: "sesame", mrl_mg_kg: 0.01, is_banned: false, is_default: true, regulation: "EU 2023/915", effective_date: "2024-01-01" },
  { chemical: "Endosulfan", commodity: "sesame", mrl_mg_kg: 0.01, is_banned: true, is_default: true, regulation: "EU 2023/915", effective_date: "2024-01-01" },
  { chemical: "Profenofos", commodity: "sesame", mrl_mg_kg: 0.01, is_banned: false, is_default: true, regulation: "EU 2023/915", effective_date: "2024-01-01" },
  { chemical: "Cypermethrin", commodity: "sesame", mrl_mg_kg: 0.05, is_banned: false, is_default: false, regulation: "EU 2023/915", effective_date: "2024-01-01" },
  { chemical: "Lambda-cyhalothrin", commodity: "sesame", mrl_mg_kg: 0.02, is_banned: false, is_default: false, regulation: "EU 2023/915", effective_date: "2024-01-01" },
  { chemical: "Dimethoate", commodity: "sesame", mrl_mg_kg: 0.05, is_banned: false, is_default: false, regulation: "EU 2023/915", effective_date: "2024-01-01" },
  { chemical: "Carbofuran", commodity: "sesame", mrl_mg_kg: 0.01, is_banned: true, is_default: true, regulation: "EU 2023/915", effective_date: "2024-01-01" },
  { chemical: "Carbosulfan", commodity: "sesame", mrl_mg_kg: 0.01, is_banned: true, is_default: true, regulation: "EU 2023/915", effective_date: "2024-01-01" },
  { chemical: "DDT", commodity: "sesame", mrl_mg_kg: 0.05, is_banned: true, is_default: false, regulation: "EU 2023/915", effective_date: "2024-01-01" },

  // === COCOA BEANS ===
  { chemical: "Ochratoxin A", commodity: "cocoa", mrl_mg_kg: 0.03, is_banned: false, is_default: false, regulation: "EU 2023/915", effective_date: "2024-01-01" },
  { chemical: "Cadmium", commodity: "cocoa", mrl_mg_kg: 0.30, is_banned: false, is_default: false, regulation: "EU 2023/915", effective_date: "2024-01-01" },
  { chemical: "Lead", commodity: "cocoa", mrl_mg_kg: 1.00, is_banned: false, is_default: false, regulation: "EU 2023/915", effective_date: "2024-01-01" },
  { chemical: "Aflatoxin B1", commodity: "cocoa", mrl_mg_kg: 0.005, is_banned: false, is_default: false, regulation: "EU 2023/915", effective_date: "2024-01-01" },
  { chemical: "Total Aflatoxin", commodity: "cocoa", mrl_mg_kg: 0.010, is_banned: false, is_default: false, regulation: "EU 2023/915", effective_date: "2024-01-01" },
  { chemical: "Chlorpyrifos", commodity: "cocoa", mrl_mg_kg: 0.01, is_banned: false, is_default: true, regulation: "EU 2023/915", effective_date: "2024-01-01" },
  { chemical: "Lindane", commodity: "cocoa", mrl_mg_kg: 0.01, is_banned: true, is_default: true, regulation: "EU 2023/915", effective_date: "2024-01-01" },
  { chemical: "Pirimiphos-methyl", commodity: "cocoa", mrl_mg_kg: 0.05, is_banned: false, is_default: false, regulation: "EU 2023/915", effective_date: "2024-01-01" },

  // === SHARED ===
  { chemical: "Pesticide Residue", commodity: "all", mrl_mg_kg: 0.01, is_banned: false, is_default: true, regulation: "EU 2023/915", effective_date: "2024-01-01" }
];

function lookupMRL(chemical, commodity) {
  if (!commodity) {
    return EU_MRL_DATABASE.find(r => r.chemical === chemical && r.commodity === "all") || null;
  }
  
  return EU_MRL_DATABASE.find(r =>
    r.chemical === chemical &&
    (r.commodity.toLowerCase() === commodity.toLowerCase() || r.commodity === "all")
  ) || null;
}

module.exports = { EU_MRL_DATABASE, lookupMRL };
