const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const RuleEngine = require('./engine/ruleEngine');
const { initDB } = require('./utils/db');
const traceability = require('./utils/traceability');
const farmosIntegration = require('./utils/farmos-integration');
const hyperledgerIntegration = require('./utils/hyperledger-integration');
const odooWmsIntegration = require('./utils/odoo-wms-integration');
const opentmsIntegration = require('./utils/opentms-integration');
const openlmisIntegration = require('./utils/openlmis-integration');
const xgboostIntegration = require('./utils/xgboost-integration');
const decisionEngine = require('./utils/decision-engine');
const deterministicEngine = require('./engine/deterministic-engine');
const access2Markets = require('./services/access2markets');
const tracesParser = require('./services/traces-parser');
const rasffService = require('./services/rasff-ingestion');
const rasffScraper = require('./services/rasff-scraper');
const dovuIntegration = require('./services/dovu-integration');
const ushahidiIntegration = require('./services/ushahidi-integration');
const eudrCompliance = require('./services/eudr-compliance');
const accuracyMonitor = require('./services/accuracy-monitor');
const fixOptimizer = require('./services/fix-optimizer');
const humanLayer = require('./services/human-layer');
const adversarialDetector = require('./services/adversarial-detector');
const nvwaSimulator = require('./engine/nvwa-simulator');
// const orchestration = require('./services/application-orchestration');\nconst labNetwork = require('./services/lab-network');
const rasffMonitor = require('./services/rasff-monitor');
const riskScoring = require('./services/risk-scoring');
const regulatoryIntelligence = require('./services/regulatory-intelligence');
const agencyIntegration = require('./services/agency-integration');
const path = require('path');

const { PDFGeneratorService } = require('./services/pdf-generator');

console.log("Booting Culbridge...");
console.log("NODE_ENV:", process.env.NODE_ENV || 'undefined');
console.log("PORT:", process.env.PORT || 10000);

function assert(condition, message) {
  if (!condition) {
    console.error("BOOT FAILURE:", message);
    process.exit(1);
  }
}

// Validate env
if (!process.env.DATABASE_URL) {
  console.warn("⚠️  DATABASE_URL missing - using SQLite fallback");
}
if (!process.env.PORT) {
  console.warn("⚠️  PORT missing - using 10000");
}

// Validate critical modules
try {
  require('./utils/traceability');
  console.log("✅ traceability module OK");
} catch (err) {
  console.error("BOOT FAILURE: traceability module failed", err.message);
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 10000;

// Environment validation
const requiredEnv = ['DATABASE_URL'];
// Skip strict env check for local testing - prod only
console.log('⚠️  Running with fallback env - set DATABASE_URL for prod');

app.use(helmet());
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use(limiter);
const allowedOrigins = [
  "https://culbridge.cloud",
  "https://www.culbridge.cloud",
  "https://culbridge-trade.vercel.app",
  "https://*.vercel.app"
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("CORS blocked: " + origin));
  }
}));
app.use('/api/v1/health', (req, res, next) => next());
app.use('/api/v1/rules', (req, res, next) => next());
app.use('/api/v1/requirements', (req, res, next) => next());
app.use('/api/v1/labs', (req, res, next) => next());
app.use('/api', require('./middleware/auth').verifyToken);
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static('public'));

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// initDB will be called after listen

// Health check moved under /api/v1 per contract
app.get('/api/v1/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

app.get('/', (req, res) => {
  res.json({ status: 'Culbridge API running', health: 'ok', timestamp: Date.now(), port: PORT });
});

// API v1 Routes
app.use('/api/v1', require('./routes/api'));

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`SERVER READY on port ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
  
  try {
    await initDB();
    console.log('✅ Database initialized successfully');
  } catch (error) {
    console.error('❌ Database init failed:', error.message);
    console.log('Server running but DB unavailable - some features limited');
  }
});

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION:', err);
  process.exit(1);
});

module.exports = app;
