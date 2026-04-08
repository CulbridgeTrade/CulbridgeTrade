// Engine - The shared function called by both API endpoints
import { parse } from "./pipeline/parse";
import { normalize } from "./pipeline/normalize";
import { validate } from "./pipeline/validate";
import { buildDecision } from "./pipeline/decision";
import { logTelemetry } from "./telemetry";
import { ValidationInput, ValidationResult, TelemetryRecord } from "./types";

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export async function runValidation(
  input: ValidationInput
): Promise<ValidationResult> {
  const start = Date.now();
  const requestId = generateRequestId();

  try {
    // Step 1: Parse
    const parsed = await parse({
      file: input.files?.[0],
      text: input.raw_text,
      mime_type: input.mime_type
    });

    // Step 2: Confidence gate
    // Below 85% OCR confidence triggers a WARNING before any analysis
    if (parsed.confidence < 0.85) {
      const result: ValidationResult = {
        decision: "WARNING",
        reason:
          "Document image is not clear enough to read accurately. " +
          "Key values such as chemical levels or limits may be misread, " +
          "which could produce an incorrect assessment.",
        action: [
          "Upload a clearer photo focusing on the findings section only.",
          "Ensure good lighting with text clearly visible.",
          "The section showing detected levels and EU limits is the priority."
        ],
        confidence: "LOW",
        source: input.source
      };

      await logTelemetry({
        request_id: requestId,
        timestamp: new Date(),
        source: input.source,
        commodity: input.commodity ?? undefined,
        destination: input.destination ?? undefined,
        ocr_confidence: parsed.confidence,
        decision: result.decision,
        top_violation_type: "PARSING_UNCERTAINTY",
        confidence: result.confidence,
        response_time_ms: Date.now() - start
      });

      return result;
    }

    // Step 3: Normalize
    const normalized = await normalize(parsed.text, {
      commodity_hint: input.commodity ?? null,
      destination_hint: input.destination ?? null
    });

    // Step 4: Validate
    const violations = await validate(normalized);

    // Step 5: Build decision
    const result = buildDecision(violations, input.source);

    // Step 6: Log telemetry
    await logTelemetry({
      request_id: requestId,
      timestamp: new Date(),
      source: input.source,
      commodity: normalized.commodity ?? undefined,
      destination: normalized.destination ?? undefined,
      ocr_confidence: parsed.confidence,
      decision: result.decision,
      top_violation_type: violations[0]?.type,
      confidence: result.confidence,
      response_time_ms: Date.now() - start
    });

    return result;

  } catch (error) {
    // Log error telemetry
    await logTelemetry({
      request_id: requestId,
      timestamp: new Date(),
      source: input.source,
      decision: "WARNING",
      confidence: "LOW",
      response_time_ms: Date.now() - start,
      top_violation_type: "PARSING_UNCERTAINTY"
    });

    // Return error as WARNING (fail open, not fail closed for MVP)
    return {
      decision: "WARNING",
      reason: `Unable to complete validation: ${error instanceof Error ? error.message : 'Unknown error'}`,
      action: [
        "Try uploading the document again",
        "If the problem persists, contact support"
      ],
      confidence: "LOW",
      source: input.source
    };
  }
}

export default { runValidation };
