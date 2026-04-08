/**
 * Observability Module - Prometheus Metrics & Alerts
 * Tracks queue depth, API latency, worker failures, and external API retries
 * Triggers alerts when thresholds exceeded
 */

const client = require('prom-client');

// Create registry
const register = new client.Registry();
client.collectDefaultMetrics({ register });

// =============================================
// CUSTOM METRICS
// =============================================

// HTTP Request Duration
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5, 10]
});

// HTTP Request Count
const httpRequestCount = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

// Queue Metrics
const queueDepth = new client.Gauge({
  name: 'queue_depth',
  help: 'Number of items waiting in queue',
  labelNames: ['queue_name']
});

const queueProcessing = new client.Gauge({
  name: 'queue_processing',
  help: 'Number of items currently being processed',
  labelNames: ['queue_name']
});

const queueFailed = new client.Counter({
  name: 'queue_failed_total',
  help: 'Total number of failed queue jobs',
  labelNames: ['queue_name', 'job_type']
});

// Module Execution Metrics
const moduleExecutionDuration = new client.Histogram({
  name: 'module_execution_duration_seconds',
  help: 'Duration of module executions',
  labelNames: ['module', 'status'],
  buckets: [0.1, 0.5, 1, 2, 5, 10]
});

const moduleExecutionCount = new client.Counter({
  name: 'module_executions_total',
  help: 'Total number of module executions',
  labelNames: ['module', 'status']
});

// External API Metrics
const externalAPIDuration = new client.Histogram({
  name: 'external_api_duration_seconds',
  help: 'Duration of external API calls',
  labelNames: ['api', 'endpoint', 'status'],
  buckets: [0.5, 1, 2, 5, 10, 30]
});

const externalAPIRetries = new client.Counter({
  name: 'external_api_retries_total',
  help: 'Total number of external API retries',
  labelNames: ['api', 'endpoint']
});

// Database Metrics
const dbQueryDuration = new client.Histogram({
  name: 'db_query_duration_seconds',
  help: 'Duration of database queries',
  labelNames: ['operation', 'table'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1]
});

// Rate Limit Metrics
const rateLimitExceeded = new client.Counter({
  name: 'rate_limit_exceeded_total',
  help: 'Total number of rate limit exceeded events',
  labelNames: ['identifier', 'endpoint']
});

// Shipment Metrics
const shipmentsProcessed = new client.Counter({
  name: 'shipments_processed_total',
  help: 'Total number of shipments processed',
  labelNames: ['status', 'destination']
});

const shipmentProcessingDuration = new client.Histogram({
  name: 'shipment_processing_duration_seconds',
  help: 'Duration of shipment processing',
  labelNames: ['status'],
  buckets: [1, 5, 10, 30, 60, 300]
});

// Register all metrics
register.registerMetric(httpRequestDuration);
register.registerMetric(httpRequestCount);
register.registerMetric(queueDepth);
register.registerMetric(queueProcessing);
register.registerMetric(queueFailed);
register.registerMetric(moduleExecutionDuration);
register.registerMetric(moduleExecutionCount);
register.registerMetric(externalAPIDuration);
register.registerMetric(externalAPIRetries);
register.registerMetric(dbQueryDuration);
register.registerMetric(rateLimitExceeded);
register.registerMetric(shipmentsProcessed);
register.registerMetric(shipmentProcessingDuration);

// =============================================
// ALERT THRESHOLDS
// =============================================

const ALERT_THRESHOLDS = {
  queueDepth: {
    warning: 500,
    critical: 1000
  },
  apiLatency: {
    warning: 2000, // 2 seconds
    critical: 5000 // 5 seconds
  },
  errorRate: {
    warning: 0.05, // 5%
    critical: 0.1 // 10%
  },
  retryRate: {
    warning: 0.1, // 10%
    critical: 0.2 // 20%
  }
};

// =============================================
// METRICS MIDDLEWARE
// =============================================

/**
 * Express middleware to track HTTP metrics
 */
function metricsMiddleware(req, res, next) {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route?.path || req.path;
    
    httpRequestDuration.labels(req.method, route, res.statusCode).observe(duration);
    httpRequestCount.labels(req.method, route, res.statusCode).inc();
    
    // Check latency thresholds
    if (duration * 1000 > ALERT_THRESHOLDS.apiLatency.critical) {
      console.warn(`[ALERT] High latency detected: ${req.method} ${route} - ${duration}s`);
    }
  });
  
  next();
}

/**
 * Track queue metrics
 */
async function updateQueueMetrics(queueName, waiting, active, failed) {
  queueDepth.set({ queue_name: queueName }, waiting);
  queueProcessing.set({ queue_name: queueName }, active);
  
  if (failed > 0) {
    queueFailed.inc({ queue_name: queueName, job_type: 'all' });
  }
}

/**
 * Track module execution
 */
function trackModuleExecution(moduleName, duration, status) {
  moduleExecutionDuration.labels(module, status).observe(duration);
  moduleExecutionCount.inc({ module: moduleName, status: status });
  
  if (status === 'failed') {
    console.warn(`[ALERT] Module ${moduleName} failed after ${duration}s`);
  }
}

/**
 * Track external API call
 */
function trackExternalAPI(apiName, endpoint, duration, status, isRetry = false) {
  externalAPIDuration.labels(apiName, endpoint, status).observe(duration);
  
  if (isRetry) {
    externalAPIRetries.inc({ api: apiName, endpoint: endpoint });
    
    console.warn(`[ALERT] Retry detected: ${apiName} ${endpoint} after ${duration}s`);
  }
}

// =============================================
// ALERT SYSTEM
// =============================================

/**
 * Check all alert conditions and trigger notifications
 */
async function checkAlerts() {
  const alerts = [];
  
  // Check queue depths
  const queueStats = await getQueueStats();
  for (const [queue, stats] of Object.entries(queueStats)) {
    if (stats.waiting > ALERT_THRESHOLDS.queueDepth.critical) {
      alerts.push({
        type: 'CRITICAL',
        source: 'queue',
        message: `Queue ${queue} depth critical: ${stats.waiting} items`,
        timestamp: new Date().toISOString()
      });
    } else if (stats.waiting > ALERT_THRESHOLDS.queueDepth.warning) {
      alerts.push({
        type: 'WARNING',
        source: 'queue',
        message: `Queue ${queue} depth warning: ${stats.waiting} items`,
        timestamp: new Date().toISOString()
      });
    }
  }
  
  // Emit alerts
  for (const alert of alerts) {
    await triggerAlert(alert);
  }
  
  return alerts;
}

/**
 * Trigger alert notification (Slack, email, etc.)
 */
async function triggerAlert(alert) {
  console.log(`[ALERT] ${alert.type}: ${alert.message}`);
  
  // In production, integrate with:
  // - Slack webhooks
  // - Email (SendGrid, SES)
  // - PagerDuty
  // - Custom alert system
  
  // Store alert in database for audit
  try {
    await storeAlert(alert);
  } catch (error) {
    console.error('Failed to store alert:', error.message);
  }
}

/**
 * Store alert in database
 */
async function storeAlert(alert) {
  const { run } = require('./utils/db');
  // Note: This would need a corresponding alerts table
  // Placeholder for now
  console.log(`[ALERT-STORE] ${alert.type}: ${alert.message}`);
}

/**
 * Get current metrics snapshot
 */
async function getMetricsSnapshot() {
  const metrics = await register.getMetricsAsJSON();
  
  return {
    http: {
      requests_total: metrics.find(m => m.name === 'http_requests_total')?.values?.length || 0,
      avg_duration: calculateAverage(metrics, 'http_request_duration_seconds')
    },
    queues: {
      total_depth: sumAllGauges(metrics, 'queue_depth'),
      total_failed: sumAllCounters(metrics, 'queue_failed_total')
    },
    modules: {
      total_executions: sumAllCounters(metrics, 'module_executions_total'),
      failed: countByLabel(metrics, 'module_executions_total', 'status', 'failed')
    },
    external_apis: {
      total_retries: sumAllCounters(metrics, 'external_api_retries_total'),
      avg_duration: calculateAverage(metrics, 'external_api_duration_seconds')
    },
    timestamp: new Date().toISOString()
  };
}

// Helper functions
function calculateAverage(metrics, name) {
  const metric = metrics.find(m => m.name === name);
  if (!metric || !metric.values || metric.values.length === 0) return 0;
  
  const sum = metric.values.reduce((acc, v) => acc + v.value, 0);
  return (sum / metric.values.length).toFixed(3);
}

function sumAllGauges(metrics, name) {
  const metric = metrics.find(m => m.name === name);
  if (!metric || !metric.values) return 0;
  return metric.values.reduce((acc, v) => acc + v.value, 0);
}

function sumAllCounters(metrics, name) {
  const metric = metrics.find(m => m.name === name);
  if (!metric || !metric.values) return 0;
  return metric.values.reduce((acc, v) => acc + v.value, 0);
}

function countByLabel(metrics, name, labelKey, labelValue) {
  const metric = metrics.find(m => m.name === name);
  if (!metric || !metric.values) return 0;
  return metric.values.filter(v => v.labels[labelKey] === labelValue).reduce((acc, v) => acc + v.value, 0);
}

// Prometheus endpoint
function metricsEndpoint(req, res) {
  res.set('Content-Type', register.contentType);
  res.end(register.metrics());
}

// Run alert check every minute
setInterval(checkAlerts, 60000);

module.exports = {
  register,
  metricsMiddleware,
  updateQueueMetrics,
  trackModuleExecution,
  trackExternalAPI,
  checkAlerts,
  triggerAlert,
  getMetricsSnapshot,
  metricsEndpoint,
  ALERT_THRESHOLDS
};