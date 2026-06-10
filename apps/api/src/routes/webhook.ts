import crypto from 'crypto';
import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { prisma } from '@crm/database';
import { whatsappInboundQueue } from '../queues/whatsappInboundQueue';

export const webhookRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Scoped content parser to capture rawBody for signature verification
  fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    try {
      const json = JSON.parse(body as string);
      (req as any).rawBody = body;
      done(null, json);
    } catch (err: any) {
      err.statusCode = 400;
      done(err, undefined);
    }
  });

  // GET: Webhook verification challenge
  fastify.get('/whatsapp', async (request: any, reply) => {
    const mode = request.query['hub.mode'];
    const challenge = request.query['hub.challenge'];
    const verifyToken = request.query['hub.verify_token'];

    fastify.log.info({ mode, verifyToken }, 'Verificando Webhook WhatsApp');

    if (mode && verifyToken) {
      if (mode === 'subscribe') {
        // Query database for matching WhatsappConfig verifyToken
        const config = await prisma.whatsappConfig.findFirst({
          where: { verifyToken },
        });

        const globalVerifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'super-secret-verify-token';

        if (config || verifyToken === globalVerifyToken) {
          fastify.log.info('Webhook WhatsApp verificado com sucesso.');
          return reply.status(200).send(challenge);
        }
      }
    }

    fastify.log.warn('Falha na verificação do Webhook WhatsApp.');
    return reply.status(403).send({ error: 'Falha na verificação.' });
  });

  // POST: Receive WhatsApp events
  fastify.post('/whatsapp', async (request: any, reply) => {
    const signatureHeader = request.headers['x-hub-signature-256'] as string;
    const appSecret = process.env.WHATSAPP_APP_SECRET || 'super-secret-app-secret';

    // Verify signature if header is present
    if (signatureHeader) {
      const rawBody = (request as any).rawBody || JSON.stringify(request.body);
      const parts = signatureHeader.split('=');
      if (parts[0] === 'sha256') {
        const expectedSignature = crypto
          .createHmac('sha256', appSecret)
          .update(rawBody)
          .digest('hex');

        if (expectedSignature !== parts[1]) {
          fastify.log.warn('Assinatura do webhook inválida.');
          return reply.status(403).send({ error: 'Assinatura inválida.' });
        }
      }
    }

    const payload = request.body;

    if (payload.object === 'whatsapp_business_account' && payload.entry) {
      for (const entry of payload.entry) {
        if (!entry.changes) continue;
        for (const change of entry.changes) {
          if (change.field !== 'messages') continue;

          const value = change.value;
          if (!value || !value.messages) continue;

          const phoneId = value.metadata?.phone_number_id;
          if (!phoneId) continue;

          // Find Account matching phoneId
          const waConfig = await prisma.whatsappConfig.findFirst({
            where: { phoneNumberId: phoneId },
          });

          if (!waConfig) {
            fastify.log.warn(`Webhook recebido para phoneNumberId: ${phoneId} sem WhatsappConfig no banco.`);
            continue;
          }

          const accountId = waConfig.accountId;

          // Process each message
          for (const msg of value.messages) {
            const fromPhone = msg.from;
            const profileName = value.contacts?.find((c: any) => c.wa_id === fromPhone)?.profile?.name || '';
            const waConversationId = msg.conversation?.id || `wa_conv_${fromPhone}`;

            let content = '';
            if (msg.type === 'text' && msg.text) {
              content = msg.text.body;
            } else if (msg.type === 'audio' && msg.audio) {
              content = msg.audio.id;
            } else if (msg.type === 'image' && msg.image) {
              content = msg.image.id;
            } else if (msg.type === 'document' && msg.document) {
              content = msg.document.id;
            } else if (msg.type === 'button' && msg.button) {
              content = msg.button.text;
            } else if (msg.type === 'interactive' && msg.interactive) {
              if (msg.interactive.button_reply) {
                content = msg.interactive.button_reply.title;
              } else if (msg.interactive.list_reply) {
                content = msg.interactive.list_reply.title;
              }
            } else {
              content = `[Mensagem tipo: ${msg.type}]`;
            }

            // Enqueue task for async worker processing
            await whatsappInboundQueue.add(`inbound-${msg.id}`, {
              accountId,
              fromPhone,
              profileName,
              waConversationId,
              message: {
                waMessageId: msg.id,
                content,
                type: msg.type,
                timestamp: msg.timestamp,
              },
            });
          }
        }
      }
    }

    return reply.status(200).send({ success: true });
  });
};
