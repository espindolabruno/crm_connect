import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcryptjs';
import { prisma } from '@crm/database';
import { AuthUser } from '@crm/types';

export const authRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  
  // Register Account + Owner User
  fastify.post('/register', async (request: any, reply) => {
    const { accountName, userName, email, password } = request.body as any;

    if (!accountName || !userName || !email || !password) {
      return reply.status(400).send({ error: 'All fields are required.' });
    }

    try {
      const existingUser = await prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        return reply.status(409).send({ error: 'Email already registered.' });
      }

      const passwordHash = await bcrypt.hash(password, 10);

      // Create Account, User, and default Pipeline in a transaction
      const result = await prisma.$transaction(async (tx) => {
        const account = await tx.account.create({
          data: {
            name: accountName,
          },
        });

        const user = await tx.user.create({
          data: {
            name: userName,
            email,
            passwordHash,
            role: 'OWNER',
            accountId: account.id,
          },
        });

        // Create standard pipeline
        const pipeline = await tx.pipeline.create({
          data: {
            name: 'Funil de Vendas Principal',
            accountId: account.id,
            isDefault: true,
          },
        });

        // Create default stages
        const stages = [
          { name: 'Novo Lead', color: '#1056D4', orderIndex: 0 },
          { name: 'Contato Feito', color: '#F1C40F', orderIndex: 1 },
          { name: 'Em Negociação', color: '#3498DB', orderIndex: 2 },
          { name: 'Proposta Enviada', color: '#9B59B6', orderIndex: 3 },
          { name: 'Convertido', color: '#2ECC71', orderIndex: 4, capiEventTrigger: 'Purchase' },
          { name: 'Perdido', color: '#E74C3C', orderIndex: 5 },
        ];

        await Promise.all(
          stages.map((stage) =>
            tx.pipelineStage.create({
              data: {
                pipelineId: pipeline.id,
                name: stage.name,
                color: stage.color,
                orderIndex: stage.orderIndex,
                capiEventTrigger: stage.capiEventTrigger,
              },
            })
          )
        );

        return { account, user };
      });

      const tokenUser: AuthUser = {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        role: result.user.role as any,
        accountId: result.account.id,
      };

      const token = fastify.jwt.sign(tokenUser);

      return { token, user: tokenUser };
    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });

  // Login
  fastify.post('/login', async (request: any, reply) => {
    const { email, password } = request.body as any;

    if (!email || !password) {
      return reply.status(400).send({ error: 'Email and password are required.' });
    }

    try {
      const user = await prisma.user.findUnique({
        where: { email },
        include: { account: true },
      });

      if (!user) {
        return reply.status(401).send({ error: 'Invalid email or password.' });
      }

      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

      if (!isPasswordValid) {
        return reply.status(401).send({ error: 'Invalid email or password.' });
      }

      const tokenUser: AuthUser = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role as any,
        accountId: user.accountId,
      };

      const token = fastify.jwt.sign(tokenUser);

      return { token, user: tokenUser };
    } catch (error: any) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });

  // Get profile context
  fastify.get('/me', { preValidation: [(fastify as any).authenticate] }, async (request: any, reply) => {
    try {
      const user = request.user as AuthUser;
      return { user };
    } catch (error: any) {
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });
};
