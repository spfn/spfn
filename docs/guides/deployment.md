---
title: "Deployment"
description: "Learn how to deploy Superfunction applications using Docker"
order: 4
available: true
---

# Deployment

Superfunction applications are designed to be deployed using Docker, providing consistent environments across development and production.

## Prerequisites

- Docker and Docker Compose installed
- PostgreSQL 16+ (provided via Docker)
- Redis 7+ (optional, provided via Docker for caching/sessions)
- Node.js 22+ (for local development)

## Docker Compose Setup

Superfunction provides a pre-configured `docker-compose.yml` for running PostgreSQL and Redis. Redis is optional and can be removed if you don't need caching or session storage:

```yaml
# docker-compose.yml
version: '3.8'

services:
  # PostgreSQL
  postgres:
    image: postgres:16-alpine
    container_name: spfn-postgres
    environment:
      POSTGRES_USER: spfn
      POSTGRES_PASSWORD: spfn
      POSTGRES_DB: spfn_dev
    ports:
      - '5432:5432'
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U spfn -d spfn_dev']
      interval: 5s
      timeout: 5s
      retries: 5

  # Redis
  redis:
    image: redis:7-alpine
    container_name: spfn-redis
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 2s
      timeout: 3s
      retries: 5

volumes:
  postgres_data:
  redis_data:

networks:
  default:
    name: spfn-network
```

### Starting Services

```bash
# Start PostgreSQL and Redis
docker-compose up -d

# Check service status
docker-compose ps

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

## Application Dockerfile

Superfunction provides a production-ready Dockerfile optimized for both Next.js and API server:

```dockerfile
# Production Dockerfile for Superfunction
FROM node:22-alpine

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

# Expose ports (3790 for Next.js, 8790 for API)
EXPOSE 3790 8790

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8790/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application
CMD ["pnpm", "run", "spfn:start"]
```

> **Note:** Key Features
> - **Alpine-based**: Minimal image size (~150MB)
> - **Layer caching**: Dependencies cached separately from source code
> - **Production pruning**: Dev dependencies removed after build
> - **Health checks**: Built-in readiness probes
> - **Dual ports**: Exposes both Next.js (3790) and API (8790)

## Environment Configuration

Create separate environment files for different stages:

### Development (.env.local)

```bash
# Database
DATABASE_URL="postgresql://spfn:spfn@localhost:5432/spfn_dev"

# Redis (Optional - remove if not needed)
REDIS_URL="redis://localhost:6379"

# API
NEXT_PUBLIC_API_URL="http://localhost:8790"
APP_PORT=3790
API_PORT=8790

# Next.js
NODE_ENV=development
```

### Production (.env.production)

```bash
# Database (use production credentials)
DATABASE_URL="postgresql://user:password@postgres-host:5432/spfn_prod"

# Redis (Optional - remove if not needed)
REDIS_URL="redis://redis-host:6379"

# API
NEXT_PUBLIC_API_URL="https://api.yourdomain.com"
APP_PORT=3790
API_PORT=8790

# Next.js
NODE_ENV=production

# Optional: Monitoring
SENTRY_DSN=your-sentry-dsn
LOG_LEVEL=info
```

> **⚠️ Warning:** Security Warning
>
> Never commit `.env.production` to version control. Use environment variable injection in your CI/CD pipeline or secrets management system.

For a managed workflow, `spfn secret` stores deployed secrets in encrypted SOPS files
(`secrets/<env>.enc.json`, backend chosen by `.sops.yaml` — age / GCP KMS / AWS KMS)
that are safe to commit; your GitOps step decrypts them into env at deploy time. Local
secrets go to the OS keychain instead. See [CLI → spfn secret](../api-reference/cli.md#spfn-secret).

## Building for Production

### Local Build

```bash
# Build Docker image
docker build -t spfn-app:latest \
  --build-arg CI_BOT_TOKEN=${CI_BOT_TOKEN} \
  --build-arg APP_PORT=3790 \
  .

# Run container
docker run -d \
  --name spfn-app \
  --network spfn-network \
  -p 3790:3790 \
  -e DATABASE_URL="postgresql://spfn:spfn@spfn-postgres:5432/spfn_dev" \
  -e REDIS_URL="redis://spfn-redis:6379" \
  spfn-app:latest

# Check logs
docker logs -f spfn-app
```

### With Docker Compose

Create a `docker-compose.production.yml` that includes your application:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: spfn-postgres
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-spfn}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-spfn}
      POSTGRES_DB: ${POSTGRES_DB:-spfn_prod}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U ${POSTGRES_USER:-spfn}']
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: spfn-redis
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 2s
      timeout: 3s
      retries: 5

  app:
    build:
      context: .
      dockerfile: Dockerfile
      args:
        CI_BOT_TOKEN: ${CI_BOT_TOKEN}
        APP_PORT: 3790
    container_name: spfn-app
    ports:
      - "3790:3790"
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER:-spfn}:${POSTGRES_PASSWORD:-spfn}@postgres:5432/${POSTGRES_DB:-spfn_prod}
      REDIS_URL: redis://redis:6379
      NODE_ENV: production
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:

networks:
  default:
    name: spfn-network
```

```bash
# Build and start all services
docker-compose -f docker-compose.production.yml up -d --build

# View logs
docker-compose -f docker-compose.production.yml logs -f app

# Stop all services
docker-compose -f docker-compose.production.yml down
```

## Database Migrations

Superfunction provides CLI commands for managing database migrations:

```bash
# Generate migration from schema changes
npx spfn db generate

# Apply migrations to database
npx spfn db migrate

# Development workflow
npx spfn db generate  # Create migration file
npx spfn db migrate   # Apply to local database

# Production: Run migrations inside container
docker exec spfn-app npx spfn db migrate

# Or run migrations as a separate container
docker run --rm \
  --network spfn-network \
  -e DATABASE_URL="postgresql://spfn:spfn@spfn-postgres:5432/spfn_prod" \
  spfn-app:latest \
  npx spfn db migrate
```

## CI/CD Pipeline Example

Example GitHub Actions workflow for automated deployment:

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to Container Registry
        uses: docker/login-action@v3
        with:
          registry: your-registry.com
          username: ${{ secrets.REGISTRY_USERNAME }}
          password: ${{ secrets.REGISTRY_PASSWORD }}

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: your-registry.com/spfn-app:latest
          build-args: |
            CI_BOT_TOKEN=${{ secrets.CI_BOT_TOKEN }}
          cache-from: type=registry,ref=your-registry.com/spfn-app:buildcache
          cache-to: type=registry,ref=your-registry.com/spfn-app:buildcache,mode=max

      - name: Deploy to server
        uses: appleboy/ssh-action@v1.0.0
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SERVER_SSH_KEY }}
          script: |
            cd /opt/spfn-app
            docker-compose pull
            docker-compose up -d
            docker-compose exec -T app npx spfn db migrate
```

## Production Considerations

### 1. Resource Limits

Set appropriate resource limits in your docker-compose file:

```yaml
services:
  app:
    # ... other config
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G
```

### 2. Health Checks

Add health checks to ensure services are ready:

```yaml
services:
  app:
    # ... other config
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3790/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

### 3. Logging

Configure logging drivers for production:

```yaml
services:
  app:
    # ... other config
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

### 4. Reverse Proxy

Use Nginx or Caddy as a reverse proxy for SSL termination:

```yaml
services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - app

  app:
    # ... other config
    # Don't expose port directly
    expose:
      - "3790"
```

## Monitoring and Debugging

### Container Logs

```bash
# View all container logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f app

# View last 100 lines
docker-compose logs --tail=100 app

# View logs with timestamps
docker-compose logs -f -t app
```

### Container Shell Access

```bash
# Access container shell
docker exec -it spfn-app sh

# Run commands in container
docker exec spfn-app pnpm run db:migrate
docker exec spfn-app node --version

# Check container resource usage
docker stats spfn-app
```

### Database Connection

```bash
# Connect to PostgreSQL
docker exec -it spfn-postgres psql -U spfn -d spfn_prod

# Run SQL from host
docker exec -i spfn-postgres psql -U spfn -d spfn_prod < backup.sql

# Create database backup
docker exec spfn-postgres pg_dump -U spfn spfn_prod > backup.sql
```

## Troubleshooting

### Container Won't Start

```bash
# Check container status
docker-compose ps

# View detailed logs
docker-compose logs app

# Inspect container
docker inspect spfn-app

# Check if services are healthy
docker-compose ps --format json | jq '.[].Health'
```

### Database Connection Issues

```bash
# Check if PostgreSQL is ready
docker exec spfn-postgres pg_isready -U spfn

# Test connection from app container
docker exec spfn-app sh -c 'apt-get update && apt-get install -y postgresql-client && psql $DATABASE_URL -c "SELECT 1"'

# Check network connectivity
docker exec spfn-app ping spfn-postgres
```

### Build Cache Issues

```bash
# Clear Docker build cache
docker builder prune -af

# Rebuild without cache
docker-compose build --no-cache

# Remove all containers and volumes
docker-compose down -v
```

> **✅ Success:** Next Steps
>
> Your Superfunction application is now deployed! Consider adding:
> - Monitoring with Sentry or similar tools
> - Automated backups for PostgreSQL
> - Load balancing for horizontal scaling
> - CDN for static assets