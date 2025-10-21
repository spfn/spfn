# Multi-stage Dockerfile for Next.js (apps/landing)
# Optimized for production with standalone output in turborepo

# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app

# Install pnpm
RUN corepack enable pnpm

# Copy turborepo config files
COPY pnpm-workspace.yaml ./
COPY pnpm-lock.yaml ./
COPY package.json ./

# Copy app package.json
COPY apps/landing/package.json ./apps/landing/

# Install dependencies (production + dev for build)
RUN pnpm install --frozen-lockfile

# Stage 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app

# Install pnpm
RUN corepack enable pnpm

# Copy dependencies from deps stage (includes node_modules for all workspace packages)
COPY --from=deps /app ./

# Copy entire workspace source code
COPY . .

# Build Next.js app (standalone mode) - build from apps/landing
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app/apps/landing
RUN pnpm run build

# Stage 3: Runner (Production)
FROM node:20-alpine AS runner
WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone output (includes full monorepo structure)
COPY --from=builder --chown=nextjs:nodejs /app/apps/landing/.next/standalone ./
# Copy static assets
COPY --from=builder --chown=nextjs:nodejs /app/apps/landing/.next/static ./apps/landing/.next/static
# Copy public folder
COPY --from=builder --chown=nextjs:nodejs /app/apps/landing/public ./apps/landing/public

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3790

# Set port environment variable
ENV PORT=3790
ENV HOSTNAME="0.0.0.0"

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3790', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start Next.js server from apps/landing
CMD ["node", "apps/landing/server.js"]