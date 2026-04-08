const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

/**
 * OCRmyPDF integration - PDF to searchable PDF + text extraction
 */
class OCRmyPDF {
  static async ocrPDF(inputPDF, outputPDF = 'ocr-output.pdf', lang = 'eng+spa') {
    try {
      const command = `ocrmypdf --deskew --rotate-pages --force-ocr --sidecar "${inputPDF}" "${outputPDF}" -l ${lang}`;
      const { stdout, stderr } = await execAsync(command);
      
      if (stderr) console.warn('OCRmyPDF warnings:', stderr);
      
      // Extract text from output PDF
      const textCommand = `pdftotext "${outputPDF}" -`;
      const { stdout: text } = await execAsync(textCommand);
      
      return {
        success: true,
        outputPDF,
        extractedText: text.trim(),
        warnings: stderr ? stderr.split('\n') : []
      };
    } catch (error) {
      console.error('OCRmyPDF error:', error.message);
      return { success: false, error: error.message };
    }
  }

  static async batchOCR(pdfs) {
    const results = [];
    for (const pdf of pdfs) {
      const result = await this.ocrPDF(pdf.input, pdf.output);
      results.push({ filename: pdf.input, ...result });
    }
    return results;
  }

  // Extract structured lab data from OCR text
  static extractLabData(text) {
    const metrics = {
      batch: text.match(/BATCH[:\s]*([A-Z0-9\-]+)/i)?.[1],
      aflatoxin: parseFloat(text.match(/AFLATOXIN[:\s]*([0-9.]+)\s*(PPB|µG)/i)?.[1] || 0),
      lab: text.match(/LABORATORY[:\s]*([A-Z&\s]+)/i)?.[1],
      date: text.match(/DATE[:\s]*([0-9\/\-]+)/i)?.[1],
      confidence: text.match(/confidence[:\s]*([0-9.]+)/i)?.[1] || 'unknown'
    };
    return metrics;
  }
}

module.exports = OCRmyPDF;

