/**
 * PaddleOCR - High accuracy multilingual OCR
 * Note: PaddleOCR requires Python/PaddlePaddle - Node wrapper
 */
const { PaddleOCR } = require('paddleocr');

class PaddleOCRIntegration {
  constructor() {
    this.ocr = new PaddleOCR({
      lang: 'en' // english+multi-language
    });
  }

  async extractText(imagePath) {
    try {
      const result = await this.ocr.ocr(imagePath, {
        showLog: true,
        useAngleCls: true
      });
      
      const text = result.map(line => line.text).join('\n');
      const avgConfidence = result.reduce((sum, line) => sum + line.confidence, 0) / result.length || 0;
      
      return {
        text: text.trim(),
        confidence: avgConfidence,
        lines: result
      };
    } catch (error) {
      console.error('PaddleOCR error:', error);
      return { text: '', confidence: 0, lines: [] };
    }
  }

  async extractLabMetrics(imagePath) {
    const { text } = await this.extractText(imagePath);
    
    // Advanced regex for lab data
    const metrics = {
      batch: text.match(/BATCH[:\s]*([A-Z0-9\-]+)/i)?.[1],
      aflatoxin: parseFloat(text.match(/AFLATOXIN[:\s]*([0-9.]+)\s*(PPB|µG)/i)?.[1] || 0),
      ochratoxin: parseFloat(text.match(/OCHRATOXIN[:\s]*([0-9.]+)/i)?.[1] || 0),
      pesticide: text.match(/PESTICIDE[:\s]*([A-Z0-9\s]+)/i)?.[1],
      lab: text.match(/LABORATORY[:\s]*([A-Z&\s]+)/i)?.[1],
      date: text.match(/DATE[:\s]*([0-9\/\-]+)/i)?.[1],
      raw_text: text
    };
    
    return metrics;
  }

  async compareWithTesseract(imagePath) {
    // Dual OCR for accuracy
    const paddle = await this.extractLabMetrics(imagePath);
    const tesseract = require('./tesseract-ocr').TesseractOCR.extractLabData(imagePath);
    
    return { paddle, tesseract };
  }
}

module.exports = PaddleOCRIntegration;

