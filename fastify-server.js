const fastify = require('fastify')({ logger: true });
const RuleEngine = require('./engine/ruleEngine');
const MinioStorage = require('./services/minio');

fastify.register(require('@fastify/cors'));
fastify.register(require('@fastify/multipart'));

const engine = new RuleEngine();
const storage = new MinioStorage();

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
    await fastify.listen({ port: 3002 });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};
start();

