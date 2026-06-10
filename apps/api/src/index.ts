import fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import dotenv from 'dotenv';
import { authRoutes } from './routes/auth';
import { pipelineRoutes } from './routes/pipelines';
import { leadRoutes } from './routes/leads';
import { webhookRoutes } from './routes/webhook';
import { aiConfigRoutes } from './routes/aiConfig';
import { initWhatsappInboundWorker } from './workers/whatsappInboundWorker';
import { initAiAnalysisWorker } from './workers/aiAnalysisWorker';


dotenv.config();

const server = fastify({ logger: true });

// Register CORS
server.register(cors, {
  origin: '*', // Adjust for production
});

// Register JWT
server.register(jwt, {
  secret: process.env.JWT_SECRET || 'crm-super-secret-key-change-in-production',
});

// Decorate request with authenticate helper
server.decorate('authenticate', async (request: any, reply: any) => {
  try {
    if (request.query && request.query.token) {
      request.headers.authorization = `Bearer ${request.query.token}`;
    }
    await request.jwtVerify();
  } catch (err) {
    reply.send(err);
  }
});

// Register Routes
server.register(authRoutes, { prefix: '/api/auth' });
server.register(pipelineRoutes, { prefix: '/api/pipelines' });
server.register(leadRoutes, { prefix: '/api/leads' });
server.register(webhookRoutes, { prefix: '/api/webhooks' });
server.register(aiConfigRoutes, { prefix: '/api/ai-config' });

// Health check
server.get('/health', async () => {
  return { status: 'healthy', timestamp: new Date().toISOString() };
});

const PORT = Number(process.env.PORT) || 4000;
const HOST = process.env.HOST || '0.0.0.0';

const start = async () => {
  try {
    // Initialize BullMQ worker for incoming WhatsApp messages
    initWhatsappInboundWorker();
    console.log('BullMQ Inbound WhatsApp Worker initialized.');

    // Initialize BullMQ worker for AI analysis
    initAiAnalysisWorker();
    console.log('BullMQ AI Analysis Worker initialized.');

    await server.listen({ port: PORT, host: HOST });
    console.log(`Server running at http://${HOST}:${PORT}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
