const fastify = require('fastify')({ logger: true });
const RuleEngine = require('./engine/ruleEngine');

let storage;
try {
  storage = require('./services/minio');
} catch (e) {
  fastify.log.warn('Minio not available, using local storage');
  storage = { uploadLabReport: async (id, type, data) => ({ path: `./uploads/${id}-${type}` }) };
}

fastify.register(require('@fastify/cors'));
fastify.register(require('@fastify/multipart'));

// Health endpoint
fastify.get('/health', async (request, reply) => {
  return { status: 'OK', timestamp: new Date().toISOString(), minio: !!storage };
});

const engine = new RuleEngine();

// Evaluate
fastify.post('/shipments/:id/evaluate', async (request, reply) => {
  const { id } = request.params;
  const result = await engine.evaluate(id);
  reply.send(result);
});

// Upload lab report
fastify.post('/shipments/:id/documents/lab_report', async (request, reply) => {
  const { id } = request.params;
  const data = await request.file();
  const upload = await storage.uploadLabReport(id, 1, data);
  reply.send(upload);
});

const start = async () => {
  try {
    await fastify.listen({
      port: process.env.PORT || 3002,
      host: "0.0.0.0"
    });

    console.log("Server started successfully");
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

start();

