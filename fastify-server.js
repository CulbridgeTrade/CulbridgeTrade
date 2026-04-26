const fastify = require('fastify')({ logger: true });
const RuleEngine = require('./engine/ruleEngine');

const fp = require('@fastify/cors');
const multipart = require('@fastify/multipart');

/* =========================
   🔴 STORAGE (NO SILENT FALLBACK)
========================= */
let storage;

try {
  storage = require('./services/minio');
} catch (err) {
  fastify.log.error('CRITICAL: Minio service missing');
  storage = null; // fail loud instead of pretending
}

/* =========================
   🔴 PLUGINS
========================= */
fastify.register(fp, {
  origin: process.env.CORS_ORIGIN || '*'
});

fastify.register(multipart);

/* =========================
   🔴 RULE ENGINE
========================= */
const engine = new RuleEngine();

/* =========================
   🔴 HEALTH CHECK
========================= */
fastify.get('/health', async () => {
  return {
    status: 'OK',
    timestamp: new Date().toISOString(),
    storage: !!storage
  };
});

/* =========================
   🔒 AUTH MIDDLEWARE (OPTIONAL HOOK)
========================= */
fastify.addHook('preHandler', async (request, reply) => {
  // If you later plug JWT here, enforce it globally or per-route
  request.user = null;
});

/* =========================
   🧠 EVALUATE SHIPMENT
========================= */
fastify.post('/shipments/:id/evaluate', async (request, reply) => {
  try {
    const { id } = request.params;

    if (!id) {
      return reply.code(400).send({ error: 'Missing shipment id' });
    }

    const result = await engine.evaluate(id);

    if (!result) {
      return reply.code(500).send({ error: 'Evaluation failed' });
    }

    return reply.send(result);

  } catch (err) {
    fastify.log.error(err);
    return reply.code(500).send({
      error: 'Internal evaluation error'
    });
  }
});

/* =========================
   📄 UPLOAD LAB REPORT
========================= */
fastify.post(
  '/shipments/:id/documents/lab_report',
  async (request, reply) => {
    try {
      const { id } = request.params;

      if (!storage) {
        return reply.code(500).send({
          error: 'Storage service not configured'
        });
      }

      const file = await request.file();

      if (!file) {
        return reply.code(400).send({
          error: 'No file uploaded'
        });
      }

      const upload = await storage.uploadLabReport(
        id,
        'lab_report',
        file
      );

      return reply.send({
        success: true,
        upload
      });

    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({
        error: 'Upload failed'
      });
    }
  }
);

/* =========================
   🚀 START SERVER
========================= */
const start = async () => {
  try {
    await fastify.listen({
      port: process.env.PORT || 3002,
      host: '0.0.0.0'
    });

    fastify.log.info('Server started successfully');

  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();