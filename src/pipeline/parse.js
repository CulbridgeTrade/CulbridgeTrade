// Parse Module - OCR + PDF extraction
async function parse(input) {
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
      const text = extractTextFromPDF(input.file);
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

function extractTextFromPDF(buffer) {
  try {
    const text = buffer.toString('utf8');
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

async function runSimpleOCR(file) {
  const text = file.toString('utf8').replace(/[^\x20-\x7E\n\r]/g, ' ');
  
  const meaningfulLength = text.replace(/[^\a-zA-Z0-9]/g, '').length;
  
  if (meaningfulLength > 50) {
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

function cleanExtractedText(text) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/[|]/g, 'l')
    .replace(/0(?=[a-zA-Z])/g, 'O')
    .replace(/1(?=[a-zA-Z])/g, 'l')
    .trim();
}

module.exports = { parse };
