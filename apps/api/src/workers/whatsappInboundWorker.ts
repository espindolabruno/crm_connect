import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { prisma } from '@crm/database';
import { messageEventEmitter } from '../lib/events';
import { enqueueAiAnalysis } from '../queues/aiAnalysisQueue';


const redisConnection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

function cleanPhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

export const initWhatsappInboundWorker = () => {
  const worker = new Worker(
    'whatsapp-inbound-queue',
    async (job) => {
      const { accountId, fromPhone, profileName, waConversationId, message } = job.data;
      const { waMessageId, content, type, timestamp } = message;

      console.log(`[Worker] Processando mensagem recebida de ${fromPhone} para a conta ${accountId}`);

      try {
        // Find or create lead
        const cleanedFrom = cleanPhone(fromPhone);
        const leads = await prisma.lead.findMany({
          where: { accountId },
        });

        let lead = leads.find((l) => {
          const lp = cleanPhone(l.phone);
          return lp === cleanedFrom || cleanedFrom.endsWith(lp) || lp.endsWith(cleanedFrom);
        });

        if (!lead) {
          // Find first stage in default or any pipeline of the account
          const firstStage = await prisma.pipelineStage.findFirst({
            where: { pipeline: { accountId } },
            orderBy: { orderIndex: 'asc' },
          });

          if (!firstStage) {
            console.error(`[Worker] Nenhum estágio de pipeline encontrado para a conta ${accountId}. Ignorando criação.`);
            return;
          }

          lead = await prisma.lead.create({
            data: {
              accountId,
              stageId: firstStage.id,
              name: profileName || fromPhone,
              phone: fromPhone,
              sourceCampaign: 'WhatsApp Inbound',
            },
          });

          // Log timeline creation
          await prisma.leadTimeline.create({
            data: {
              leadId: lead.id,
              type: 'CREATION',
              description: `Lead criado automaticamente via contato do WhatsApp`,
              actor: 'SYSTEM',
            },
          });
        }

        // Find or create conversation
        let conversation = await prisma.conversation.findFirst({
          where: { leadId: lead.id, accountId },
        });

        if (!conversation) {
          conversation = await prisma.conversation.create({
            data: {
              leadId: lead.id,
              accountId,
              waConversationId: waConversationId || `wa_conv_${lead.id}`,
            },
          });
        }

        // Insert message
        const direction = 'INBOUND';
        const msgType = type === 'image' ? 'IMAGE' : type === 'audio' ? 'AUDIO' : type === 'document' ? 'DOCUMENT' : 'TEXT';

        // Check if message already exists (de-duplication)
        let existingMsg = null;
        if (waMessageId) {
          existingMsg = await prisma.message.findUnique({
            where: { waMessageId },
          });
        }

        if (existingMsg) {
          console.log(`[Worker] Mensagem ${waMessageId} já processada. Ignorando.`);
          return;
        }

        const newMessage = await prisma.message.create({
          data: {
            conversationId: conversation.id,
            direction,
            type: msgType,
            content,
            waMessageId: waMessageId || null,
            status: 'DELIVERED',
            createdAt: timestamp ? new Date(Number(timestamp) * 1000) : new Date(),
          },
        });

        // Update conversation lastMessageAt
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { lastMessageAt: newMessage.createdAt },
        });

        console.log(`[Worker] Mensagem gravada com sucesso para o lead ${lead.id}`);

        // Emit real-time update
        messageEventEmitter.emit('new-message', {
          leadId: lead.id,
          message: {
            ...newMessage,
            createdAt: newMessage.createdAt.toISOString(),
          },
        });

        // Trigger AI Analysis in background (debounced)
        enqueueAiAnalysis(lead.id).catch((err) => {
          console.error('[Worker] Erro ao enfileirar análise de IA:', err);
        });
      } catch (error) {
        console.error('[Worker] Erro ao processar mensagem do WhatsApp:', error);
        throw error;
      }
    },
    { connection: redisConnection as any }
  );

  worker.on('completed', (job) => {
    console.log(`[Worker] Job ${job.id} concluído com sucesso.`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job?.id} falhou:`, err);
  });

  return worker;
};
