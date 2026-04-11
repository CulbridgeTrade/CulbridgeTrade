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
const orchestration = require('./services/application-orchestration');
const labNetwork = require('./services/lab-network');
const rasffMonitor = require('./services/rasff-monitor');
const riskScoring = require('./services/risk-scoring');
const regulatoryIntelligence = require('./services/regulatory-intelligence');
const agencyIntegration = require('./services/agency-integration');
const path = require('path');

const { PDFGeneratorService } = require('./services/pdf-generator');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use(limiter);
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS || 'https://localhost:3000'
}));
app.use('/api', require('./middleware/auth').verifyToken);
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static('public'));

initDB();

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Culbridge Rule Engine running on http://localhost:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
});

module.exports = app;
