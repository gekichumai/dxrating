# admin-api (gekichumai/meta#50 L3). Same base image as apps/backend.
FROM node:26.12.1-bookworm-slim@sha256:b3dbaf0531ffedead011f14afc779688202fc975f89d2cebf2a63e8beed89e8a AS builder
RUN npm install -g pnpm@10.33.0
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY patches ./patches
# Workspace packages admin-api bundles in (the backend's schema and edge-cache modules, the shared contract)
COPY packages/tsconfig/package.json ./packages/tsconfig/
COPY packages/api-contract/package.json ./packages/api-contract/
COPY packages/dxdata/package.json ./packages/dxdata/
COPY packages/maimai-domain/package.json ./packages/maimai-domain/
COPY packages/oneshot-renderer/package.json ./packages/oneshot-renderer/
COPY apps/backend/package.json ./apps/backend/
COPY apps/admin-api/package.json ./apps/admin-api/
RUN pnpm install --filter @gekichumai/admin-api... --frozen-lockfile --ignore-scripts
COPY packages ./packages
COPY apps/backend ./apps/backend
COPY apps/admin-api ./apps/admin-api
WORKDIR /app/apps/admin-api
RUN pnpm build:bundle

FROM node:26.12.1-bookworm-slim@sha256:b3dbaf0531ffedead011f14afc779688202fc975f89d2cebf2a63e8beed89e8a AS runner
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@10.33.0
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY patches ./patches
COPY packages/tsconfig/package.json ./packages/tsconfig/
COPY apps/admin-api/package.json ./apps/admin-api/
RUN pnpm install --filter @gekichumai/admin-api --prod --frozen-lockfile
COPY --from=builder /app/apps/admin-api/dist ./apps/admin-api/dist
WORKDIR /app/apps/admin-api
ARG GIT_COMMIT=unknown
ENV NODE_ENV=production
ENV GIT_COMMIT=${GIT_COMMIT}
USER node
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s CMD curl -fsS http://localhost:3100/health || exit 1
CMD ["node", "--enable-source-maps", "dist/index.js"]
