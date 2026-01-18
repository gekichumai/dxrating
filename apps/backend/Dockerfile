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

# Enable Corepack and set yarn version
RUN corepack enable && corepack prepare yarn@4.4.1 --activate

WORKDIR /app

# Copy root workspace files
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn ./.yarn

# Copy workspace package.json files
COPY packages/tsconfig/package.json ./packages/tsconfig/
COPY packages/dxdata/package.json ./packages/dxdata/
COPY apps/backend/package.json ./apps/backend/

# Install dependencies
RUN yarn install --immutable

# Copy workspace source files
COPY packages/tsconfig ./packages/tsconfig
COPY packages/dxdata ./packages/dxdata
COPY apps/backend ./apps/backend

# Build the backend
WORKDIR /app/apps/backend
RUN yarn build

# Production stage
FROM node:25-bookworm-slim AS runner

# Install runtime dependencies for sharp and other native modules
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2 \
    libjpeg62-turbo \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgif7 \
    && rm -rf /var/lib/apt/lists/*

# Enable Corepack and set yarn version
RUN corepack enable && corepack prepare yarn@4.4.1 --activate

WORKDIR /app

# Copy root workspace files
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn ./.yarn

# Copy workspace package.json files
COPY packages/tsconfig/package.json ./packages/tsconfig/
COPY packages/dxdata/package.json ./packages/dxdata/
COPY apps/backend/package.json ./apps/backend/

# Install production dependencies only
RUN yarn workspaces focus @gekichumai/backend --production

# Copy built application from builder
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder /app/packages ./packages

# Copy necessary runtime files
COPY apps/backend/drizzle ./apps/backend/drizzle

WORKDIR /app/apps/backend

# Expose port
EXPOSE 3000

# Set environment variable
ENV NODE_ENV=production

# Start the application
CMD ["node", "dist/index.js"]
