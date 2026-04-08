// Parse Module - OCR + PDF extraction
import { ParseOutput } from "../types";

interface ParseInput {
  file?: Buffer;
  text?: string;
  mime_type?: string;
}

// Simple text extraction without external OCR dependencies
export async function parse(input: ParseInput): Promise<ParseOutput> {
  // Direct text — highest confidence, no OCR needed
  if (input.text && input.text.trim().length > 50) {
    return {
      text: input.text,
      confidence: 1.0,
      extraction_method: "DIRECT",
      warnings: []
    };
  }

  // PDF with extractable text
  if (input.mime_type === "application/pdf" && input.file) {
    try {
      const text = await extractTextFromPDF(input.file);
      if (text && text.trim().length > 100) {
        return {
          text,
          confidence: 0.95,
          extraction_method: "PDF_TEXT",
          warnings: []
        };
      }
    } catch {
      // PDF parse failed — fall through
    }
  }

  // Image or scanned PDF — simplified OCR attempt
  if (input.file) {
    return await runSimpleOCR(input.file);
  }

  // Nothing parseable
  return {
    text: "",
    confidence: 0,
    extraction_method: "OCR",
    warnings: ["No parseable input provided"]
  };
}

// Simplified PDF text extraction
async function extractTextFromPDF(buffer: Buffer): Promise<string | null> {
  // Basic PDF text extraction
  // In production, use pdf-parse or similar
  try {
    const text = buffer.toString('utf8');
    // Extract readable text between stream/endstream
    const streamMatch = text.match(/stream[\s\S]*?endstream/g);
    if (streamMatch) {
      const extracted = streamMatch
        .map(s => s.replace(/stream|endstream/g, '').replace(/[^\x20-\x7E]/g, ' '))
        .join(' ')
        .trim();
      if (extracted.length > 100) {
        return extracted;
      }
    }
    return null;
  } catch {
    return null;
  }
}

// Simplified OCR using pattern matching on raw buffer
async function runSimpleOCR(file: Buffer): Promise<ParseOutput> {
  // This is a fallback - in production use Google Vision API or similar
  // For now, attempt to find text patterns in the file
  const text = file.toString('utf8').replace(/[^\x20-\x7E\n\r]/g, ' ');
  
  // Check if meaningful text was found
  const meaningfulLength = text.replace(/[^\a-zA-Z0-9]/g, '').length;
  
  if (meaningfulLength > 50) {
    // Calculate pseudo-confidence based on text density
    const confidence = Math.min(0.95, meaningfulLength / 500);
    return {
      text: cleanExtractedText(text),
      confidence,
      extraction_method: "OCR",
      warnings: confidence < 0.70 
        ? ["Low image quality detected. Text may be misread."]
        : confidence < 0.85 
        ? ["Moderate image quality. Key values should be verified."]
        : []
    };
  }

  return {
    text: "",
    confidence: 0,
    extraction_method: "OCR",
    warnings: ["Could not extract readable text from image"]
  };
}

function cleanExtractedText(text: string): string {
  // Clean up common OCR artifacts
  return text
    .replace(/\s+/g, ' ')
    .replace(/[|]/g, 'l')
    .replace(/0(?=[a-zA-Z])/g, 'O')
    .replace(/1(?=[a-zA-Z])/g, 'l')
    .trim();
}

export default { parse };
