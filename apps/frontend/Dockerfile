FROM node:22-slim AS base
RUN npm install -g pnpm@11.5.0
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

FROM base AS dependencies
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/database/package.json ./packages/database/
COPY packages/types/package.json ./packages/types/
COPY apps/frontend/package.json ./apps/frontend/
RUN pnpm install --no-frozen-lockfile --ignore-scripts
RUN pnpm rebuild esbuild @prisma/client @prisma/engines prisma msgpackr-extract sharp

FROM dependencies AS builder
WORKDIR /app
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
COPY . .
RUN pnpm --filter @crm/database build
RUN pnpm --filter @crm/types build
RUN pnpm --filter crm-frontend build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/frontend ./apps/frontend
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000
CMD ["pnpm", "--filter", "crm-frontend", "start"]