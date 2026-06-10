FROM node:22-slim AS base
RUN npm install -g pnpm@11.5.0
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

FROM base AS builder
WORKDIR /app
COPY . .
RUN pnpm install --no-frozen-lockfile --ignore-scripts
RUN pnpm rebuild esbuild @prisma/client @prisma/engines prisma msgpackr-extract sharp unrs-resolver
RUN pnpm --filter @crm/database build
RUN pnpm --filter @crm/types build
RUN pnpm --filter crm-api build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/api ./apps/api
COPY --from=builder /app/package.json ./package.json

EXPOSE 4000
CMD ["pnpm", "--filter", "crm-api", "start"]