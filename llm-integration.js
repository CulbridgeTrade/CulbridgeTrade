

const ajv = new Ajv();

const DOCUMENT_EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    document_id: { type: 'string' },
    fields: { type: 'object' },
    status: { type: 'string', enum: ['VALID', 'INVALID'] },
    confidence: { type: 'number', minimum: 0, maximum: 100 }
  },
  required: ['document_id', 'fields', 'status', 'confidence'],
  additionalProperties: false
};

const documentValidator = ajv.compile(DOCUMENT_EXTRACTION_SCHEMA);

// LLM Services per spec
class LLMServices {
  static async documentExtraction(documentType, rawContent) {
    const prompt = `Extract structured fields from this ${documentType} document. Output ONLY valid JSON matching this schema:

{
  "document_id": "unique-id",
  "fields": {
    "certificate_of_origin": "string|null",
    "batch_number": "string|null",
    "expiry_date": "string|null",
    "product_name": "string|null",
    "product_category": "string|null",
    "hs_code": "string|null",
    "quantity": "number|null",
    "exporter_name": "string|null",
    "lab_name": "string|null",
    "lab_report_date": "string|null",
    "phytosanitary_cert": "string|null"
  },
  "status": "VALID|INVALID",
  "confidence": number(0-100)
}

Content: ${rawContent.substring(0, 4000)}`;

    try {
      const response = await ollama.generate({
        model: 'qwen2.5:7b-instruct-q4_K_M',
        prompt,
        format: 'json',
        stream: false,
        options: { temperature: 0.1 }
      });

      const parsed = JSON.parse(response.response);
      
      if (!documentValidator(parsed)) {
        throw new Error(`Schema validation failed: ${ajv.errorsText(documentValidator.errors)}`);
      }

      return parsed;
    } catch (error) {
      console.error('Document extraction failed:', error);
      return null;
    }
  }

  static async conflictAnalysis(extractedDocuments) {
    const prompt = `Analyze these extracted documents for conflicts. Return ONLY JSON:

{
  "conflicts_found": true|false,
  "conflict_list": ["string"],
  "document_ids_affected": ["string"]
}`;

    try {
      const response = await ollama.generate({
        model: 'deepseek-coder:6.7b-instruct-q5_K_M',
        prompt,
        format: 'json',
        stream: false,
        options: { temperature: 0.1 }
      });

      return JSON.parse(response.response);
    } catch (error) {
      console.error('Conflict analysis failed:', error);
      return { conflicts_found: false, conflict_list: [], document_ids_affected: [] };
    }
  }

  static async userExplanation(shipmentId, evaluationSnapshot) {
    const prompt = `Explain this shipment evaluation to the exporter in simple terms. Reference specific rules triggered. Output ONLY JSON:

{
  "explanation_text": "string",
  "highlighted_rules": ["string"],
  "recommendations": ["string"]
}`;

    try {
      const response = await ollama.generate({
        model: 'llama3.1:8b',
        prompt,
        format: 'json',
        stream: false
      });

      return JSON.parse(response.response);
    } catch (error) {
      console.error('Explanation failed:', error);
      return { explanation_text: 'Evaluation complete. Check dashboard for details.', highlighted_rules: [], recommendations: [] };
    }
  }
}

module.exports = LLMServices;

// Usage in server.js or API routes:
// const llms = require('./llm-integration');
// const extracted = await llms.documentExtraction('COO', documentText);
// if (extracted) {
//   // Feed to RuleEngine
// }

