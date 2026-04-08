// Normalize Module - Standardize chemicals, units, commodities
import { NormalizedInput, NormalizedChemical } from "../types";
import { CHEMICAL_ALIASES } from "../data/chemical-aliases";
import { EU_MRL_DATABASE, lookupMRL } from "../data/mrl-database";

interface NormalizeOptions {
  commodity_hint: string | null;
  destination_hint: string | null;
}

export async function normalize(
  text: string,
  options: NormalizeOptions
): Promise<NormalizedInput> {
  const commodity = extractCommodity(text, options.commodity_hint);
  const destination = extractDestination(text, options.destination_hint);
  const authority = detectAuthority(text);
  const chemicals = extractAndNormalizeChemicals(text, commodity);
  const documents = detectDocumentsPresent(text);

  return {
    commodity,
    destination,
    chemicals,
    documents_present: documents,
    authority
  };
}

function extractCommodity(text: string, hint: string | null): string | null {
  if (hint) {
    const normalized = normalizeCommodityName(hint);
    if (normalized) return normalized;
  }
  
  const lower = text.toLowerCase();

  // Check for sesame (multiple languages)
  if (lower.includes("sesame") || lower.includes("sesamzaad") ||
      lower.includes("sesamsamen") || lower.includes("1207.40") ||
      lower.includes("sesam") || lower.includes("til")) {
    return "sesame";
  }

  // Check for cocoa
  if (lower.includes("cocoa") || lower.includes("cacao") ||
      lower.includes("kakao") || lower.includes("1801") ||
      lower.includes("kakaobohnen") || lower.includes("cacaobonen")) {
    return "cocoa";
  }

  // Check for ginger
  if (lower.includes("ginger") || lower.includes("gember") ||
      lower.includes("ingwer") || lower.includes("0911")) {
    return "ginger";
  }

  return null;
}

function extractDestination(text: string, hint: string | null): string | null {
  if (hint) {
    const upper = hint.toUpperCase().slice(0, 2);
    if (["NL", "DE", "BE", "GB"].includes(upper)) return upper;
  }

  // Infer from authority mentions
  const authority = detectAuthority(text);
  if (authority === "NVWA") return "NL";
  if (authority === "BVL") return "DE";

  // Check for country mentions
  const lower = text.toLowerCase();
  if (lower.includes("nederland") || lower.includes("rotterdam") ||
      lower.includes("amsterdam") || lower.includes("netherlands")) {
    return "NL";
  }
  if (lower.includes("duitschland") || lower.includes("duitsland") ||
      lower.includes("hamburg") || lower.includes("duits") || lower.includes("germany")) {
    return "DE";
  }

  return null;
}

function detectAuthority(text: string): "NVWA" | "BVL" | "UNKNOWN" {
  const lower = text.toLowerCase();

  const nvwaSignals = [
    "nvwa", "nederlandse", "voedsel", "warenautoriteit",
    "bezwaar", "kennisgeving", "ministerie van landbouw",
    "nederland", "rotterdam", "amsterdam"
  ];
  const bvlSignals = [
    "bvl", "bundesamt", "verbraucherschutz",
    "widerspruch", "befunde", "bundesministerium",
    "duitschland", "hamburg", "berlin"
  ];

  const nvwaScore = nvwaSignals.filter(s => lower.includes(s)).length;
  const bvlScore = bvlSignals.filter(s => lower.includes(s)).length;

  if (nvwaScore > bvlScore && nvwaScore >= 2) return "NVWA";
  if (bvlScore > nvwaScore && bvlScore >= 2) return "BVL";
  return "UNKNOWN";
}

function extractAndNormalizeChemicals(
  text: string,
  commodity: string | null
): NormalizedChemical[] {
  const chemicals: NormalizedChemical[] = [];
  
  // Pattern variants:
  // English: "Chlorpyrifos: 0.45 mg/kg (MRL: 0.01 mg/kg)"
  // Dutch: "Chloorpyrifos: 0,45 mg/kg (Norm: 0,01 mg/kg)"
  // German: "Chlorpyrifos: 0,45 mg/kg (GW: 0,01 mg/kg)"
  // Various: "Chlorpyrifos 0.45 mg/kg MRL 0.01" or "Detected: 0.45ppm Limit: 0.01ppm"

  const patterns = [
    // Standard format with parentheses
    /([a-zA-ZÀ-ÿ\s\-]+)[:\s]+([\d,\.]+)\s*(mg\/kg|ppm|ppb|μg\/kg|µg\/kg|ug\/kg)[\s\S]{0,50}?(?:MRL|Norm|GW|grens|Grenzwert|limite|Limit)[:\s]*([\d,\.]+)\s*(mg\/kg|ppm|ppb|μg\/kg|µg\/kg|ug\/kg)/gi,
    // Format with detected/limit keywords
    /(?:detected|gemeten|gefunden|found|analysis)[:\s]*([\d,\.]+)\s*(mg\/kg|ppm|ppb|μg\/kg)[\s\S]{0,30}?(?:limit|max|maximum|norm|grens)[:\s]*([\d,\.]+)\s*(mg\/kg|ppm|ppb|μg\/kg)/gi,
    // Simple chemical: value format
    /([a-zA-ZÀ-ÿ\s\-]+)[:\s]+([\d,\.]+)\s*(mg\/kg|ppm|ppb)/gi
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const rawName = match[1].trim();
      if (rawName.length < 3) continue; // Skip too-short matches

      const detectedRaw = parseEuropeanNumber(match[2]);
      const detectedUnit = match[3]?.toLowerCase().trim() || 'mg/kg';
      const limitRaw = match[4] ? parseEuropeanNumber(match[4]) : null;
      const limitUnit = match[5]?.toLowerCase().trim() || detectedUnit;

      const normalized = normalizeChemicalName(rawName);
      const detectedMgKg = convertToMgKg(detectedRaw, detectedUnit);
      const limitMgKg = limitRaw !== null ? convertToMgKg(limitRaw, limitUnit) : null;

      // Look up EU MRL from database
      const mrlRecord = lookupMRL(normalized.name, commodity);
      const euMrl = mrlRecord?.mrl_mg_kg ?? limitMgKg ?? 0.01;
      const isBanned = mrlRecord?.is_banned ?? false;
      const isDefault = mrlRecord?.is_default ?? false;

      chemicals.push({
        name: normalized.name,
        original_name: rawName,
        detected_value_mg_kg: detectedMgKg,
        eu_mrl_mg_kg: euMrl,
        is_banned: isBanned,
        is_default_mrl: isDefault,
        breach_multiplier: euMrl > 0 ? Math.round((detectedMgKg / euMrl) * 100) / 100 : null,
        match_confidence: normalized.confidence
      });
    }
  }

  return chemicals;
}

function parseEuropeanNumber(raw: string): number {
  return parseFloat(raw.replace(',', '.'));
}

function convertToMgKg(value: number, unit: string): number {
  const u = unit.toLowerCase().trim();
  switch (u) {
    case "mg/kg":
    case "ppm":
      return value;
    case "ppb":
    case "μg/kg":
    case "µg/kg":
    case "ug/kg":
      return value / 1000;
    default:
      return value;
  }
}

function normalizeChemicalName(raw: string): {
  name: string;
  confidence: "EXACT" | "ALIAS" | "FUZZY" | "UNKNOWN";
} {
  const cleaned = raw.toLowerCase().trim();

  // Exact match
  if (CHEMICAL_ALIASES[cleaned]) {
    return { name: CHEMICAL_ALIASES[cleaned], confidence: "EXACT" };
  }

  // Partial match
  for (const [alias, standard] of Object.entries(CHEMICAL_ALIASES)) {
    if (cleaned.includes(alias) || alias.includes(cleaned)) {
      return { name: standard, confidence: "ALIAS" };
    }
  }

  // Fuzzy match
  const fuzzy = findFuzzyMatch(cleaned);
  if (fuzzy) {
    return { name: fuzzy, confidence: "FUZZY" };
  }

  // Unknown
  console.warn(`Unknown chemical: "${raw}"`);
  return { name: raw, confidence: "UNKNOWN" };
}

function findFuzzyMatch(input: string): string | null {
  for (const alias of Object.keys(CHEMICAL_ALIASES)) {
    if (levenshteinDistance(input, alias) <= 2) {
      return CHEMICAL_ALIASES[alias];
    }
  }
  return null;
}

function levenshteinDistance(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0)
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[a.length][b.length];
}

function normalizeCommodityName(raw: string): string | null {
  const lower = raw.toLowerCase().trim();
  if (["sesame", "sesame seeds", "sesamzaad", "sesamsamen"].includes(lower)) {
    return "sesame";
  }
  if (["cocoa", "cacao", "cocoa beans", "kakaobohnen", "cacaobonen"].includes(lower)) {
    return "cocoa";
  }
  if (["ginger", "gember", "ingwer"].includes(lower)) {
    return "ginger";
  }
  return null;
}

function detectDocumentsPresent(text: string): string[] {
  const found: string[] = [];
  const lower = text.toLowerCase();

  if (lower.includes("phytosanitary") || lower.includes("fytosanitair") ||
      lower.includes("pflanzengesundheitszeugniss") || lower.includes("phyto")) {
    found.push("phytosanitary_certificate");
  }
  if (lower.includes("certificate of origin") || lower.includes("oorsprongscertificaat") ||
      lower.includes("ursprungszeugnis") || lower.includes("coo")) {
    found.push("certificate_of_origin");
  }
  if (lower.includes("commercial invoice") || lower.includes("handelsfactuur") ||
      lower.includes("handelsrechnung") || lower.includes("invoice")) {
    found.push("commercial_invoice");
  }
  if ((lower.includes("lab") || lower.includes("laboratory") || lower.includes("laboratorium")) &&
      (lower.includes("result") || lower.includes("report") || lower.includes("onderzoek") || lower.includes("befund"))) {
    found.push("lab_test_result_mrl");
  }
  if (lower.includes("health certificate") || lower.includes("gezondheidscertificaat")) {
    found.push("health_certificate");
  }
  if (lower.includes("packing list") || lower.includes("packlist")) {
    found.push("packing_list");
  }

  return found;
}

export default { normalize };
