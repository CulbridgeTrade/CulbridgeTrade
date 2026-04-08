// API - Validation endpoints
import { runValidation } from "../engine";
import { ValidationInput, ValidationResult } from "../types";

export async function handleValidate(
  body: ValidationInput
): Promise<ValidationResult> {
  const input: ValidationInput = {
    commodity: body.commodity,
    destination: body.destination,
    raw_text: body.raw_text,
    files: body.files,
    mime_type: body.mime_type,
    source: "normal"
  };

  return await runValidation(input);
}

export async function handleEmergencyCheck(
  body: ValidationInput
): Promise<ValidationResult> {
  const input: ValidationInput = {
    commodity: body.commodity,
    destination: body.destination,
    raw_text: body.raw_text,
    files: body.files,
    mime_type: body.mime_type,
    source: "emergency"
  };

  return await runValidation(input);
}

export default { handleValidate, handleEmergencyCheck };
