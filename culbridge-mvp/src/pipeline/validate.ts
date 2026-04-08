// Validate Module - Apply rules, return violations
import { NormalizedInput, Violation, ViolationType, ViolationSeverity, Confidence } from "../types";
import { RASFF_ALERTS, checkRASFFMatch } from "../data/rasff-alerts";

export async function validate(input: NormalizedInput): Promise<Violation[]> {
  const violations: Violation[] = [];

  // 1. Check for MRL breaches
  for (const chem of input.chemicals) {
    if (chem.breach_multiplier !== null && chem.breach_multiplier > 1) {
      violations.push({
        type: "MRL_BREACH",
        severity: "BLOCK",
        field: `chemical.${chem.name}`,
        description: `${chem.name} detected at ${chem.detected_value_mg_kg} mg/kg. EU limit is ${chem.eu_mrl_mg_kg} mg/kg. Ratio: ${chem.breach_multiplier}x`,
        confidence: chem.match_confidence === "EXACT" || chem.match_confidence === "ALIAS" ? "HIGH" : "MEDIUM",
        data: {
          chemical: chem.name,
          detected: chem.detected_value_mg_kg,
          limit: chem.eu_mrl_mg_kg,
          multiplier: chem.breach_multiplier,
          commodity: input.commodity
        }
      });
    }

    // 2. Check for EU banned substances
    if (chem.is_banned || chem.name.toLowerCase().includes("endosulfan")) {
      violations.push({
        type: "EU_BANNED_SUBSTANCE",
        severity: "BLOCK",
        field: `chemical.${chem.name}`,
        description: `${chem.name} is banned in the EU. Any detection will result in rejection.`,
        confidence: "HIGH",
        data: {
          chemical: chem.name,
          detected: chem.detected_value_mg_kg,
          commodity: input.commodity
        }
      });
    }

    // 3. Check for default MRL (effectively banned)
    if (chem.is_default_mrl && chem.detected_value_mg_kg > 0.005) {
      violations.push({
        type: "MRL_BREACH",
        severity: "BLOCK",
        field: `chemical.${chem.name}`,
        description: `${chem.name} has no specific EU MRL. Default limit of 0.01 mg/kg applies. Detected: ${chem.detected_value_mg_kg} mg/kg`,
        confidence: "HIGH",
        data: {
          chemical: chem.name,
          detected: chem.detected_value_mg_kg,
          limit: 0.01,
          commodity: input.commodity
        }
      });
    }

    // 4. Check for unknown chemicals (warning only)
    if (chem.match_confidence === "UNKNOWN") {
      violations.push({
        type: "UNKNOWN_CHEMICAL_FLAG",
        severity: "WARNING",
        field: `chemical.${chem.name}`,
        description: `Chemical "${chem.name}" was detected but is not in our validation dictionary. Please verify manually.`,
        confidence: "LOW",
        data: {
          original_name: chem.original_name,
          detected: chem.detected_value_mg_kg
        }
      });
    }
  }

  // 5. Check for RASFF alert matches
  if (input.commodity) {
    for (const chem of input.chemicals) {
      const rasffMatch = checkRASFFMatch(chem.name, input.commodity);
      if (rasffMatch) {
        violations.push({
          type: "RASFF_ALERT_MATCH",
          severity: rasffMatch.severity === "CRITICAL" ? "BLOCK" : "WARNING",
          field: "rasff",
          description: `Active RASFF alert: ${rasffMatch.reference} - ${rasffMatch.description}`,
          confidence: "HIGH",
          data: {
            rasff_reference: rasffMatch.reference,
            commodity: input.commodity,
            chemical: chem.name,
            hazard: rasffMatch.hazard,
            severity: rasffMatch.severity
          }
        });
      }
    }
  }

  // 6. Check for missing required documents
  const requiredDocs = getRequiredDocuments(input.commodity, input.destination);
  const missingDocs = requiredDocs.filter(doc => !input.documents_present.includes(doc));
  
  if (missingDocs.length > 0) {
    violations.push({
      type: "MISSING_REQUIRED_DOCUMENT",
      severity: "WARNING",
      field: "documents",
      description: `Missing required documents for ${input.commodity} → ${input.destination}: ${missingDocs.join(', ')}`,
      confidence: "HIGH",
      data: {
        missing: missingDocs,
        required: requiredDocs,
        present: input.documents_present
      }
    });
  }

  return violations;
}

function getRequiredDocuments(commodity: string | null, destination: string | null): string[] {
  const docs: string[] = ["phytosanitary_certificate"];
  
  if (destination === "NL") {
    docs.push("certificate_of_origin", "commercial_invoice");
  } else if (destination === "DE") {
    docs.push("certificate_of_origin", "commercial_invoice");
  }
  
  if (commodity === "sesame" || commodity === "cocoa" || commodity === "ginger") {
    docs.push("lab_test_result_mrl");
  }
  
  return docs;
}

export default { validate };
