# Installation Guide

This guide covers how to install and set up SPFN in your project.

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Redis 7+ (optional)
- pnpm, npm, yarn, or bun

## Installation Methods

### Option 1: Using CLI (Recommended)

The easiest way to add SPFN to an existing Next.js project:

```bash
# Add SPFN to your Next.js project
npx @spfn/cli init

# Start development servers (Next.js + Hono)
npx spfn dev
```

This will:
- Install required dependencies
- Create `src/server/` directory structure
- Add example routes and entities
- Update your `package.json` scripts

### Option 2: Manual Installation

Install core packages:

```bash
npm install @spfn/core hono @hono/node-server drizzle-orm postgres

# Optional: Authentication
npm install @spfn/auth

# Optional: Redis caching
npm install ioredis
```

## Project Setup

### 1. Create Server Structure

```
src/server/
├── routes/          # API routes
│   └── health/
│       └── index.ts
├── entities/        # Database schemas
│   └── users.ts
└── index.ts        # Server entry point
```

### 2. Configure Database

Create `.env` file:

```bash
DATABASE_URL=postgresql://user:password@localhost:5432/mydb

# Optional: Read replica
DATABASE_READ_URL=postgresql://user:password@replica:5432/mydb

# Optional: Redis
REDIS_URL=redis://localhost:6379
```

### 3. Create Server Entry Point

```typescript
// src/server/index.ts
import { startServer } from '@spfn/core/server';

await startServer({
  port: 4000,
  routesPath: 'src/server/routes'
});
```

### 4. Create Your First Route

```typescript
// src/server/routes/health/index.ts
import type { RouteContext } from '@spfn/core/route';

export async function GET(c: RouteContext) {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
}
```

### 5. Start Development Server

```bash
# Using CLI
npx spfn dev

# Or manually
node --loader tsx src/server/index.ts
```

## Next Steps

- [Getting Started Guide](./getting-started.md) - Learn the basics
- [Routing Guide](./routing.md) - Create API routes
- [Database Guide](./database.md) - Set up your database
- [Authentication Guide](./authentication.md) - Add authentication

## Troubleshooting

### Module Resolution Issues

If you encounter import errors, ensure your `tsconfig.json` includes:

```json
{
  "compilerOptions": {
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

### Database Connection Failed

Check your `DATABASE_URL` environment variable:

```bash
# Test connection
psql $DATABASE_URL
```

### Port Already in Use

Change the port in your server config:

```typescript
await startServer({ port: 4001 });
```

## Additional Resources

- [CLI Documentation](../../packages/cli/README.md)
- [Core Package Documentation](../../packages/core/README.md)
- [Example Projects](https://github.com/spfn/spfn/tree/main/apps/examples)