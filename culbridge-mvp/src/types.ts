// MVP Types - Everything derives from these
export type Decision = "OK" | "WARNING" | "BLOCK";
export type Confidence = "LOW" | "MEDIUM" | "HIGH";
export type Source = "normal" | "emergency";

export interface ValidationResult {
  decision: Decision;
  reason: string;
  action: string[];
  confidence: Confidence;
  source: Source;
}

export type ViolationSeverity = "BLOCK" | "WARNING";

export type ViolationType =
  | "MRL_BREACH"
  | "EU_BANNED_SUBSTANCE"
  | "MYCOTOXIN_BREACH"
  | "MISSING_REQUIRED_DOCUMENT"
  | "UNKNOWN_CHEMICAL_FLAG"
  | "RASFF_ALERT_MATCH"
  | "PARSING_UNCERTAINTY";

export interface Violation {
  type: ViolationType;
  severity: ViolationSeverity;
  field: string;
  description: string;
  confidence: Confidence;
  data: Record<string, unknown>;
}

export interface ParseOutput {
  text: string;
  confidence: number;
  extraction_method: "OCR" | "PDF_TEXT" | "DIRECT";
  warnings: string[];
}

export interface NormalizedChemical {
  name: string;
  original_name: string;
  detected_value_mg_kg: number | null;
  eu_mrl_mg_kg: number | null;
  is_banned: boolean;
  is_default_mrl: boolean;
  breach_multiplier: number | null;
  match_confidence: "EXACT" | "ALIAS" | "FUZZY" | "UNKNOWN";
}

export interface NormalizedInput {
  commodity: string | null;
  destination: string | null;
  chemicals: NormalizedChemical[];
  documents_present: string[];
  authority: "NVWA" | "BVL" | "UNKNOWN";
}

export interface ValidationInput {
  commodity?: string | null;
  destination?: string | null;
  raw_text?: string;
  files?: Buffer[];
  mime_type?: string;
  source: Source;
}

export interface TelemetryRecord {
  request_id: string;
  timestamp: Date;
  source: Source;
  commodity?: string;
  destination?: string;
  ocr_confidence?: number;
  decision: Decision;
  top_violation_type?: ViolationType;
  confidence: Confidence;
  response_time_ms: number;
}
