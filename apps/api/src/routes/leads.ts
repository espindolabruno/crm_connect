import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { prisma } from '@crm/database';
import { AuthUser } from '@crm/types';
import { messageEventEmitter } from '../lib/events';
import { enqueueAiAnalysis } from '../queues/aiAnalysisQueue';


export const leadRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Enforce authentication
  fastify.addHook('preValidation', (fastify as any).authenticate);

  // List all leads with optional filters
  fastify.get('/', async (request: any, reply) => {
    const user = request.user as AuthUser;
    const { stageId } = request.query as any;

    try {
      const leads = await prisma.lead.findMany({
        where: {
          accountId: user.accountId,
          stageId: stageId || undefined,
        },
        include: {
          tags: true,
          stage: true,
          engagement: {
            orderBy: { lastCalculatedAt: 'desc' },
            take: 1
          },
          aiActions: {
            where: { status: 'PENDING' }
          }
        },
        orderBy: { updatedAt: 'desc' },
      });
      return leads;
    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Erro ao listar leads.' });
    }
  });

  // Get specific lead details
  fastify.get('/:id', async (request: any, reply) => {
    const user = request.user as AuthUser;
    const { id } = request.params as any;

    try {
      const lead = await prisma.lead.findFirst({
        where: { id, accountId: user.accountId },
        include: {
          tags: true,
          stage: true,
          timeline: {
            orderBy: { createdAt: 'desc' },
          },
          conversations: {
            include: {
              messages: {
                orderBy: { createdAt: 'asc' },
              },
            },
          },
        },
      });

      if (!lead) {
        return reply.status(404).send({ error: 'Lead não encontrado.' });
      }

      return lead;
    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Erro ao buscar lead.' });
    }
  });

  // Create a lead manually
  fastify.post('/', async (request: any, reply) => {
    const user = request.user as AuthUser;
    const { name, phone, email, stageId, dealValue, tags, sourceCampaign } = request.body as any;

    if (!name || !phone || !stageId) {
      return reply.status(400).send({ error: 'Nome, telefone e estágio são obrigatórios.' });
    }

    try {
      // Verify stage belongs to account
      const stage = await prisma.pipelineStage.findFirst({
        where: { id: stageId, pipeline: { accountId: user.accountId } },
      });

      if (!stage) {
        return reply.status(400).send({ error: 'Estágio do pipeline inválido para esta conta.' });
      }

      const lead = await prisma.$transaction(async (tx) => {
        const newLead = await tx.lead.create({
          data: {
            accountId: user.accountId,
            stageId,
            name,
            phone,
            email: email || null,
            dealValue: dealValue ? Number(dealValue) : 0,
            sourceCampaign: sourceCampaign || 'Manual',
          },
        });

        // Add timeline item
        await tx.leadTimeline.create({
          data: {
            leadId: newLead.id,
            type: 'CREATION',
            description: `Lead criado manualmente por ${user.name}`,
            actor: 'USER',
          },
        });

        // Create default conversation wrapper
        await tx.conversation.create({
          data: {
            leadId: newLead.id,
            accountId: user.accountId,
            waConversationId: `wa_conv_${newLead.id}`, // Placeholder WABA reference
          },
        });

        // Insert tags if any
        if (tags && Array.isArray(tags) && tags.length > 0) {
          await Promise.all(
            tags.map((tag: string) =>
              tx.leadTag.create({
                data: {
                  leadId: newLead.id,
                  tagName: tag,
                },
              })
            )
          );
        }

        return newLead;
      });

      // Refetch with tags to return
      const fullLead = await prisma.lead.findUnique({
        where: { id: lead.id },
        include: { tags: true, stage: true },
      });

      return fullLead;
    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Erro ao criar lead.' });
    }
  });

  // Update lead info
  fastify.put('/:id', async (request: any, reply) => {
    const user = request.user as AuthUser;
    const { id } = request.params as any;
    const { name, phone, email, dealValue, tags } = request.body as any;

    try {
      const existingLead = await prisma.lead.findFirst({
        where: { id, accountId: user.accountId },
      });

      if (!existingLead) {
        return reply.status(404).send({ error: 'Lead não encontrado.' });
      }

      const lead = await prisma.$transaction(async (tx) => {
        const updated = await tx.lead.update({
          where: { id },
          data: {
            name: name ?? undefined,
            phone: phone ?? undefined,
            email: email !== undefined ? email : undefined,
            dealValue: dealValue !== undefined ? Number(dealValue) : undefined,
          },
        });

        if (tags && Array.isArray(tags)) {
          // Delete old tags
          await tx.leadTag.deleteMany({
            where: { leadId: id },
          });

          // Insert new ones
          await Promise.all(
            tags.map((tag: string) =>
              tx.leadTag.create({
                data: {
                  leadId: id,
                  tagName: tag,
                },
              })
            )
          );
        }

        return updated;
      });

      const fullLead = await prisma.lead.findUnique({
        where: { id: lead.id },
        include: { tags: true, stage: true },
      });

      return fullLead;
    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Erro ao atualizar lead.' });
    }
  });

  // Move Lead stage
  fastify.put('/:id/move', async (request: any, reply) => {
    const user = request.user as AuthUser;
    const { id } = request.params as any;
    const { stageId } = request.body as any;

    if (!stageId) {
      return reply.status(400).send({ error: 'ID do estágio destino é obrigatório.' });
    }

    try {
      // Verify lead belongs to account
      const lead = await prisma.lead.findFirst({
        where: { id, accountId: user.accountId },
        include: { stage: true },
      });

      if (!lead) {
        return reply.status(404).send({ error: 'Lead não encontrado.' });
      }

      // Verify target stage belongs to account
      const targetStage = await prisma.pipelineStage.findFirst({
        where: { id: stageId, pipeline: { accountId: user.accountId } },
      });

      if (!targetStage) {
        return reply.status(400).send({ error: 'Estágio destino inválido.' });
      }

      if (lead.stageId === stageId) {
        return lead; // Already there
      }

      const updatedLead = await prisma.$transaction(async (tx) => {
        const updated = await tx.lead.update({
          where: { id },
          data: { stageId },
        });

        // Add timeline item
        await tx.leadTimeline.create({
          data: {
            leadId: id,
            type: 'STAGE_CHANGE',
            description: `Movido de "${lead.stage.name}" para "${targetStage.name}" por ${user.name}`,
            actor: 'USER',
          },
        });

        // If target stage triggers a CAPI event, log/enqueue it
        if (targetStage.capiEventTrigger) {
          // Log CAPI Event preparation
          await tx.capiEvent.create({
            data: {
              leadId: id,
              eventName: targetStage.capiEventTrigger,
              eventTime: Math.floor(Date.now() / 1000),
              eventId: `capi_evt_${id}_${Date.now()}`,
              payloadJson: JSON.stringify({
                phone: updated.phone,
                email: updated.email,
                value: updated.dealValue,
                stage: targetStage.name,
              }),
              metaResponse: 'Enfileirado para processamento',
            },
          });

          await tx.leadTimeline.create({
            data: {
              leadId: id,
              type: 'CAPI_FIRED',
              description: `Evento Meta CAPI "${targetStage.capiEventTrigger}" enfileirado para envio`,
              actor: 'SYSTEM',
            },
          });
        }

        return updated;
      });

      const fullLead = await prisma.lead.findUnique({
        where: { id: updatedLead.id },
        include: { tags: true, stage: true },
      });

      return fullLead;
    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Erro ao mover estágio do lead.' });
    }
  });

  // Delete lead
  fastify.delete('/:id', async (request: any, reply) => {
    const user = request.user as AuthUser;
    const { id } = request.params as any;

    try {
      const lead = await prisma.lead.findFirst({
        where: { id, accountId: user.accountId },
      });

      if (!lead) {
        return reply.status(404).send({ error: 'Lead não encontrado.' });
      }

      await prisma.lead.delete({
        where: { id },
      });

      return { success: true, message: 'Lead removido com sucesso.' };
    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Erro ao remover lead.' });
    }
  });

  // Create lead note/timeline item manually
  fastify.post('/:id/notes', async (request: any, reply) => {
    const user = request.user as AuthUser;
    const { id } = request.params as any;
    const { note } = request.body as any;

    if (!note) {
      return reply.status(400).send({ error: 'Conteúdo da nota é obrigatório.' });
    }

    try {
      const lead = await prisma.lead.findFirst({
        where: { id, accountId: user.accountId },
      });

      if (!lead) {
        return reply.status(404).send({ error: 'Lead não encontrado.' });
      }

      const timelineItem = await prisma.leadTimeline.create({
        data: {
          leadId: id,
          type: 'NOTE_ADDED',
          description: note,
          actor: 'USER',
        },
      });

      return timelineItem;
    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Erro ao adicionar nota ao lead.' });
    }
  });

  // GET: SSE real-time updates for a lead
  fastify.get('/:id/stream', async (request: any, reply) => {
    const user = request.user as AuthUser;
    const { id } = request.params as any;

    try {
      const lead = await prisma.lead.findFirst({
        where: { id, accountId: user.accountId },
      });

      if (!lead) {
        return reply.status(404).send({ error: 'Lead não encontrado.' });
      }

      const headers = {
        'Content-Type': 'text/event-stream',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
      };
      reply.raw.writeHead(200, headers);

      const onMessage = (data: any) => {
        if (data.leadId === id) {
          reply.raw.write(`data: ${JSON.stringify(data.message)}\n\n`);
        }
      };

      const onAiAnalysis = (data: any) => {
        if (data.leadId === id) {
          reply.raw.write(`data: ${JSON.stringify({ type: 'AI_ANALYSIS', ...data })}\n\n`);
        }
      };

      messageEventEmitter.on('new-message', onMessage);
      messageEventEmitter.on('ai-analysis', onAiAnalysis);

      request.raw.on('close', () => {
        messageEventEmitter.off('new-message', onMessage);
        messageEventEmitter.off('ai-analysis', onAiAnalysis);
      });

      // Keep connection alive with a ping every 30 seconds
      const interval = setInterval(() => {
        reply.raw.write(': ping\n\n');
      }, 30000);

      request.raw.on('close', () => {
        clearInterval(interval);
      });
    } catch (err: any) {
      fastify.log.error(err);
      return reply.status(500).send({ error: 'Erro no stream SSE.' });
    }
  });

  // POST: Send WhatsApp message to lead (real or mock)
  fastify.post('/:id/messages', async (request: any, reply) => {
    const user = request.user as AuthUser;
    const { id } = request.params as any;
    const { content, type } = request.body as any;

    if (!content) {
      return reply.status(400).send({ error: 'Conteúdo da mensagem é obrigatório.' });
    }

    try {
      const lead = await prisma.lead.findFirst({
        where: { id, accountId: user.accountId },
      });

      if (!lead) {
        return reply.status(404).send({ error: 'Lead não encontrado.' });
      }

      // Find or create conversation
      let conversation = await prisma.conversation.findFirst({
        where: { leadId: lead.id, accountId: user.accountId },
      });

      if (!conversation) {
        conversation = await prisma.conversation.create({
          data: {
            leadId: lead.id,
            accountId: user.accountId,
            waConversationId: `wa_conv_${lead.id}`,
          },
        });
      }

      // Find WhatsApp config
      const config = await prisma.whatsappConfig.findFirst({
        where: { accountId: user.accountId },
      });

      let waMessageId = `mock_msg_${Date.now()}`;
      let status: 'SENT' | 'FAILED' = 'SENT';

      if (config && config.phoneNumberId && config.accessTokenEnc) {
        try {
          const response = await fetch(`https://graph.facebook.com/v20.0/${config.phoneNumberId}/messages`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${config.accessTokenEnc}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: lead.phone,
              type: 'text',
              text: { body: content },
            }),
          });

          const resData = await response.json();
          if (response.ok && resData.messages && resData.messages[0]) {
            waMessageId = resData.messages[0].id;
          } else {
            fastify.log.error({ resData }, 'Meta API Error response');
            status = 'FAILED';
          }
        } catch (apiErr) {
          fastify.log.error(apiErr, 'Falha ao enviar via Meta API');
          status = 'FAILED';
        }
      }

      const direction = 'OUTBOUND';
      const msgType = type === 'IMAGE' ? 'IMAGE' : type === 'AUDIO' ? 'AUDIO' : 'TEXT';

      const newMessage = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          direction,
          type: msgType,
          content,
          waMessageId,
          status: status === 'SENT' ? 'SENT' : 'FAILED',
        },
      });

      // Update conversation lastMessageAt
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: newMessage.createdAt },
      });

      // Emit event for real-time stream
      messageEventEmitter.emit('new-message', {
        leadId: lead.id,
        message: {
          ...newMessage,
          createdAt: newMessage.createdAt.toISOString(),
        },
      });

      // Add timeline item
      await prisma.leadTimeline.create({
        data: {
          leadId: lead.id,
          type: 'NOTE_ADDED',
          description: `Mensagem enviada via WhatsApp: "${content.substring(0, 60)}${content.length > 60 ? '...' : ''}"`,
          actor: 'USER',
        },
      });

      // Trigger AI Analysis in background (debounced)
      enqueueAiAnalysis(lead.id).catch((err) => {
        fastify.log.error(err, 'Erro ao enfileirar análise de IA');
      });

      return newMessage;
    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Erro ao enviar mensagem.' });
    }
  });

  // GET: AI logs and actions for a lead
  fastify.get('/:id/ai-logs', async (request: any, reply) => {
    const user = request.user as AuthUser;
    const { id } = request.params as any;

    try {
      const lead = await prisma.lead.findFirst({
        where: { id, accountId: user.accountId },
      });

      if (!lead) {
        return reply.status(404).send({ error: 'Lead não encontrado.' });
      }

      const logs = await prisma.aiAnalysisLog.findMany({
        where: { leadId: id },
        orderBy: { createdAt: 'desc' },
      });

      const actions = await prisma.aiAction.findMany({
        where: { leadId: id },
        orderBy: { createdAt: 'desc' },
      });

      return { logs, actions };
    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Erro ao buscar logs de IA.' });
    }
  });

  // POST: Resolve AI action recommendation
  fastify.post('/:id/ai-actions/:actionId/resolve', async (request: any, reply) => {
    const user = request.user as AuthUser;
    const { id, actionId } = request.params as any;
    const { status } = request.body as any; // 'ACCEPTED' | 'REVERTED'

    if (!status || (status !== 'ACCEPTED' && status !== 'REVERTED')) {
      return reply.status(400).send({ error: 'Status inválido. Deve ser ACCEPTED ou REVERTED.' });
    }

    try {
      const action = await prisma.aiAction.findFirst({
        where: {
          id: actionId,
          leadId: id,
          lead: { accountId: user.accountId },
        },
      });

      if (!action) {
        return reply.status(404).send({ error: 'Ação sugerida não encontrada.' });
      }

      if (action.status !== 'PENDING') {
        return reply.status(400).send({ error: 'Esta ação já foi resolvida.' });
      }

      if (status === 'ACCEPTED') {
        const targetStage = await prisma.pipelineStage.findFirst({
          where: { id: action.toStageId, pipeline: { accountId: user.accountId } },
        });

        if (!targetStage) {
          return reply.status(400).send({ error: 'Estágio de destino não encontrado.' });
        }

        const sourceStage = await prisma.pipelineStage.findFirst({
          where: { id: action.fromStageId },
        });

        await prisma.$transaction(async (tx) => {
          // Update lead stage
          await tx.lead.update({
            where: { id },
            data: { stageId: action.toStageId },
          });

          // Mark action resolved
          await tx.aiAction.update({
            where: { id: actionId },
            data: { status: 'ACCEPTED', resolvedAt: new Date() },
          });

          // Add timeline log
          await tx.leadTimeline.create({
            data: {
              leadId: id,
              type: 'STAGE_CHANGE',
              description: `Estágio atualizado via IA (Aceito por ${user.name}): de "${sourceStage?.name || 'Estágio Anterior'}" para "${targetStage.name}"`,
              actor: 'USER',
            },
          });
        });
      } else {
        await prisma.aiAction.update({
          where: { id: actionId },
          data: { status: 'REVERTED', resolvedAt: new Date() },
        });

        await prisma.leadTimeline.create({
          data: {
            leadId: id,
            type: 'NOTE_ADDED',
            description: `Sugestão de IA de mover estágio rejeitada por ${user.name}: "${action.reason}"`,
            actor: 'USER',
          },
        });
      }

      return { success: true };
    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Erro ao resolver ação de IA.' });
    }
  });
};

