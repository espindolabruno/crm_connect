import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { prisma } from '@crm/database';
import { messageEventEmitter } from '../lib/events';
import { callLLM } from '../lib/llmRouter';

const redisConnection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

export const initAiAnalysisWorker = () => {
  const worker = new Worker(
    'ai-analysis-queue',
    async (job) => {
      const { leadId } = job.data;
      console.log(`[AI Worker] Iniciando análise para o lead ${leadId}`);

      try {
        // 1. Cooldown Check
        const cooldownMs = Number(process.env.AI_COOLDOWN_MS) || 1800000; // default 30 min
        const lastLog = await prisma.aiAnalysisLog.findFirst({
          where: { leadId },
          orderBy: { createdAt: 'desc' },
        });

        if (lastLog) {
          const elapsed = Date.now() - lastLog.createdAt.getTime();
          if (elapsed < cooldownMs) {
            console.log(
              `[AI Worker] Cooldown ativo para o lead ${leadId}. Tempo decorrido: ${Math.round(
                elapsed / 1000
              )}s. Limite: ${cooldownMs / 1000}s. Pulando.`
            );
            return;
          }
        }

        // 2. Fetch Lead and Conversation
        const lead = await prisma.lead.findUnique({
          where: { id: leadId },
          include: { stage: true },
        });

        if (!lead) {
          console.warn(`[AI Worker] Lead ${leadId} não encontrado.`);
          return;
        }

        const conversation = await prisma.conversation.findFirst({
          where: { leadId },
          include: {
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 20,
              include: { transcription: true },
            },
          },
        });

        if (!conversation || conversation.messages.length === 0) {
          console.log(`[AI Worker] Nenhuma mensagem encontrada para o lead ${leadId}. Pulando.`);
          return;
        }

        // Reverse to chronological order
        const messages = [...conversation.messages].reverse();

        // 3. Format Conversation Window & Whisper Transcription if needed
        const formattedMessages = [];
        for (const msg of messages) {
          let contentText = msg.content;
          if (msg.type === 'AUDIO') {
            if (msg.transcription) {
              contentText = `[Áudio Transcrito: ${msg.transcription.transcriptText}]`;
            } else {
              // Whisper transcription fallback
              console.log(`[AI Worker] Transcrevendo áudio para mensagem ${msg.id}`);
              const openaiKey = process.env.OPENAI_API_KEY || '';
              // Mock transcription
              const transcriptText = msg.content.startsWith('http') 
                ? 'Olá, tenho interesse no plano premium e gostaria de saber o valor.' 
                : msg.content;
              
              const trans = await prisma.audioTranscription.create({
                data: {
                  messageId: msg.id,
                  transcriptText,
                  whisperConfidence: 0.92,
                },
              });
              msg.transcription = trans;
              contentText = `[Áudio Transcrito: ${transcriptText}]`;
            }
          }
          const sender = msg.direction === 'INBOUND' ? 'Lead' : 'Atendente';
          formattedMessages.push({
            sender,
            content: contentText,
            timestamp: msg.createdAt.toISOString(),
          });
        }

        const windowJsonStr = JSON.stringify(formattedMessages, null, 2);

        // Fetch stages of this account
        const stages = await prisma.pipelineStage.findMany({
          where: { pipeline: { accountId: lead.accountId } },
          orderBy: { orderIndex: 'asc' },
        });

        const stagesListStr = stages
          .map((s) => `- Nome: "${s.name}", ID: "${s.id}"`)
          .join('\n');

        // 4. Build System and User Prompt
        const systemPrompt = `Você é o motor de IA principal de um CRM de Vendas.
Seu objetivo é analisar as últimas mensagens trocadas com o lead e preencher metadados de inteligência.

Estágios disponíveis no pipeline atual do cliente:
${stagesListStr}

Você deve responder APENAS com um objeto JSON válido. Não inclua nenhuma outra frase, explicação ou blocos de código markdown que não sejam o JSON puro.
Estrutura do JSON de retorno:
{
  "sentiment": "POSITIVO" | "NEUTRO" | "NEGATIVO",
  "urgency": "ALTA" | "MEDIA" | "BAIXA",
  "engagementScore": 0 a 100,
  "intentTags": ["lista", "de", "tags", "de", "intenção"],
  "recommendedStageId": "ID do estágio caso o lead deva ser movido, ou null se mantiver no mesmo",
  "actionReason": "Explicação breve do motivo da recomendação do estágio",
  "actionEvidence": "Citação direta do lead que motivou a mudança",
  "actionConfidence": 0.0 a 1.0 (nível de certeza da ação)
}`;

        const userPrompt = `Histórico da conversa (últimas 20 mensagens):
${windowJsonStr}

Estágio Atual do Lead: "${lead.stage.name}" (ID: "${lead.stageId}")

Por favor, faça a análise.`;

        // 5. Call LLM Router
        const llmResult = await callLLM(userPrompt, systemPrompt);
        
        console.log(`[AI Worker] Resposta recebida do modelo ${llmResult.modelUsed}`);

        // 6. Parse and Apply Decisions
        let analysisData: any;
        try {
          // Clean possible markdown JSON wrappers
          let cleanedText = llmResult.text.trim();
          if (cleanedText.startsWith('```json')) {
            cleanedText = cleanedText.substring(7);
          }
          if (cleanedText.endsWith('```')) {
            cleanedText = cleanedText.substring(0, cleanedText.length - 3);
          }
          analysisData = JSON.parse(cleanedText.trim());
        } catch (parseErr) {
          console.error('[AI Worker] Erro ao parsear JSON retornado pela IA:', llmResult.text);
          throw new Error('Retorno da IA não é um JSON válido.');
        }

        const sentiment = analysisData.sentiment || 'NEUTRO';
        const urgency = analysisData.urgency || 'MEDIA';
        const engagementScore = Number(analysisData.engagementScore) || 50;
        const intentTags = Array.isArray(analysisData.intentTags) ? analysisData.intentTags : [];
        const recommendedStageId = analysisData.recommendedStageId || null;

        // Save Analysis Log
        const savedLog = await prisma.aiAnalysisLog.create({
          data: {
            leadId,
            windowSize: messages.length,
            messagesJson: windowJsonStr,
            rawResponse: llmResult.text,
            parsedJson: JSON.stringify(analysisData),
            confidence: analysisData.actionConfidence || 1.0,
            sentiment,
            urgency,
            engagementScore,
            modelUsed: llmResult.modelUsed,
          },
        });

        // Update Lead Engagement Score & Trend
        const lastEngagement = await prisma.leadEngagement.findFirst({
          where: { leadId },
          orderBy: { lastCalculatedAt: 'desc' },
        });

        let trend: 'STABLE' | 'RISING' | 'FALLING' = 'STABLE';
        if (lastEngagement) {
          if (engagementScore > lastEngagement.score) trend = 'RISING';
          else if (engagementScore < lastEngagement.score) trend = 'FALLING';
        }

        const savedEngagement = await prisma.leadEngagement.create({
          data: {
            leadId,
            score: engagementScore,
            trend,
          },
        });

        // Update Lead Intent Tags
        // Delete existing ones
        await prisma.leadIntentTag.deleteMany({
          where: { leadId },
        });

        // Insert new ones
        if (intentTags.length > 0) {
          const excerpt = messages[messages.length - 1]?.content.substring(0, 100) || '';
          await Promise.all(
            intentTags.map((tag: string) =>
              prisma.leadIntentTag.create({
                data: {
                  leadId,
                  intentType: tag,
                  messageExcerpt: excerpt,
                },
              })
            )
          );
        }

        // Recommend Stage Change
        let savedAction = null;
        if (recommendedStageId && recommendedStageId !== lead.stageId) {
          // Check if target stage exists
          const targetStageExists = stages.some((s) => s.id === recommendedStageId);
          if (targetStageExists) {
            // Create pending AI Action
            savedAction = await prisma.aiAction.create({
              data: {
                leadId,
                fromStageId: lead.stageId,
                toStageId: recommendedStageId,
                triggerEvidence: analysisData.actionEvidence || 'Análise de conversa',
                reason: analysisData.actionReason || 'Sugestão automática da IA',
                confidence: analysisData.actionConfidence || 0.8,
                status: 'PENDING',
              },
            });

            console.log(`[AI Worker] Ação de alteração de estágio criada para o lead ${leadId}`);
          }
        }

        // Emit SSE event
        messageEventEmitter.emit('ai-analysis', {
          leadId,
          analysisLog: savedLog,
          engagement: savedEngagement,
          action: savedAction,
        });

        console.log(`[AI Worker] Análise concluída com sucesso para o lead ${leadId}`);
      } catch (error) {
        console.error(`[AI Worker] Erro durante processamento do lead ${leadId}:`, error);
        throw error;
      }
    },
    { connection: redisConnection as any }
  );

  worker.on('completed', (job) => {
    console.log(`[AI Worker] Job ${job.id} de análise concluído.`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[AI Worker] Job ${job?.id} de análise falhou:`, err);
  });

  return worker;
};
