// EU MRL Database - Sesame and Cocoa only for MVP
// Values in mg/kg
export const EU_MRL_DATABASE = [
  // Sesame
  { chemical: "Chlorpyrifos", commodity: "sesame", mrl_mg_kg: 0.01, is_default: true, is_banned: false },
  { chemical: "Endosulfan",   commodity: "sesame", mrl_mg_kg: 0.005, is_default: false, is_banned: true },
  { chemical: "Profenofos",   commodity: "sesame", mrl_mg_kg: 0.01, is_default: true, is_banned: false },
  { chemical: "Dimethoate",   commodity: "sesame", mrl_mg_kg: 0.01, is_default: true, is_banned: false },
  { chemical: "Cypermethrin", commodity: "sesame", mrl_mg_kg: 0.05, is_default: false, is_banned: false },
  { chemical: "Salmonella",   commodity: "sesame", mrl_mg_kg: 0, is_default: false, is_banned: false, is_microbiological: true },
  
  // Cocoa
  { chemical: "Ochratoxin A", commodity: "cocoa", mrl_mg_kg: 0.03, is_default: false, is_banned: false, is_mycotoxin: true },
  { chemical: "Aflatoxin B1", commodity: "cocoa", mrl_mg_kg: 0.005, is_default: false, is_banned: false, is_mycotoxin: true },
  { chemical: "Aflatoxin Total", commodity: "cocoa", mrl_mg_kg: 0.01, is_default: false, is_banned: false, is_mycotoxin: true },
  { chemical: "Cadmium",      commodity: "cocoa", mrl_mg_kg: 0.3, is_default: false, is_banned: false },
  { chemical: "Lead",         commodity: "cocoa", mrl_mg_kg: 0.1, is_default: false, is_banned: false },
  { chemical: "Chlorpyrifos", commodity: "cocoa", mrl_mg_kg: 0.05, is_default: false, is_banned: false },
  { chemical: "Endosulfan",   commodity: "cocoa", mrl_mg_kg: 0.005, is_default: false, is_banned: true },
  { chemical: "Lindane",     commodity: "cocoa", mrl_mg_kg: 0.01, is_default: true, is_banned: true }
];

export function lookupMRL(chemical, commodity) {
  if (!commodity) return null;
  
  return EU_MRL_DATABASE.find(r =>
    r.chemical.toLowerCase() === chemical.toLowerCase() &&
    r.commodity.toLowerCase() === commodity.toLowerCase()
  ) || null;
}
