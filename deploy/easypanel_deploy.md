# Guia de Deploy no Easypanel (Hostinger VPS)

Este guia ensina o passo a passo para colocar o **CRM de Conversão** em produção utilizando o painel **Easypanel** rodando na sua VPS Hostinger.

O projeto é estruturado como um monorepo e está preparado para rodar via Docker. Nós criamos os Dockerfiles dedicados para cada serviço:
- API (Fastify): `apps/api/Dockerfile`
- Frontend (Next.js): `apps/frontend/Dockerfile`

---

## Passo 1: Criar os Serviços Auxiliares (Banco e Redis)

Antes de rodar a API e o Frontend, precisamos do banco de dados PostgreSQL e da fila Redis. No Easypanel, você cria isso em segundos:

### 1. Criar o PostgreSQL
1. No dashboard do seu projeto no Easypanel, clique em **+ Service** e selecione **Database**.
2. Escolha **PostgreSQL**.
3. Defina o nome (ex: `postgres-db`).
4. Clique em **Create**.
5. Vá na aba **Connection** do PostgreSQL criado e anote a URL de conexão interna (ex: `postgres://postgres:senha@postgres-db:5432/postgres` ou similar). 
   > [!TIP]
   > Use a conexão interna do Easypanel para que o tráfego não passe pela internet, tornando-o extremamente rápido e seguro.

### 2. Criar o Redis
1. Clique em **+ Service** → **Database**.
2. Escolha **Redis**.
3. Defina o nome (ex: `redis-queue`).
4. Clique em **Create**.
5. Anote a URL interna (ex: `redis://redis-queue:6379`).

---

## Passo 2: Configurar e Fazer Deploy da API (`crm-api`)

A API roda na porta 4000 interna e conecta ao Postgres e ao Redis.

1. No Easypanel, clique em **+ Service** → **App**.
2. Defina o nome como `crm-api`.
3. Na aba **Source** (Origem):
   - **Repository**: Cole a URL do seu repositório Git (ex: `https://github.com/usuario/repo`).
   - **Branch**: `main` (ou a branch que deseja usar).
4. Na aba **Build**:
   - **Build Method**: Selecione `Dockerfile`.
   - **Dockerfile Path**: `apps/api/Dockerfile`
   - **Context Path**: `/` (isso é crucial para que o monorepo pnpm consiga buscar a raiz).
5. Na aba **Environment** (Variáveis de Ambiente), configure:
   - `PORT`: `4000`
   - `DATABASE_URL`: URL interna do PostgreSQL anotada anteriormente.
   - `REDIS_URL`: URL interna do Redis anotada anteriormente (ex: `redis://redis-queue:6379`).
   - `JWT_SECRET`: Uma chave secreta longa e aleatória.
   - `ENCRYPTION_KEY`: Uma chave de exatamente 32 caracteres (usada para encriptar as chaves de API das LLMs no banco).
   - `AI_DEBOUNCE_MS`: `8000` (padrão: 8 segundos de debounce).
   - `AI_COOLDOWN_MS`: `1800000` (padrão: 30 minutos de cooldown por lead).
   - *Opcional*: Se quiser usar chaves de API globais direto pelo arquivo `.env`, você pode colocar `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` ou `GEMINI_API_KEY` aqui também. Caso contrário, você poderá configurá-las no painel do administrador `/settings`.
6. Na aba **Domains**:
   - Adicione o domínio/subdomínio que você deseja apontar para a API (ex: `api.seu-dominio.com`). O Easypanel irá gerar o certificado SSL/HTTPS automaticamente!
7. Clique em **Save** e depois em **Deploy**.

### Rodando o database push (Prisma)
Após o primeiro deploy da API, você precisa sincronizar o schema com o banco PostgreSQL.
Você pode rodar isso localmente apontando temporariamente para o banco da VPS (se exposto), ou diretamente abrindo o terminal do container da API no Easypanel (aba **Console** no painel do serviço `crm-api`):
```bash
pnpm --filter @crm/database db:push
```

---

## Passo 3: Configurar e Fazer Deploy do Frontend (`crm-frontend`)

O Next.js precisa saber o endereço público da API durante o build time para compilar as chamadas SSE e requisições HTTP.

1. No Easypanel, clique em **+ Service** → **App**.
2. Defina o nome como `crm-frontend`.
3. Na aba **Source**:
   - **Repository**: A mesma URL do repositório Git.
   - **Branch**: `main`.
4. Na aba **Build**:
   - **Build Method**: Selecione `Dockerfile`.
   - **Dockerfile Path**: `apps/frontend/Dockerfile`
   - **Context Path**: `/` (novamente, essencial).
   - **Build Args**: Adicione um argumento de build:
     - Chave: `NEXT_PUBLIC_API_URL`
     - Valor: URL pública HTTPS da sua API (ex: `https://api.seu-dominio.com`).
5. Na aba **Environment**:
   - `PORT`: `3000`
   - `NODE_ENV`: `production`
   - `NEXT_PUBLIC_API_URL`: `https://api.seu-dominio.com` (a mesma URL pública).
6. Na aba **Domains**:
   - Adicione o domínio público para o sistema (ex: `crm.seu-dominio.com`).
7. Clique em **Save** e depois em **Deploy**.

---

## Passo 4: Configurar o Webhook no Painel Meta (WhatsApp)

1. No painel de desenvolvedores da Meta, acesse seu App do WhatsApp.
2. Em **Webhooks**, clique em configurar.
3. Cole a URL de callback: `https://api.seu-dominio.com/api/webhooks/whatsapp`
4. Use o mesmo token de verificação que você definiu no `.env`/Environment da API (`WHATSAPP_VERIFY_TOKEN`).
5. Assine os campos de mensagens (`messages`) para receber os chats em tempo real.

---

## Pronto! 🚀
Agora o seu sistema estará 100% online no seu próprio servidor da Hostinger, com certificado SSL, conexão segura interna entre banco/Redis/API e escalabilidade automatizada via Docker.
