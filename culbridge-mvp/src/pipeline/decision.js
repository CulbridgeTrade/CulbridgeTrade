// Decision Module - Map violations to OK/WARNING/BLOCK
export function buildDecision(violations, source) {
  // Check for BLOCK violations first
  const blockViolations = violations.filter(v => v.severity === "BLOCK");
  if (blockViolations.length > 0) {
    return buildBlockResult(blockViolations, source);
  }

  // Check for WARNING violations
  const warningViolations = violations.filter(v => v.severity === "WARNING");
  if (warningViolations.length > 0) {
    return buildWarningResult(warningViolations, source);
  }

  // No violations - OK
  return buildOKResult(source, violations);
}

function buildBlockResult(violations, source) {
  const top = violations[0];
  const actions = buildActions(violations);
  const confidence = calculateOverallConfidence(violations);

  return {
    decision: "BLOCK",
    reason: `BLOCKED: ${top.description}`,
    action: actions,
    confidence,
    source
  };
}

function buildWarningResult(violations, source) {
  const top = violations[0];
  const actions = buildActions(violations);
  const confidence = calculateOverallConfidence(violations);

  return {
    decision: "WARNING",
    reason: `WARNING: ${top.description}`,
    action: actions,
    confidence,
    source
  };
}

function buildOKResult(source, violations) {
  return {
    decision: "OK",
    reason: "No compliance issues detected. Shipment meets EU requirements.",
    action: ["Proceed with export documentation", "Ensure lab certificates are uploaded"],
    confidence: "HIGH",
    source
  };
}

function buildActions(violations) {
  const actions = [];
  const types = violations.map(v => v.type);

  if (types.includes("MRL_BREACH")) {
    actions.push(
      "Stop using the flagged pesticide immediately",
      "Request new lab test from ISO 17025 accredited lab",
      "Do not ship until lab confirms compliance below EU MRL"
    );
  }

  if (types.includes("EU_BANNED_SUBSTANCE")) {
    actions.push(
      "Immediately stop using this substance on all farms",
      "Inform all suppliers in your network",
      "Request lab test specifically for this chemical",
      "Contact Culbridge compliance team for guidance"
    );
  }

  if (types.includes("RASFF_ALERT_MATCH")) {
    actions.push(
      "Check current RASFF portal for active alerts on your commodity",
      "Contact your EU buyer to confirm current import requirements",
      "Consider delaying shipment until alert is resolved"
    );
  }

  if (types.includes("MISSING_REQUIRED_DOCUMENT")) {
    const missing = violations
      .filter(v => v.type === "MISSING_REQUIRED_DOCUMENT")
      .flatMap(v => v.data.missing || []);
    
    for (const doc of missing) {
      if (doc === "phytosanitary_certificate") {
        actions.push("Book phytosanitary inspection with NAQS");
      }
      if (doc === "certificate_of_origin") {
        actions.push("Apply for Certificate of Origin via NEPC portal");
      }
      if (doc === "lab_test_result_mrl") {
        actions.push("Submit sample to EU-accredited lab for MRL testing");
      }
    }
  }

  if (types.includes("UNKNOWN_CHEMICAL_FLAG")) {
    actions.push(
      "Manually verify the chemical name and detected level",
      "Contact lab for clarification if needed",
      "Consult EU pesticides database for that chemical"
    );
  }

  if (actions.length === 0) {
    actions.push("Review detailed violation report for specific actions");
  }

  return actions;
}

function calculateOverallConfidence(violations) {
  const confidences = violations.map(v => v.confidence);
  
  if (confidences.includes("LOW")) return "LOW";
  if (confidences.includes("MEDIUM")) return "MEDIUM";
  
  return "HIGH";
}
