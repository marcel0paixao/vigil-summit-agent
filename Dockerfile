FROM node:22-bookworm-slim AS node-base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /workspace

RUN apt-get update \
  && apt-get install --no-install-recommends -y openssl \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@10.0.0 --activate

FROM node-base AS node-build

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/execution-worker/package.json ./apps/execution-worker/package.json
COPY apps/observability-service/package.json ./apps/observability-service/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/workflow-service/package.json ./apps/workflow-service/package.json
COPY packages/config/package.json ./packages/config/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/logger/package.json ./packages/logger/package.json

RUN pnpm install --frozen-lockfile

COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts

RUN pnpm --filter @flowpilot/api prisma:generate \
  && pnpm --filter @flowpilot/contracts --filter @flowpilot/config --filter @flowpilot/logger build \
  && pnpm --filter @flowpilot/api --filter @flowpilot/execution-worker build

ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN pnpm --filter @flowpilot/web build

FROM node-base AS runtime

ENV NODE_ENV=production
ENV API_HOST=0.0.0.0
ENV API_PORT=10000
WORKDIR /workspace

COPY --from=node-build /workspace /workspace

EXPOSE 10000
CMD ["node", "apps/api/dist/main.js"]
