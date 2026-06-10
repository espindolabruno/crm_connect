import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const redisConnection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

export const aiAnalysisQueue = new Queue('ai-analysis-queue', {
  connection: redisConnection as any,
});

export async function enqueueAiAnalysis(leadId: string) {
  const jobId = `ai-lead-${leadId}`;
  const delay = Number(process.env.AI_DEBOUNCE_MS) || 8000;
  
  try {
    const oldJob = await aiAnalysisQueue.getJob(jobId);
    if (oldJob) {
      const state = await oldJob.getState();
      if (state === 'delayed' || state === 'waiting') {
        await oldJob.remove();
        console.log(`[Queue] Removido job de análise anterior ${jobId} para debounce.`);
      }
    }
  } catch (err) {
    console.warn(`[Queue] Erro ao buscar/remover job anterior ${jobId}:`, err);
  }

  await aiAnalysisQueue.add(
    'analyze',
    { leadId },
    { jobId, delay, removeOnComplete: true, removeOnFail: false }
  );
  console.log(`[Queue] Enfileirado job ${jobId} com debounce de ${delay}ms.`);
}

