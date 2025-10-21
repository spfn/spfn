# Multi-stage Dockerfile for Next.js (apps/landing)
# Optimized for production with standalone output

# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app

# Install pnpm
RUN corepack enable pnpm

# Copy dependency files
COPY package.json pnpm-lock.yaml* ./

# Install dependencies (production + dev for build)
RUN pnpm install --frozen-lockfile

# Stage 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app

# Install pnpm
RUN corepack enable pnpm

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy source code
COPY . .

# Build Next.js app (standalone mode)
ENV NEXT_TELEMETRY_DISABLED=1
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

# Copy standalone output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3790

# Set port environment variable
ENV PORT=3790

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3790', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start Next.js server
CMD ["node", "server.js"]