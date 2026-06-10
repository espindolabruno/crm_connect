import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const redisConnection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

export const whatsappInboundQueue = new Queue('whatsapp-inbound-queue', {
  connection: redisConnection as any,
});
