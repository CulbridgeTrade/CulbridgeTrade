const Tesseract = require('tesseract.js');
const path = require('path');

/**
 * Tesseract OCR for lab reports/certificates
 */
class TesseractOCR {
  static async extractTextFromImage(imagePath, lang = 'eng+spa') {
    try {
      const { data: { text, confidence } } = await Tesseract.recognize(
        imagePath, 
        lang,
        {
          logger: m => console.log(m)
        }
      );
      return { text: text.trim(), confidence };
    } catch (error) {
      console.error('OCR error:', error);
      return { text: '', confidence: 0 };
    }
  }

  static async extractLabData(imagePath) {
    const { text } = await this.extractTextFromImage(imagePath);
    
    // Extract key fields via regex
    const batchMatch = text.match(/BATCH[:\s]*([A-Z0-9\-]+)/i);
    const aflatoxinMatch = text.match(/AFLATOXIN[:\s]*([0-9.]+)\s*(PPB|µG)/i);
    const labNameMatch = text.match(/LAB[:\s]*([A-Z\s&]+)/i);
    
    return {
      batch_number: batchMatch?.[1],
      aflatoxin_ppb: parseFloat(aflatoxinMatch?.[1] || 0),
      lab_name: labNameMatch?.[1],
      raw_text: text
    };
  }

  static async batchProcess(images) {
    const results = [];
    for (const image of images) {
      results.push(await this.extractLabData(image.path));
    }
    return results;
  }
}

module.exports = TesseractOCR;

