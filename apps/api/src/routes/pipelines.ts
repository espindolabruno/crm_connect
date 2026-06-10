import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { prisma } from '@crm/database';
import { AuthUser } from '@crm/types';

export const pipelineRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Enforce authentication on all routes in this plugin
  fastify.addHook('preValidation', (fastify as any).authenticate);

  // List all pipelines with their stages
  fastify.get('/', async (request: any, reply) => {
    const user = request.user as AuthUser;

    try {
      const pipelines = await prisma.pipeline.findMany({
        where: { accountId: user.accountId },
        include: {
          stages: {
            orderBy: { orderIndex: 'asc' },
          },
        },
      });
      return pipelines;
    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Erro ao listar pipelines.' });
    }
  });

  // Get default pipeline with stages
  fastify.get('/default', async (request: any, reply) => {
    const user = request.user as AuthUser;

    try {
      let pipeline = await prisma.pipeline.findFirst({
        where: { accountId: user.accountId, isDefault: true },
        include: {
          stages: {
            orderBy: { orderIndex: 'asc' },
          },
        },
      });

      // Fallback: If no default pipeline, return first pipeline
      if (!pipeline) {
        pipeline = await prisma.pipeline.findFirst({
          where: { accountId: user.accountId },
          include: {
            stages: {
              orderBy: { orderIndex: 'asc' },
            },
          },
        });
      }

      if (!pipeline) {
        return reply.status(404).send({ error: 'Nenhum pipeline encontrado.' });
      }

      return pipeline;
    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Erro ao obter pipeline padrão.' });
    }
  });

  // Create a pipeline stage
  fastify.post('/stages', async (request: any, reply) => {
    const user = request.user as AuthUser;
    const { pipelineId, name, color, orderIndex, capiEventTrigger } = request.body as any;

    if (!pipelineId || !name) {
      return reply.status(400).send({ error: 'ID do Pipeline e nome do estágio são obrigatórios.' });
    }

    try {
      // Verify pipeline belongs to the account
      const pipeline = await prisma.pipeline.findFirst({
        where: { id: pipelineId, accountId: user.accountId },
      });

      if (!pipeline) {
        return reply.status(403).send({ error: 'Acesso negado ao pipeline.' });
      }

      const stage = await prisma.pipelineStage.create({
        data: {
          pipelineId,
          name,
          color: color || '#1056D4',
          orderIndex: orderIndex ?? 0,
          capiEventTrigger,
        },
      });

      return stage;
    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Erro ao criar estágio.' });
    }
  });

  // Update a pipeline stage
  fastify.put('/stages/:id', async (request: any, reply) => {
    const user = request.user as AuthUser;
    const { id } = request.params as any;
    const { name, color, orderIndex, capiEventTrigger } = request.body as any;

    try {
      // Verify stage belongs to account
      const stage = await prisma.pipelineStage.findFirst({
        where: {
          id,
          pipeline: { accountId: user.accountId },
        },
      });

      if (!stage) {
        return reply.status(404).send({ error: 'Estágio não encontrado.' });
      }

      const updatedStage = await prisma.pipelineStage.update({
        where: { id },
        data: {
          name: name ?? undefined,
          color: color ?? undefined,
          orderIndex: orderIndex ?? undefined,
          capiEventTrigger: capiEventTrigger !== undefined ? capiEventTrigger : undefined,
        },
      });

      return updatedStage;
    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Erro ao atualizar estágio.' });
    }
  });
};
