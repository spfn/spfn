# Deployment Guide

This guide covers how to deploy SPFN applications to production.

## Pre-Deployment Checklist

- [ ] Environment variables configured
- [ ] Database migrations completed
- [ ] Redis configured (if using)
- [ ] Build tested locally
- [ ] Error monitoring set up
- [ ] Logging configured

## Environment Variables

Ensure these are set in your production environment:

```bash
# Required
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@host:5432/db

# Recommended
DATABASE_READ_URL=postgresql://user:pass@replica:5432/db
REDIS_URL=redis://host:6379
PORT=4000

# Optional
LOG_LEVEL=info
```

## Build for Production

```bash
# Build all packages
pnpm build

# Or build specific package
pnpm build --filter=@spfn/core
```

## Deployment Options

### Option 1: Node.js Server

Deploy your Hono server to any Node.js hosting:

```typescript
// src/server/index.ts
import { startServer } from '@spfn/core/server';

await startServer({
  port: process.env.PORT || 4000,
  host: '0.0.0.0' // Listen on all interfaces
});
```

Start production server:

```bash
node dist/server/index.js
```

### Option 2: Docker

Create `Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 4000

CMD ["node", "dist/server/index.js"]
```

Build and run:

```bash
docker build -t my-spfn-app .
docker run -p 4000:4000 --env-file .env my-spfn-app
```

### Option 3: Vercel (Next.js + Hono)

Deploy Next.js frontend and Hono backend together:

1. Add `vercel.json`:

```json
{
  "buildCommand": "pnpm build",
  "devCommand": "pnpm dev",
  "installCommand": "pnpm install",
  "framework": "nextjs",
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "http://localhost:4000/api/:path*"
    }
  ]
}
```

2. Deploy:

```bash
vercel deploy --prod
```

### Option 4: Railway / Render

These platforms auto-detect Node.js and deploy easily:

1. Connect your GitHub repository
2. Set environment variables
3. Deploy automatically on push

## Database Setup

### Migrations

Run migrations before deployment:

```bash
# Using Drizzle Kit
pnpm drizzle-kit push:pg
```

### Connection Pooling

Use connection pooling for production:

```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const queryClient = postgres(process.env.DATABASE_URL!, {
  max: 10, // Connection pool size
  idle_timeout: 20,
  connect_timeout: 10
});

export const db = drizzle(queryClient);
```

## Performance Optimization

### Enable Caching

```bash
# Redis for caching
REDIS_URL=redis://production-redis:6379
```

### Database Read Replicas

```bash
# Separate read/write
DATABASE_URL=postgresql://master:5432/db
DATABASE_READ_URL=postgresql://replica:5432/db
```

### Logging

Configure production logging:

```typescript
import { startServer } from '@spfn/core/server';

await startServer({
  middleware: {
    logger: process.env.NODE_ENV === 'production'
  }
});
```

## Monitoring

### Health Checks

Add health check endpoint:

```typescript
// src/server/routes/health/index.ts
export async function GET(c: RouteContext) {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
}
```

### Error Tracking

Integrate error tracking (e.g., Sentry):

```typescript
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV
});
```

## Security Best Practices

1. **Use HTTPS** in production
2. **Set secure CORS** policies
3. **Enable rate limiting**
4. **Validate all inputs**
5. **Keep dependencies updated**
6. **Use environment variables** for secrets
7. **Enable database SSL**

## Scaling

### Horizontal Scaling

Run multiple instances behind a load balancer:

```bash
# Instance 1
PORT=4001 node dist/server/index.js

# Instance 2
PORT=4002 node dist/server/index.js
```

### Database Scaling

- Use read replicas for read-heavy workloads
- Implement connection pooling
- Add database indexes
- Use Redis for caching

## Troubleshooting

### High Memory Usage

Check for connection leaks:

```typescript
import { closeDatabase, closeRedis } from '@spfn/core';

process.on('SIGTERM', async () => {
  await closeDatabase();
  await closeRedis();
  process.exit(0);
});
```

### Slow Queries

Enable slow query logging:

```typescript
export const middlewares = [
  Transactional({
    slowQueryThreshold: 1000 // Log queries > 1s
  })
];
```

## Resources

- [Performance Optimization](../advanced/performance.md)
- [Security Best Practices](../advanced/auth-security.md)
- [Architecture Guide](../project/architecture.md)