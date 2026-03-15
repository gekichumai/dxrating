# Build stage
FROM node:25-bookworm-slim AS builder

# Install dependencies needed for native modules (sharp, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    libcairo2-dev \
    libjpeg-dev \
    libpango1.0-dev \
    libgif-dev \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN npm install -g pnpm@10.30.3

WORKDIR /app

# Copy root workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./

# Copy workspace package.json files
COPY packages/tsconfig/package.json ./packages/tsconfig/
COPY packages/dxdata/package.json ./packages/dxdata/
COPY apps/backend/package.json ./apps/backend/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy workspace source files
COPY packages/tsconfig ./packages/tsconfig
COPY packages/dxdata ./packages/dxdata
COPY apps/backend ./apps/backend

# Bundle the backend with esbuild (fast transpilation, type-checking done in CI)
WORKDIR /app/apps/backend
RUN pnpm build:bundle

# Production stage
FROM node:25-bookworm-slim AS runner

# Install runtime dependencies for sharp and other native modules
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2 \
    libjpeg62-turbo \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgif7 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN npm install -g pnpm@10.30.3

WORKDIR /app

# Copy root workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./

# Copy workspace package.json files
COPY packages/tsconfig/package.json ./packages/tsconfig/
COPY packages/dxdata/package.json ./packages/dxdata/
COPY apps/backend/package.json ./apps/backend/

# Install production dependencies only
RUN pnpm install --filter @gekichumai/backend --prod --frozen-lockfile

# Copy built application from builder
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder /app/packages ./packages

# Copy necessary runtime files
COPY apps/backend/drizzle ./apps/backend/drizzle

WORKDIR /app/apps/backend

# Expose port
EXPOSE 3000

# Set environment variables
ARG GIT_COMMIT=unknown
ENV NODE_ENV=production
ENV GIT_COMMIT=${GIT_COMMIT}

# Copy entrypoint script
COPY apps/backend/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

# Start the application (--experimental-transform-types needed for dxdata's TypeScript enums)
CMD ["./docker-entrypoint.sh"]
