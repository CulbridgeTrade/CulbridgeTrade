// API Layer - Thin wrappers per directive
const fastify = require('fastify')({ logger: true });
const jwt = require('jsonwebtoken');
const DCEE = require('../engine/dcee-evaluator');

// Middleware - JWT + Role validation
fastify.addHook('preHandler', async (request, reply) => {
  const token = request.headers.authorization?.replace('Bearer ', '');
  if (!token) return reply.code(401).send({ error: 'Missing token' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    request.user = decoded;
  } catch (e) {
    return reply.code(401).send({ error: 'Invalid token' });
  }
});

// Role check
async function checkRole(request, requiredRole) {
  if (request.user.role !== requiredRole) {
    throw new Error('Insufficient permissions');
  }
}

// POST /v1/shipments/init
fastify.post('/v1/shipments/init', async (request) => {
  await checkRole(request, 'exporter');
  const dcee = new DCEE();
  const output = dcee.evaluate(request.body);
  return { ...output, rule_version: 'v1.1', generated_at: new Date().toISOString() };
});

// POST /v1/shipments/:id/compliance-check
fastify.post('/v1/shipments/:id/compliance-check', async (request) => {
  await checkRole(request, 'exporter');
  const dcee = new DCEE();
  const output = dcee.evaluate({ ...request.body, shipment_id: request.params.id });
  return output;
});

// Admin endpoints
fastify.post('/v1/admin/shipments/:id/block', async (request) => {
  await checkRole(request, 'compliance_officer');
  // Block logic
});

// ... other endpoints stubbed
fastify.get('/v1/requirements', async (request) => {
  const { commodity, destination } = request.query;
  // Stub
});

// Websocket stubs
fastify.register(require('fastify-websocket'), { errorHandler });
fastify.register(async function (fastify) {
  fastify.get('/v1/ws/shipments', { websocket: true }, (connection) => {
    // Stub
  });
}, { prefix: '/v1' });

// Health
fastify.get('/v1/admin/health', async () => ({ status: 'healthy' }));

fastify.listen({ port: process.env.PORT || 3000, host: "0.0.0.0" });

