# CRM de Conversão para Agências de Marketing Digital

**Documento de Requisitos de Produto (PRD) + Especificação de Arquitetura**

| Campo | Valor |
|---|---|
| Versão | 2.0 – VPS Hostinger + Easypanel + IA de intenção detalhada |
| Data | Maio / 2026 |
| Destinatário | Equipe de Desenvolvimento |
| Classificação | Confidencial |

---

## Sumário

1. [Sumário Executivo](#1-sumário-executivo)
2. [Público-Alvo e Personas](#2-público-alvo-e-personas)
3. [Infraestrutura — VPS Hostinger + Easypanel](#3-infraestrutura--vps-hostinger--easypanel)
4. [Requisitos Funcionais](#4-requisitos-funcionais)
5. [Motor de IA — Análise de Intenção por Janela de Conversa](#5-motor-de-ia--análise-de-intenção-por-janela-de-conversa)
6. [Modelo de Dados Completo](#6-modelo-de-dados-completo)
7. [Stack Tecnológica](#7-stack-tecnológica)
8. [Plano de Desenvolvimento MVP → V1](#8-plano-de-desenvolvimento-mvp--v1)
9. [Variáveis de Ambiente](#9-variáveis-de-ambiente)
10. [Pontos de Atenção e Observações Finais](#10-pontos-de-atenção-e-observações-finais)

---

## 1. Sumário Executivo

Este documento especifica todos os requisitos técnicos, funcionais e de arquitetura para o desenvolvimento de um **CRM de Conversão multi-conta** destinado a agências de marketing digital. A solução será disponibilizada pela agência a cada um de seus clientes, permitindo que organizem, acompanhem e convertam leads provenientes de campanhas pagas de forma simples e inteligente.

O diferencial central do produto é a integração nativa com a **API Oficial do WhatsApp Business**, o envio automático de conversões para a **Meta Conversions API (CAPI)**, e a presença de **inteligência artificial que lê janelas de conversa** e move automaticamente os leads entre os estágios do pipeline — eliminando o trabalho manual do cliente.

Toda a infraestrutura roda em uma **única VPS na Hostinger**, gerenciada pelo **Easypanel**, mantendo banco de dados, cache, storage e todos os serviços dentro do mesmo servidor.

### Objetivos principais do produto

- **Organizar leads:** centralizar todos os contatos vindos de campanhas em um único lugar por cliente.
- **Automatizar status:** IA lê janelas de conversa e move o lead no pipeline automaticamente.
- **Comunicação nativa:** responder pelo WhatsApp diretamente dentro do CRM, sem sair da tela.
- **Fechar o loop da Meta:** enviar eventos de conversão via CAPI.
- **Multi-conta simples:** cada cliente tem sua conta isolada com seu próprio número de WhatsApp.
- **Infra self-hosted:** VPS Hostinger + Easypanel — sem dependência de múltiplos provedores cloud.

---

## 2. Público-Alvo e Personas

### 2.1 Usuário Principal — Cliente da Agência

Pequenos e médios empresários que investem em tráfego pago e recebem leads via WhatsApp, formulários do Meta ou Landing Pages. Atendem os leads diretamente pelo celular. Precisam de uma ferramenta simples, **mobile-first**, sem curva de aprendizado.

### 2.2 Usuário Administrativo — Agência

A própria agência que cria e gerencia as contas dos clientes, define os pipelines padrão, monitora a saúde das contas e garante que as integrações estejam ativas.

### 2.3 Personas Mapeadas

| Persona | Perfil | Necessidade Principal |
|---|---|---|
| Dono de clínica estética | Recebe 50–200 leads/mês via Meta Ads; atende sozinho pelo WhatsApp | Saber quem já foi atendido, quem sumiu e quem está pronto pra fechar |
| Corretor de imóveis | Campanhas no Facebook/Instagram; leads no WhatsApp Business | Organizar por interesse, não perder follow-up e enviar conversões pra Meta |

---

## 3. Infraestrutura — VPS Hostinger + Easypanel

Toda a solução será hospedada em uma **única VPS contratada na Hostinger**. O Easypanel será utilizado como painel de gerenciamento de containers Docker, substituindo soluções distribuídas em múltiplos provedores cloud. Banco de dados, cache, storage e todos os serviços de aplicação rodam dentro desta mesma VPS, reduzindo latência entre serviços e simplificando a operação.

### 3.1 Especificação Mínima da VPS

| Recurso | Mínimo | Recomendado |
|---|---|---|
| Plano Hostinger | KVM 2 | KVM 4 |
| CPU | 4 vCPUs | 8 vCPUs |
| RAM | 8 GB | 16 GB |
| Armazenamento | 200 GB NVMe SSD | 400 GB NVMe SSD |
| Sistema Operacional | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |
| IP dedicado | Obrigatório | Obrigatório |

> **IP dedicado é obrigatório** — necessário para registrar o webhook da Meta com domínio fixo e certificado SSL válido.

### 3.2 Easypanel — Papel e Configuração

O Easypanel fornece uma interface web para gerenciar todos os containers Docker da VPS sem necessidade de linha de comando no dia a dia. Cada serviço da aplicação será um projeto/serviço dentro do Easypanel.

**Instalação:**
```bash
curl -sSL https://easypanel.io/install.sh | sh
```

**Capacidades utilizadas:**
- Cada serviço = 1 container Docker gerenciado pelo Easypanel
- SSL automático via Let's Encrypt para todos os subdomínios (Traefik embutido)
- Deploy automático via GitHub (webhook de push → rebuild do container)
- Logs em tempo real e restart automático por serviço
- Variáveis de ambiente configuradas diretamente na UI por serviço
- Backup de volumes Docker configurável via cron no próprio painel

### 3.3 Mapa de Serviços na VPS

Todos os serviços abaixo rodam como containers no Easypanel:

| Serviço | Função | Porta | Imagem Base | Observação |
|---|---|---|---|---|
| `crm-frontend` | Next.js 14 (SSR/PWA) | 3000 | node:20-alpine | `app.seucrm.com.br` |
| `crm-api` | Fastify — CRM Core + Auth | 4000 | node:20-alpine | `api.seucrm.com.br` |
| `crm-whatsapp` | Webhook WA + Envio | 4001 | node:20-alpine | `wa.seucrm.com.br` |
| `crm-ai` | AI Engine (análise de conversa) | 5000 | python:3.12-slim | Interno — sem exposição pública |
| `crm-capi` | Meta CAPI Service | 5001 | python:3.12-slim | Interno |
| `postgres` | Banco de dados principal | 5432 | postgres:16-alpine | Volume persistente `/data/postgres` |
| `redis` | Cache + filas BullMQ | 6379 | redis:7-alpine | Volume persistente `/data/redis` |
| `minio` | Object Storage (mídias WA) | 9000/9001 | minio/minio:latest | Volume persistente `/data/minio` |
| `traefik` | Reverse proxy + SSL | 80/443 | Gerenciado pelo Easypanel | Rota para todos os serviços |

### 3.4 Diagrama de Comunicação Interna

Todos os serviços se comunicam via **rede Docker interna** (bridge network do Easypanel). Apenas o Traefik expõe as portas 80/443 publicamente.

```
INTERNET
    │
    ▼
[Traefik / Easypanel SSL]  ←  Let's Encrypt automático
    │
    ├──► app.seucrm.com.br   →  [crm-frontend :3000]
    │                                   │
    ├──► api.seucrm.com.br   →  [crm-api :4000]
    │                                   │  (rede interna Docker)
    ├──► wa.seucrm.com.br    →  [crm-whatsapp :4001]
    │         ↑ Webhook Meta              │
    │                         ┌──────────┤
    │                         ▼          ▼
    │                    [redis :6379]  [postgres :5432]
    │                         │
    │                    [BullMQ fila]
    │                         │
    │                    [crm-ai :5000]  ← interno apenas
    │                         │
    │                    [crm-capi :5001] ← interno apenas
    │                         │
    │                    [minio :9000]   ← storage de mídias
    │
    └──► minio.seucrm.com.br →  [MinIO Console :9001]  (admin apenas)
```

### 3.5 Storage — MinIO como substituto do S3

O MinIO será utilizado como solução de object storage self-hosted, **compatível com a API do S3**. Todas as mídias recebidas via WhatsApp (imagens, áudios, documentos) serão armazenadas no MinIO dentro da própria VPS.

- Compatibilidade total com AWS S3 SDK — zero mudança de código para migrar para S3 no futuro
- Buckets separados por tipo: `wa-media`, `exports`, `avatars`
- URLs de acesso com tempo de expiração (presigned URLs) para segurança
- Console web do MinIO em subdomínio restrito para o admin da agência

### 3.6 Banco de Dados — PostgreSQL Self-Hosted

O PostgreSQL rodará como container Docker com volume persistente mapeado na VPS. **Sem uso do Supabase cloud** — toda a gestão é local.

- **Imagem:** `postgres:16-alpine`
- **Volume:** `/data/postgres` mapeado no host da VPS
- **Backups:** `pg_dump` agendado via cron (diário + semanal), armazenado no MinIO
- **Conexão:** via `DATABASE_URL` interna (porta 5432 não exposta publicamente)
- **Multi-tenant:** Row Level Security (RLS) habilitado por conta
- **Migrations:** gerenciadas via Prisma Migrate
- **Acesso externo (debug):** túnel SSH ou pgAdmin como container opcional no Easypanel

### 3.7 Cache e Filas — Redis Self-Hosted

- **Imagem:** `redis:7-alpine` com persistência AOF habilitada
- **Volume:** `/data/redis` mapeado no host
- **Usos:** cache de sessões JWT, pub/sub para realtime, filas BullMQ para processamento assíncrono
- Sem autenticação externa — apenas rede interna Docker

### 3.8 CI/CD com Easypanel

```
1. Desenvolvedor faz push para branch main no GitHub
2. GitHub Actions executa: lint → testes unitários → build Docker
3. Se passou: GitHub Actions notifica Easypanel via webhook de deploy
4. Easypanel faz pull da nova imagem e reinicia o container
5. Logs do deploy disponíveis em tempo real no painel do Easypanel
```

### 3.9 Domínios e SSL

| Subdomínio | Serviço | Observação |
|---|---|---|
| `app.seucrm.com.br` | crm-frontend | Interface do CRM (clientes) |
| `api.seucrm.com.br` | crm-api | API REST principal |
| `wa.seucrm.com.br` | crm-whatsapp | Endpoint de webhook da Meta |
| `minio.seucrm.com.br` | MinIO Console | Admin da agência apenas |
| `admin.seucrm.com.br` | crm-frontend (rota admin) | Painel da agência |

### 3.10 Monitoramento na VPS

Todos os serviços abaixo rodam como containers no Easypanel:

| Serviço | Função | Imagem |
|---|---|---|
| **Uptime Kuma** | Uptime de todos os serviços + alertas por e-mail/WhatsApp | `louislam/uptime-kuma` |
| **Dozzle** | Visualização de logs de todos os containers em tempo real | `amir20/dozzle` |
| **Netdata** | Métricas de CPU, RAM, disco e rede da VPS em tempo real | `netdata/netdata` |
| **Sentry (self-hosted)** | Captura de erros frontend e backend (alternativa: Sentry cloud free tier) | `sentry/sentry` |

---

## 4. Requisitos Funcionais

### 4.1 Gestão Multi-Conta

> **Modelo:** 1 conta = 1 usuário = 1 número de WhatsApp. Sem multiusuário por conta.

- **RF-01:** Cadastro de conta pelo painel administrativo da agência.
- **RF-02:** Cada conta tem: nome, logo, plano ativo, status WhatsApp e Meta.
- **RF-03:** Isolamento total de dados via Row Level Security (RLS) no PostgreSQL.
- **RF-04:** Login independente por conta (e-mail + senha ou magic link via e-mail).
- **RF-05:** Painel de agência com visão geral de todas as contas.

### 4.2 Pipeline de Leads (Kanban)

- **RF-06:** Pipeline padrão: `Novo Lead → Contato Feito → Em Negociação → Proposta Enviada → Convertido → Perdido`.
- **RF-07:** Renomear e reordenar colunas por conta.
- **RF-08:** Card do lead: nome, telefone, origem, última mensagem, data de entrada, badge de ação de IA pendente.
- **RF-09:** Drag & drop para mover leads manualmente (dnd-kit, funciona no mobile).
- **RF-10:** Filtros por coluna, data, origem e tag.
- **RF-11:** Contador de leads por coluna.

### 4.3 WhatsApp Business API

- **RF-17:** Fluxo de conexão via Embedded Signup da Meta (< 3 minutos).
- **RF-18:** Recepção de mensagens em tempo real via webhook com validação de assinatura `X-Hub-Signature-256`.
- **RF-19:** Envio de texto, áudio, imagem e documentos pelo CRM.
- **RF-20:** Suporte a Templates HSM para mensagens fora da janela de 24h.
- **RF-21:** Biblioteca de templates por conta: criar, submeter para aprovação e usar.
- **RF-22:** Auto-criação de lead ao receber primeira mensagem de número desconhecido.
- **RF-23:** Histórico completo de conversas por lead.
- **RF-24:** Status de mensagem: enviada, entregue, lida.

### 4.4 Meta Conversions API (CAPI)

- **RF-25:** Configuração de Pixel ID e Access Token por conta.
- **RF-26:** Eventos suportados: `Lead`, `Contact`, `InitiateCheckout`, `Purchase`, `CompleteRegistration`.
- **RF-27:** Disparo automático de evento ao mover lead para estágio configurado.
- **RF-28:** Disparo manual de evento por lead a qualquer momento.
- **RF-29:** Hashing SHA-256 de dados pessoais antes do envio (telefone, e-mail).
- **RF-30:** Log de eventos enviados com status de resposta da Meta.
- **RF-31:** Deduplicação via `event_id` único por evento.

### 4.5 Ficha do Lead

- **RF-32:** Dados básicos editáveis: nome, telefone, e-mail, origem (campanha/conjunto/anúncio).
- **RF-33:** Linha do tempo completa: movimentações, mensagens, eventos CAPI, notas.
- **RF-34:** Campo de notas livres por lead.
- **RF-35:** Tags personalizadas por conta.
- **RF-36:** Valor do negócio (para cálculo de receita potencial no funil).

### 4.6 Captura e Entrada de Leads

- **RF-37:** Webhook para capturar leads do Meta Lead Ads automaticamente.
- **RF-38:** API pública por conta para receber leads de Landing Pages externas.
- **RF-39:** Cadastro manual de lead dentro do CRM.
- **RF-40:** Importação via CSV.

---

## 5. Motor de IA — Análise de Intenção por Janela de Conversa

Esta é a seção mais crítica do produto. O motor de IA é responsável por ler o histórico real de uma conversa e determinar, com base no contexto acumulado, qual é a intenção atual do lead — e se ele deve ser movido de estágio no pipeline. A análise não considera apenas a última mensagem: ela usa uma **janela deslizante de mensagens recentes** para capturar o contexto completo da negociação.

### 5.1 Por que Janela de Conversa, não Última Mensagem

Analisar apenas a última mensagem é insuficiente para detectar intenção com precisão. Leads raramente declaram sua intenção em uma única frase. O contexto se constrói ao longo de várias trocas.

| Abordagem | Mensagens analisadas | Resultado |
|---|---|---|
| Só última msg | Lead: *"ok"* | Impossível detectar intenção — pode ser concordância com qualquer coisa |
| Janela (13 msgs) | Vendedor: "Preço é R$500" → Lead: "tá caro" → Vendedor: "Posso fazer R$450" → Lead: "me manda o pix" → Lead: "ok" | IA detecta intenção de compra confirmada → move para **Convertido** |
| Só última msg | Lead: *"vou pensar"* | Ambíguo — pode ser desinteresse ou interesse real |
| Janela (8 msgs) | Lead perguntou sobre produto, pediu mais fotos, pediu valor, pediu prazo, depois disse "vou pensar" | IA detecta: lead altamente engajado → mantém em **Negociação**, não move para Perdido |

### 5.2 Definição da Janela de Conversa

A janela é o conjunto de **N mensagens mais recentes** de uma conversa, capturadas imediatamente antes da análise da IA.

| Parâmetro | Valor | Descrição |
|---|---|---|
| `window_size` padrão | 20 mensagens | Cobre a maioria das negociações sem exceder custo de tokens |
| `window_size` máximo | 40 mensagens | Configurável por conta para negociações longas |
| `window_size` mínimo | 3 mensagens | Abaixo disso, confidence forçado para 0 — IA não age |
| Direção | Mais recentes | Sempre as N mensagens mais recentes; as mais antigas são descartadas |
| Participantes | Ambos os lados | Mensagens do vendedor e do lead, com rótulo de quem enviou |
| Tipos suportados | Texto, áudio transcrito, placeholder para imagem/doc | Áudios passam por Whisper antes de entrar na janela |

### 5.3 Fluxo Completo de Análise

| Etapa | Descrição Detalhada |
|---|---|
| **Trigger** | Nova mensagem recebida ou enviada → evento publicado no Redis pub/sub (`channel: ai:analyze:{lead_id}`) |
| **Debounce** | AI Engine aguarda **8 segundos** após o último evento para aquele `lead_id` antes de iniciar. Se nova mensagem chegar nesse intervalo, o timer reinicia. Garante que mensagens em sequência rápida sejam analisadas juntas |
| **Busca da janela** | `SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT {window_size}` — resultado invertido para ordem cronológica |
| **Transcrição de áudio** | Para cada mensagem do tipo `audio`: download do MinIO → transcrição via Whisper API → substituição por texto na janela. Resultado cacheado no Redis por 24h |
| **Contexto do pipeline** | AI Engine busca os estágios da conta com descrições e o estágio atual do lead |
| **Montagem do prompt** | System prompt (regras + definição dos estágios) + user prompt (janela formatada + estágio atual + metadados) |
| **Chamada ao LLM** | POST para Anthropic Claude API. Timeout: 15s. Retry: 2 tentativas com backoff exponencial. Fallback: OpenAI GPT-4o-mini |
| **Parsing da resposta** | Extração e validação do JSON. Se inválido: logar erro, não agir, tentar na próxima mensagem |
| **Aplicação da decisão** | Se `action='move'` E `confidence >= threshold` (padrão 0.75): registrar `ai_action`, mover lead, disparar CAPI se configurado, enviar notificação push |
| **Log e auditoria** | Toda análise — incluindo as que resultam em `stay` — é registrada em `ai_analysis_log` com a janela usada, prompt enviado, resposta bruta e decisão final |

### 5.4 Formato da Janela no Prompt

As mensagens são formatadas com rótulo de direção, timestamp relativo e tipo de conteúdo:

```
=== HISTÓRICO DE CONVERSA (últimas 20 mensagens) ===

[há 2 dias] LEAD: Oi, vi o anúncio de vocês. Quanto custa o tratamento?
[há 2 dias] VENDEDOR: Olá! Fico feliz em te atender. O tratamento completo é R$1.200.
[há 2 dias] LEAD: Ai, tá meio caro pra mim agora
[há 2 dias] VENDEDOR: Entendo! Temos parcelamento em até 12x sem juros. Fica R$100/mês.
[há 1 dia]  LEAD: Hmm, que dias vocês têm disponível?
[há 1 dia]  VENDEDOR: Temos terça e quinta, manhã ou tarde. Qual prefere?
[há 1 dia]  LEAD: Quinta de manhã seria bom
[há 1 dia]  VENDEDOR: Perfeito! Você prefere às 9h ou às 11h?
[há 5h]     LEAD: 9h tá ótimo
[há 5h]     VENDEDOR: Maravilha! Para confirmar, preciso de um sinal de R$200.
[há 3h]     LEAD: Tudo bem, me manda os dados do pix
[há 3h]     VENDEDOR: [enviou uma imagem]
[agora]     LEAD: Mandei o pix, pode confirmar?

=== FIM DO HISTÓRICO ===
```

### 5.5 System Prompt Completo

```
Você é um assistente especializado em análise de intenção de compra para um CRM de vendas
brasileiro. Sua função é analisar conversas de WhatsApp entre um vendedor e um potencial
cliente (lead) e determinar em qual estágio do funil de vendas este lead se encontra.

## ESTÁGIOS DO PIPELINE (da conta {account_id}):
{lista_dinamica_de_estagios_com_descricao}

Exemplo:
- NOVO LEAD: Lead acabou de entrar, ainda não houve contato real.
- CONTATO FEITO: Lead respondeu ao primeiro contato do vendedor.
- EM NEGOCIAÇÃO: Lead demonstrou interesse real, discutindo produto/preço/condições.
- PROPOSTA ENVIADA: Vendedor enviou proposta formal ou valor específico foi acordado.
- CONVERTIDO: Lead confirmou compra, enviou pagamento ou agendou serviço.
- PERDIDO: Lead declarou claramente que não tem interesse ou parou de responder.

## ESTÁGIO ATUAL DO LEAD: {estagio_atual}

## REGRAS DE ANÁLISE:
1. Analise TODA a janela de conversa, não apenas a última mensagem.
2. Dê peso maior às mensagens mais recentes, mas considere o contexto completo.
3. Só mova o lead para estágio mais avançado se houver evidência clara e consistente.
4. Só mova para PERDIDO se o lead declarou explicitamente desinteresse.
5. "Vou pensar" ou silêncio NÃO é evidência suficiente para mover para Perdido.
6. Nunca mova para estágio anterior sem evidência forte de regressão.
7. Em caso de dúvida, prefira action='stay' a uma movimentação incorreta.
8. O campo 'reason' deve ser em português, claro e objetivo (máx. 120 caracteres).
9. O campo 'evidence' deve citar trecho real da conversa que motivou a decisão.

## FORMATO DE RESPOSTA (JSON puro, sem markdown, sem texto adicional):
{
  "action": "move" | "stay",
  "target_stage": "nome_exato_do_estagio",
  "reason": "motivo da decisão em português",
  "evidence": "trecho da conversa que motivou",
  "confidence": 0.0 a 1.0,
  "sentiment": "positivo" | "neutro" | "negativo",
  "urgency": "alta" | "media" | "baixa"
}
```

### 5.6 Interpretação dos Campos de Retorno

| Campo | Tipo | Uso no Sistema |
|---|---|---|
| `action` | `"move"` \| `"stay"` | Decisão principal. Se `stay`, nenhuma ação é tomada no pipeline |
| `target_stage` | string | Nome exato do estágio destino. Validado contra os estágios reais da conta |
| `reason` | string | Exibido na notificação para o usuário e no log de IA |
| `evidence` | string | Trecho da conversa citado. Exibido no log para auditoria |
| `confidence` | float 0–1 | `< 0.60`: ignora; `0.60–0.74`: sugere sem agir; `>= 0.75`: age automaticamente |
| `sentiment` | enum | Exibido no card do lead como indicador de humor. Não afeta o pipeline |
| `urgency` | enum | `alta` dispara notificação push prioritária para o vendedor |

### 5.7 Thresholds de Confiança e Comportamento

| Faixa | Comportamento |
|---|---|
| `confidence < 0.60` | **Ignorar.** IA não tem informação suficiente. Nenhuma ação, nenhuma notificação |
| `0.60 ≤ confidence < 0.75` | **Sugestão silenciosa.** Grava em `ai_actions` com `status='suggestion'`. Exibe badge discreto no card: *"IA sugere mover para X"*. Usuário decide |
| `confidence ≥ 0.75` | **Ação automática.** Lead movido. Notificação push: *"IA moveu [Nome] para [Estágio] — Toque para desfazer"* |
| `confidence = 1.0` | **Alta certeza** (ex: comprovante de pagamento). Movimento imediato + disparo CAPI + notificação prioritária |

### 5.8 Debounce e Controle de Frequência

- **Debounce (8s):** após a chegada de uma nova mensagem, o AI Engine aguarda 8 segundos antes de analisar. Se uma nova mensagem chegar nesse intervalo, o timer reinicia. Garante que mensagens em sequência rápida sejam analisadas juntas como uma unidade de contexto.
- **Cooldown por lead (30min):** após uma ação da IA (move ou suggestion), o AI Engine não analisa aquele lead novamente por 30 minutos. Evita oscilações no pipeline.
- **Rate limit por conta:** máximo de 100 análises de IA por conta por hora. Acima disso, as análises são enfileiradas e processadas com delay via BullMQ.
- **Janela mínima:** se a conversa tiver menos de 3 mensagens, `confidence = 0` é retornado automaticamente sem chamar o LLM.

### 5.9 Transcrição de Áudio (Pré-processamento)

Mensagens de áudio são comuns no WhatsApp brasileiro e frequentemente carregam intenção. O AI Engine transcreve áudios antes de incluí-los na janela de análise.

- **Serviço:** OpenAI Whisper API (`whisper-1`). Custo: ~$0.006/minuto de áudio.
- **Fluxo:** recebimento do áudio → download do MinIO → POST para Whisper API → texto retornado → cache no Redis por 24h com chave `message:{id}:transcript`.
- **Limite:** áudios acima de 5 minutos são truncados para controle de custo.
- **Fallback:** se transcrição falhar, a mensagem entra na janela como `[Áudio — transcrição indisponível]`. A IA ainda infere engajamento pelo fato de o lead ter enviado um áudio.
- **Privacidade:** arquivos de áudio nunca são enviados ao LLM principal — apenas o texto transcrito.

### 5.10 Detecção de Intenções Específicas

Além de movimentar estágio, o AI Engine detecta intenções que geram ações adicionais no CRM:

| Intenção Detectada | Gatilho na Conversa | Ação no CRM |
|---|---|---|
| Pedido de preço | Lead pergunta valor, parcelas ou condições de pagamento | Tag `perguntou-preco` adicionada ao lead |
| Pedido de agendamento | Lead menciona data, horário ou pergunta disponibilidade | Tag `quer-agendar` + notificação urgente ao vendedor |
| Objeção de preço | Lead menciona que está caro ou pede desconto | Tag `objecao-preco` + notificação para o vendedor oferecer condição especial |
| Comparação com concorrente | Lead menciona outro fornecedor ou produto concorrente | Tag `avaliando-concorrencia` + notificação urgente |
| Desistência implícita | Lead para de responder por 48h após engajamento ativo | Tag `sem-resposta-48h` + sugestão de template de reativação |
| Confirmação de pagamento | Lead menciona PIX, transferência ou envia comprovante | `confidence = 1.0` forçado → move para **Convertido** imediatamente |
| Indicação de terceiro | Lead menciona "minha amiga também quer" ou "vou indicar" | Tag `possivel-indicacao` — oportunidade de follow-up |

### 5.11 Score de Engajamento

O AI Engine calcula, a cada análise, um score de engajamento (0–100) exibido como badge visual no card do lead.

```
Score de Engajamento — calculado a partir de:

  PONTOS POSITIVOS:
  + Velocidade de resposta do lead (< 1h = alto engajamento)
  + Tamanho das mensagens do lead (mensagens longas = mais interesse)
  + Número de perguntas feitas pelo lead
  + Palavras de interesse: preço, parcela, quando, disponível, horário
  + Envio de mídia pelo lead (foto, áudio, documento)

  PONTOS NEGATIVOS:
  - Mensagens monossilábicas consecutivas ("ok", "entendi", "certo")
  - Aumento no tempo de resposta nas últimas mensagens
  - Palavras de desistência: caro, sem dinheiro, já comprei, não preciso

  BADGES:
  🔥 Score 80–100: "Quente"         → badge vermelho
     Score 50–79:  "Ativo"          → badge amarelo
     Score 20–49:  "Esfriando"      → badge cinza
  ❄  Score 0–19:   "Frio"           → badge azul + notificação ao vendedor
```

### 5.12 Tabelas de Banco de Dados — AI Engine

| Tabela | Campos Principais |
|---|---|
| `ai_analysis_log` | `id, lead_id, conversation_id, window_size, messages_json, prompt_tokens, completion_tokens, raw_response, parsed_json, action_taken, confidence, sentiment, urgency, engagement_score, created_at` |
| `ai_actions` | `id, lead_id, from_stage_id, to_stage_id, trigger_evidence, reason, confidence, status [pending\|accepted\|reverted\|auto_applied], created_at, resolved_at` |
| `lead_engagement` | `id, lead_id, score (0-100), last_calculated_at, trend [rising\|stable\|falling]` |
| `lead_intent_tags` | `id, lead_id, intent_type, detected_at, message_excerpt` |
| `audio_transcriptions` | `id, message_id, transcript_text, whisper_confidence, cached_at` |

### 5.13 Custo Estimado de IA por Conta

Estimativa mensal para uma conta com **200 leads ativos:**

| Item | Valor |
|---|---|
| Análises por mês | 200 leads × ~15 msgs/lead × 3 análises = ~9.000 chamadas |
| Tokens por análise | ~1.500 input + ~200 output = 1.700 tokens/análise |
| Total de tokens | ~15.300.000 input + ~1.800.000 output |
| Custo Claude Sonnet | ~$0.004/1k input + ~$0.012/1k output ≈ **~$83/mês** por conta intensa |
| Custo GPT-4o-mini | ~70% mais barato que Sonnet para volume alto |

> **Recomendação:** implementar rate limiting por conta e incluir o custo de IA no pricing dos planos da agência.

---

## 6. Modelo de Dados Completo

| Tabela | Campos Principais |
|---|---|
| `accounts` | `id, name, logo_url, plan, agency_id, created_at` |
| `users` | `id, account_id, email, password_hash, role [owner\|admin], created_at` |
| `whatsapp_configs` | `id, account_id, phone_number_id, waba_id, access_token_enc, verify_token, status` |
| `meta_capi_configs` | `id, account_id, pixel_id, access_token_enc, test_event_code` |
| `pipelines` | `id, account_id, name, is_default` |
| `pipeline_stages` | `id, pipeline_id, name, order_index, color, capi_event_trigger` |
| `leads` | `id, account_id, stage_id, name, phone, email, source_campaign, source_adset, source_ad, deal_value, created_at, updated_at` |
| `lead_tags` | `id, lead_id, tag_name` |
| `conversations` | `id, lead_id, account_id, wa_conversation_id, last_message_at` |
| `messages` | `id, conversation_id, direction [inbound\|outbound], type [text\|image\|audio\|document], content, wa_message_id, status [sent\|delivered\|read], created_at` |
| `ai_analysis_log` | `id, lead_id, window_size, messages_json, raw_response, parsed_json, confidence, sentiment, urgency, engagement_score, created_at` |
| `ai_actions` | `id, lead_id, from_stage_id, to_stage_id, trigger_evidence, reason, confidence, status, created_at` |
| `lead_engagement` | `id, lead_id, score, last_calculated_at, trend` |
| `lead_intent_tags` | `id, lead_id, intent_type, detected_at, message_excerpt` |
| `audio_transcriptions` | `id, message_id, transcript_text, whisper_confidence, cached_at` |
| `capi_events` | `id, lead_id, event_name, event_time, event_id, payload_json, meta_response, created_at` |
| `lead_timeline` | `id, lead_id, type, description, actor [user\|ai\|system], created_at` |
| `wa_templates` | `id, account_id, name, language, category, body_text, status [pending\|approved\|rejected]` |

---

## 7. Stack Tecnológica

| Camada | Tecnologia e Detalhes |
|---|---|
| **Frontend** | Next.js 14 (App Router) + TailwindCSS + shadcn/ui + dnd-kit + PWA (next-pwa). Realtime via WebSocket (Socket.io ou SSE) |
| **Backend API** | Node.js 20 + Fastify + Prisma ORM. JWT para auth. BullMQ para filas (Redis) |
| **AI Engine** | Python 3.12 + FastAPI. SDK Anthropic (primário) + SDK OpenAI (fallback + Whisper) |
| **Banco de Dados** | PostgreSQL 16 — container Docker, volume persistente na VPS |
| **Cache + Filas** | Redis 7 — container Docker, AOF habilitado. BullMQ para processamento assíncrono |
| **Object Storage** | MinIO self-hosted (S3-compatible). SDK AWS S3 aponta para MinIO |
| **Containerização** | Docker + Docker Compose. Gerenciamento via Easypanel |
| **Reverse Proxy** | Traefik (embutido no Easypanel) + Let's Encrypt automático |
| **CI/CD** | GitHub Actions → build → notifica Easypanel webhook → redeploy |
| **Monitoramento** | Uptime Kuma + Dozzle + Netdata (containers no Easypanel) |
| **WhatsApp** | WhatsApp Cloud API (Meta). Embedded Signup para onboarding dos clientes |
| **Meta CAPI** | Graph API v19+ endpoint `/events`. SHA-256 hashing de `user_data` |

---

## 8. Plano de Desenvolvimento MVP → V1

### Fase 1 — Fundação (Semanas 1–3)
**MVP Core**

- Setup VPS Hostinger + instalação Easypanel + configuração Traefik e domínios
- Containers base: PostgreSQL, Redis, MinIO
- Schema do banco completo com Prisma + RLS
- Auth: login, magic link, isolamento multi-tenant
- CRM Core: CRUD de leads, pipeline Kanban
- Frontend mobile-first: layout, navegação, telas de pipeline e ficha do lead

### Fase 2 — WhatsApp (Semanas 4–6)
**Integração WhatsApp**

- Embedded Signup: fluxo de conexão do WhatsApp (< 3 minutos)
- Webhook receiver com validação de assinatura `X-Hub-Signature-256`
- Fila BullMQ: processamento assíncrono de mensagens
- Chat UI: tela de conversa, envio/recebimento
- Armazenamento de mídias no MinIO
- Templates HSM: criação e uso

### Fase 3 — AI Engine (Semanas 7–10)
**Motor de IA — Janela de Conversa**

- Serviço Python + FastAPI no Easypanel
- Implementação do sistema de janela deslizante (`window_size` configurável)
- Debounce (8s) e cooldown por lead (30min)
- Integração Anthropic Claude API + OpenAI fallback
- Transcrição de áudios via Whisper API + cache Redis
- Tabelas: `ai_analysis_log`, `ai_actions`, `lead_engagement`, `lead_intent_tags`
- Score de engajamento e detecção de intenções específicas
- UI: badge de ação da IA no card, notificação push, banner "desfazer"
- Log completo de decisões da IA acessível pelo usuário

### Fase 4 — Meta CAPI (Semanas 11–12)
**Conversões Meta**

- CAPI Service: integração com endpoint da Meta
- Hashing SHA-256 de dados pessoais
- Disparo automático por estágio + manual pela UI
- Log de eventos com status da resposta da Meta
- Deduplicação via `event_id` único

### Fase 5 — Polimento + Admin (Semana 13)
**Admin + QA**

- Painel administrativo da agência
- PWA: manifest e service worker
- Testes E2E com Playwright
- Documentação de onboarding para novos clientes
- Ajustes de performance e UX mobile
- Configuração de backups automáticos no Easypanel (diário + semanal)

---

## 9. Variáveis de Ambiente

> Todas configuradas no Easypanel por serviço. **Nunca commitadas no repositório.**

| Variável | Valor / Descrição | Serviço(s) |
|---|---|---|
| `DATABASE_URL` | `postgresql://user:pass@postgres:5432/crm` | crm-api, crm-whatsapp |
| `REDIS_URL` | `redis://redis:6379` | todos os serviços |
| `MINIO_ENDPOINT` | `http://minio:9000` | crm-api, crm-whatsapp, crm-ai |
| `MINIO_ACCESS_KEY` | chave de acesso do MinIO | crm-api, crm-whatsapp, crm-ai |
| `MINIO_SECRET_KEY` | chave secreta do MinIO | crm-api, crm-whatsapp, crm-ai |
| `JWT_SECRET` | string aleatória 64 chars | crm-api |
| `ENCRYPTION_KEY` | chave AES-256 para tokens dos clientes | crm-api |
| `WHATSAPP_APP_ID` | App ID do Meta for Developers | crm-whatsapp |
| `WHATSAPP_APP_SECRET` | App Secret (nunca exposto no frontend) | crm-whatsapp |
| `WHATSAPP_VERIFY_TOKEN` | token de verificação do webhook | crm-whatsapp |
| `ANTHROPIC_API_KEY` | chave Anthropic Claude | crm-ai |
| `OPENAI_API_KEY` | chave OpenAI (fallback + Whisper) | crm-ai |
| `AI_WINDOW_SIZE` | `20` (padrão) | crm-ai |
| `AI_CONFIDENCE_THRESHOLD` | `0.75` | crm-ai |
| `AI_DEBOUNCE_SECONDS` | `8` | crm-ai |
| `AI_COOLDOWN_MINUTES` | `30` | crm-ai |
| `NEXT_PUBLIC_API_URL` | `https://api.seucrm.com.br` | crm-frontend |
| `NEXT_PUBLIC_WS_URL` | `wss://api.seucrm.com.br` | crm-frontend |
| `SENTRY_DSN` | DSN do Sentry (opcional) | crm-api, crm-frontend |

---

## 10. Pontos de Atenção e Observações Finais

### 10.1 Pontos Críticos de Desenvolvimento

> Atenção especial durante o desenvolvimento:

- **Janela de 24h do WhatsApp:** após 24h sem resposta do lead, só é possível usar templates aprovados. O CRM deve alertar o usuário e sugerir template de reativação.
- **Segurança dos tokens:** tokens da WhatsApp API e da CAPI são criptografados com AES-256 no banco. Nunca expostos em logs ou respostas de API.
- **Custo da IA:** implementar rate limiting por conta. Monitorar consumo via `ai_analysis_log`. Considerar custo no pricing dos planos.
- **Backup da VPS:** além dos backups de container, habilitar snapshots automáticos da VPS na Hostinger (plano KVM suporta).
- **LGPD:** dados de leads são dados pessoais. Implementar política de retenção, exportação e exclusão.
- **Deduplicação CAPI:** usar `event_id` único para evitar dupla contagem no Gerenciador de Anúncios.
- **Escalabilidade:** com crescimento, é possível migrar PostgreSQL para instância gerenciada sem mudar código (Prisma é agnóstico ao host).

### 10.2 Fora do Escopo (V1)

- Multiusuário dentro de uma conta (multi-atendentes)
- Chatbot com resposta automática (apenas classificação de intenção, não resposta automática)
- Integração com Google Ads ou TikTok Ads
- App nativo iOS/Android (PWA cobre o mobile)
- Relatórios de BI avançados
- Sequências de mensagens automáticas (automação de marketing)

### 10.3 APIs Externas e Credenciais Necessárias

**WhatsApp Business Platform**
- Criar app do tipo "Business" no Meta for Developers
- Habilitar produto WhatsApp no app
- Configurar Embedded Signup para onboarding self-service dos clientes
- Solicitar acesso à API de produção (review da Meta necessária para múltiplos clientes)

**Meta Conversions API**
- Cada cliente configura seu próprio Pixel ID e Access Token de Marketing API
- Token deve ter permissão: `ads_management`, `business_management`
- Recomendado: usar System User Token (não expira)
- Testar via Events Manager > Test Events antes de produção

**Anthropic (Claude)**
- Conta em console.anthropic.com
- Modelo recomendado: `claude-sonnet-4-20250514`
- Variável: `ANTHROPIC_API_KEY`

**OpenAI (fallback + Whisper)**
- Conta em platform.openai.com
- Modelos: `gpt-4o-mini` (fallback LLM) + `whisper-1` (transcrição de áudio)
- Variável: `OPENAI_API_KEY`

---

*Este documento é a referência técnica completa para o desenvolvimento da solução. Versão 2.0 — Maio/2026.*
