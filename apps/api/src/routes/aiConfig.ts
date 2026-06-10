import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { prisma } from '@crm/database';
import { AuthUser } from '@crm/types';
import { encrypt, decrypt } from '../lib/crypto';
import { clearAiConfigCache } from '../lib/llmRouter';

function maskApiKey(keyEnc: string | null): string {
  if (!keyEnc) return '';
  const raw = decrypt(keyEnc);
  if (!raw) return '';
  if (raw.length <= 8) return '********';
  return `${raw.substring(0, 4)}...${raw.substring(raw.length - 4)}`;
}

export const aiConfigRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Enforce authentication
  fastify.addHook('preValidation', (fastify as any).authenticate);

  // Enforce OWNER role
  fastify.addHook('preHandler', async (request: any, reply) => {
    const user = request.user as AuthUser;
    if (user.role !== 'OWNER') {
      return reply.status(403).send({ error: 'Acesso negado. Apenas o OWNER da agência pode configurar as IAs.' });
    }
  });

  // GET: Fetch global AI config (with masked keys)
  fastify.get('/', async (request: any, reply) => {
    try {
      const config = await prisma.globalAiConfig.findFirst();
      
      if (!config) {
        return {
          primaryProvider: 'CLAUDE',
          fallbackOrder: 'GEMINI,OPENAI',
          claudeModel: 'claude-3-5-sonnet-20240620',
          geminiModel: 'gemini-1.5-flash',
          openaiModel: 'gpt-4o-mini',
          claudeApiKey: '',
          geminiApiKey: '',
          openaiApiKey: '',
        };
      }

      return {
        id: config.id,
        primaryProvider: config.primaryProvider,
        fallbackOrder: config.fallbackOrder,
        claudeModel: config.claudeModel,
        geminiModel: config.geminiModel,
        openaiModel: config.openaiModel,
        claudeApiKey: maskApiKey(config.claudeApiKeyEnc),
        geminiApiKey: maskApiKey(config.geminiApiKeyEnc),
        openaiApiKey: maskApiKey(config.openaiApiKeyEnc),
        updatedAt: config.updatedAt,
      };
    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Erro ao buscar configurações de IA.' });
    }
  });

  // POST: Update global AI config
  fastify.post('/', async (request: any, reply) => {
    const user = request.user as AuthUser;
    const {
      primaryProvider,
      fallbackOrder,
      claudeModel,
      geminiModel,
      openaiModel,
      claudeApiKey,
      geminiApiKey,
      openaiApiKey,
    } = request.body as any;

    if (!primaryProvider) {
      return reply.status(400).send({ error: 'O provedor primário é obrigatório.' });
    }

    try {
      const existing = await prisma.globalAiConfig.findFirst();

      const updateData: any = {
        primaryProvider,
        fallbackOrder: fallbackOrder !== undefined ? fallbackOrder : 'GEMINI,OPENAI',
        claudeModel: claudeModel || 'claude-3-5-sonnet-20240620',
        geminiModel: geminiModel || 'gemini-1.5-flash',
        openaiModel: openaiModel || 'gpt-4o-mini',
        updatedByUserId: user.id,
      };

      // Encrypt and update api keys ONLY if they are changed and not masked
      if (claudeApiKey !== undefined && claudeApiKey !== '' && !claudeApiKey.includes('...')) {
        updateData.claudeApiKeyEnc = encrypt(claudeApiKey);
      } else if (claudeApiKey === '') {
        updateData.claudeApiKeyEnc = null;
      }

      if (geminiApiKey !== undefined && geminiApiKey !== '' && !geminiApiKey.includes('...')) {
        updateData.geminiApiKeyEnc = encrypt(geminiApiKey);
      } else if (geminiApiKey === '') {
        updateData.geminiApiKeyEnc = null;
      }

      if (openaiApiKey !== undefined && openaiApiKey !== '' && !openaiApiKey.includes('...')) {
        updateData.openaiApiKeyEnc = encrypt(openaiApiKey);
      } else if (openaiApiKey === '') {
        updateData.openaiApiKeyEnc = null;
      }

      let config;
      if (existing) {
        config = await prisma.globalAiConfig.update({
          where: { id: existing.id },
          data: updateData,
        });
      } else {
        config = await prisma.globalAiConfig.create({
          data: {
            ...updateData,
          },
        });
      }

      // Clear memory cache
      clearAiConfigCache();

      return {
        success: true,
        config: {
          id: config.id,
          primaryProvider: config.primaryProvider,
          fallbackOrder: config.fallbackOrder,
          claudeModel: config.claudeModel,
          geminiModel: config.geminiModel,
          openaiModel: config.openaiModel,
          claudeApiKey: maskApiKey(config.claudeApiKeyEnc),
          geminiApiKey: maskApiKey(config.geminiApiKeyEnc),
          openaiApiKey: maskApiKey(config.openaiApiKeyEnc),
          updatedAt: config.updatedAt,
        },
      };
    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Erro ao salvar configurações de IA.' });
    }
  });
};
