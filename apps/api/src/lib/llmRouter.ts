import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import { prisma } from '@crm/database';
import { decrypt } from './crypto';

let cachedConfig: any = null;
let cacheExpiry = 0;

export async function getAiConfig() {
  const now = Date.now();
  if (cachedConfig && now < cacheExpiry) {
    return cachedConfig;
  }

  try {
    const config = await prisma.globalAiConfig.findFirst();
    cachedConfig = config;
    cacheExpiry = now + 60000; // 60s cache TTL
    return config;
  } catch (error) {
    console.error('[llmRouter] Erro ao buscar GlobalAiConfig do banco:', error);
    return null;
  }
}

export function clearAiConfigCache() {
  cachedConfig = null;
  cacheExpiry = 0;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Timeout excedido')), ms)),
  ]);
}

interface LLMResponse {
  text: string;
  modelUsed: string;
}

export async function callLLM(prompt: string, systemPrompt: string): Promise<LLMResponse> {
  const config = await getAiConfig();

  const primaryProvider = config?.primaryProvider || 'CLAUDE';
  const fallbackCsv = config?.fallbackOrder !== undefined ? config.fallbackOrder : 'GEMINI,OPENAI';
  const fallbacks = fallbackCsv ? fallbackCsv.split(',').map((s: string) => s.trim()).filter(Boolean) : [];

  const providersQueue = [primaryProvider, ...fallbacks];
  // Remove duplicates while keeping order
  const uniqueProviders = Array.from(new Set(providersQueue));

  console.log(`[llmRouter] Iniciando roteamento de IA. Fila de provedores: ${uniqueProviders.join(' -> ')}`);

  for (const provider of uniqueProviders) {
    try {
      if (provider === 'CLAUDE') {
        const apiKey = (config?.claudeApiKeyEnc ? decrypt(config.claudeApiKeyEnc) : null) || process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
          console.warn('[llmRouter] Ignorando Anthropic Claude: Sem chave de API.');
          continue;
        }
        const model = config?.claudeModel || 'claude-3-5-sonnet-20240620';
        console.log(`[llmRouter] Tentando Anthropic Claude usando modelo ${model}...`);

        const anthropic = new Anthropic({ apiKey, timeout: 15000 });
        const response = await anthropic.messages.create({
          model,
          max_tokens: 1500,
          system: systemPrompt,
          messages: [{ role: 'user', content: prompt }],
        });

        // Parse content
        const textContent = response.content.find((c) => c.type === 'text');
        if (textContent && 'text' in textContent) {
          return { text: textContent.text, modelUsed: model };
        }
        throw new Error('Nenhuma resposta em formato texto recebida do Claude.');
      }

      if (provider === 'GEMINI') {
        const apiKey = (config?.geminiApiKeyEnc ? decrypt(config.geminiApiKeyEnc) : null) || process.env.GEMINI_API_KEY;
        if (!apiKey) {
          console.warn('[llmRouter] Ignorando Google Gemini: Sem chave de API.');
          continue;
        }
        const modelName = config?.geminiModel || 'gemini-1.5-flash';
        console.log(`[llmRouter] Tentando Google Gemini usando modelo ${modelName}...`);

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: modelName, systemInstruction: systemPrompt });

        const result = await withTimeout(model.generateContent(prompt), 15000);
        const text = result.response.text();
        if (text) {
          return { text, modelUsed: modelName };
        }
        throw new Error('Resposta do Gemini vazia.');
      }

      if (provider === 'OPENAI') {
        const apiKey = (config?.openaiApiKeyEnc ? decrypt(config.openaiApiKeyEnc) : null) || process.env.OPENAI_API_KEY;
        if (!apiKey) {
          console.warn('[llmRouter] Ignorando OpenAI: Sem chave de API.');
          continue;
        }
        const model = config?.openaiModel || 'gpt-4o-mini';
        console.log(`[llmRouter] Tentando OpenAI usando modelo ${model}...`);

        const openai = new OpenAI({ apiKey, timeout: 15000 });
        const response = await openai.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
          response_format: { type: 'json_object' },
        });

        const text = response.choices[0]?.message?.content;
        if (text) {
          return { text, modelUsed: model };
        }
        throw new Error('Resposta da OpenAI vazia.');
      }
    } catch (error: any) {
      console.error(`[llmRouter] Falha no provedor ${provider}:`, error.message || error);
      // Continue to next provider in queue
    }
  }

  throw new Error('Todos os provedores de LLM falharam ou não possuem chaves de API configuradas.');
}
