// Culbridge MVP Server
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { runValidation } from './src/engine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// POST /api/v1/validate - Structured input
app.post('/api/v1/validate', async (req, res) => {
  try {
    const { commodity, destination, raw_text, mime_type } = req.body;

    const input = {
      commodity: commodity ?? null,
      destination: destination ?? null,
      raw_text: raw_text ?? undefined,
      mime_type: mime_type ?? undefined,
      source: 'normal'
    };

    const result = await runValidation(input);
    res.json(result);
  } catch (error) {
    console.error('Validation error:', error);
    res.status(500).json({
      decision: 'WARNING',
      reason: 'Validation service temporarily unavailable',
      action: ['Try again later', 'Contact support if problem persists'],
      confidence: 'LOW',
      source: 'normal'
    });
  }
});

// POST /api/v1/emergency-check - Messy file input
app.post('/api/v1/emergency-check', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        decision: 'WARNING',
        reason: 'No document received',
        action: ['Send a photo or PDF of the relevant document'],
        confidence: 'LOW',
        source: 'emergency'
      });
    }

    const input = {
      commodity: req.body.commodity ?? null,
      destination: req.body.destination ?? null,
      files: [req.file.buffer],
      mime_type: req.file.mimetype,
      source: 'emergency'
    };

    const result = await runValidation(input);
    res.json(result);
  } catch (error) {
    console.error('Emergency check error:', error);
    res.status(500).json({
      decision: 'WARNING',
      reason: 'Validation service temporarily unavailable',
      action: ['Try again later', 'Contact support if problem persists'],
      confidence: 'LOW',
      source: 'emergency'
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   CULBRIDGE MVP - Deterministic Validation Engine         ║
║                                                           ║
║   Server running on http://localhost:${PORT}                 ║
║                                                           ║
║   Endpoints:                                              ║
║   POST /api/v1/validate        → Pre-shipment check      ║
║   POST /api/v1/emergency-check → Crisis entry            ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

export default app;
