# Production Dockerfile for SPFN
FROM node:20-alpine

WORKDIR /app

# Install pnpm
RUN corepack enable pnpm

# Copy dependency files
COPY package.json pnpm-lock.yaml* ./

# Install dependencies
RUN pnpm install --frozen-lockfile --prod=false

# Copy source code
COPY . .

# Build application
RUN pnpm run spfn:build

# Remove dev dependencies (optional, reduces image size)
RUN pnpm prune --prod

# Environment
ENV NODE_ENV=production

# Expose ports
EXPOSE 3790 8790

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8790/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application
CMD ["pnpm", "run", "spfn:start"]
