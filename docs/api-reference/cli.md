---
title: "CLI Commands"
description: "Complete reference for Superfunction CLI commands"
order: 5
available: true
---

# CLI Commands

Superfunction provides a powerful CLI for development, building, and database management.

## spfn dev

Start development servers with hot reload for both Next.js and Hono server. Automatically runs codegen on contract changes.

```bash
# Start dev servers (Next.js + Hono)
spfn dev

# Start only Hono server
spfn dev --server-only

# Custom port and host
spfn dev --port 8790 --host localhost

# Custom routes directory
spfn dev --routes src/server/routes

# Disable hot reload
spfn dev --no-watch
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--server-only` | Start only Hono server (skip Next.js) | false |
| `-p, --port` | Server port | 8790 |
| `-h, --host` | Server host | localhost |
| `--routes` | Routes directory path | src/server/routes |
| `--no-watch` | Disable hot reload | false |

## spfn build

Build production-ready Next.js and Hono server. Runs codegen before building.

```bash
# Build both Next.js and Hono server
spfn build

# Build only Next.js
spfn build --next-only

# Build only Hono server
spfn build --server-only
```

### Build Output

```bash
.next/              # Next.js build output
.spfn/              # API server build output
  ├── routes/       # Compiled route files
  └── server.js     # Server entry point
```

## spfn start

Start production servers from built files.

```bash
# Start production servers (Next.js + Hono)
spfn start

# Start only Next.js
spfn start --next-only

# Start only Hono server
spfn start --server-only

# Custom port and host
spfn start --port 8790 --host 0.0.0.0
```

> **⚠️ Warning:** Production Requirement
>
> You must run `spfn build` before `spfn start`. The start command requires pre-built files in `.next/` and `.spfn/` directories.

## spfn db generate

Generate database migration files from schema changes. Wraps `drizzle-kit generate`.

```bash
# Generate migration
spfn db generate

# Output
✓ Migration generated: drizzle/0001_*.sql
```

> **Note:** Package Entity Exclusion
>
> `spfn db generate` only processes **your project's entities**. SPFN modules (like `@spfn/cms`, `@spfn/auth`) ship with pre-built migrations that are applied separately during `spfn db migrate`.
>
> This prevents issues with mixed `.ts`/`.js` file types between your project and installed packages.

### Workflow

```bash
# 1. Modify schema
// src/lib/db/schema.ts
export const users = pgTable('users', {
  id: id(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  role: varchar('role', { length: 50 }).notNull().default('user'), // New field
  ...timestamps(),
});

# 2. Generate migration
spfn db generate

# Output shows only your project tables
Reading config...
1 tables
users 5 columns

# 3. Review migration file
# drizzle/0001_add_role_column.sql
ALTER TABLE "users" ADD COLUMN "role" varchar(50) DEFAULT 'user' NOT NULL;

# 4. Apply migration
spfn db migrate
```

## spfn db migrate

Apply pending migrations to the database. Applies both package migrations and project migrations.

```bash
# Apply all pending migrations
spfn db migrate

# Output with SPFN modules installed
📦 Applying function package migrations:
  - @spfn/cms
  - @spfn/auth
✅ Function migrations applied

✓ Applying project migrations...
✓ Project migrations applied successfully
```

### How Package Migrations Work

When using SPFN modules, migrations are applied in two phases:

1. **Package Migrations** - Pre-built migrations from installed modules (e.g., `@spfn/cms`)
   - Applied first to create module tables
   - Shipped with the module, no generation needed
   - Isolated in module-specific schemas (e.g., `spfn_cms`, `spfn_auth`)

2. **Project Migrations** - Your application's migrations
   - Applied after package migrations
   - Generated via `spfn db generate`
   - Typically in the `public` schema

This separation ensures:
- Module tables are created before your app references them
- Clean schema isolation between modules
- No conflicts between module and project tables

### Migration Status

Drizzle tracks applied migrations in the `__drizzle_migrations` table.

```sql
SELECT * FROM __drizzle_migrations;

-- Output
| id | hash       | created_at          |
|----|------------|---------------------|
| 1  | abc123...  | 2024-01-15 10:00:00 |
| 2  | def456...  | 2024-01-16 11:30:00 |
```

## spfn codegen

Generate type-safe API client from contracts. Uses configured generators from `codegen.config.ts`.

```bash
# Generate API client
spfn codegen

# Output
✓ Running generators...
✓ Generated files successfully
```

### Generated Client

```typescript
// src/lib/api.ts (Auto-generated - Do not edit)
import { client } from '@spfn/core/client';
import type { InferContract } from '@spfn/core';

// Contracts
import { getUserContract, getUsersContract } from '@/lib/contracts/users';

// Types
export type GetUserResponse = InferContract<typeof getUserContract>['response'];
export type GetUsersResponse = InferContract<typeof getUsersContract>['response'];

// API client
export const api = {
  users: {
    getById: (options) => client.call(getUserContract, options),
    list: (options) => client.call(getUsersContract, options),
  },
} as const;
```

> **Note:** Automatic Codegen
>
> The `spfn dev` command automatically runs codegen when contracts change. You don't need to manually run `spfn codegen` during development.

## Environment Variables

CLI commands respect environment variables from `.env` files.

```bash
# .env.local (Development)
DATABASE_URL=postgresql://user:pass@localhost:5432/spfn_dev
API_PORT=8790
APP_PORT=3790

# .env.production (Production)
DATABASE_URL=postgresql://user:pass@prod-host:5432/spfn_prod
API_PORT=8790
APP_PORT=3790
NODE_ENV=production
```

## Common Workflows

### Development

```bash
# 1. Start development
spfn dev

# 2. Make schema changes
# Edit src/lib/db/schema.ts

# 3. Generate and apply migration
spfn db generate
spfn db migrate

# 4. Develop features
# Edit contracts and handlers
# Client auto-regenerates
```

### Production Deployment

```bash
# 1. Build for production
spfn build

# 2. Run migrations
spfn db migrate

# 3. Start production servers
spfn start

# Or with PM2
pm2 start "spfn start" --name spfn-app
```

### Docker Deployment

```dockerfile
# Dockerfile
FROM node:20-alpine

WORKDIR /app

# Install pnpm
RUN corepack enable pnpm

# Install dependencies
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile --prod=false

# Copy source
COPY . .

# Build
RUN pnpm run spfn:build

# Production dependencies only
RUN pnpm prune --prod

# Start
CMD ["pnpm", "run", "spfn:start"]
```

## Package.json Scripts

Recommended scripts for your `package.json`:

```json
{
  "scripts": {
    "dev": "spfn dev",
    "build": "spfn build",
    "start": "spfn start",
    "spfn:dev": "spfn dev",
    "spfn:build": "spfn build",
    "spfn:start": "spfn start",
    "db:generate": "spfn db generate",
    "db:migrate": "spfn db migrate",
    "codegen": "spfn codegen"
  }
}
```

## Troubleshooting

### Port Already in Use

```bash
# Error: Port 8790 is already in use

# Solution 1: Kill existing process
lsof -ti:8790 | xargs kill -9

# Solution 2: Use different port
spfn dev --port 8791
```

### Database Connection Error

```bash
# Error: Cannot connect to database

# Check DATABASE_URL
echo $DATABASE_URL

# Verify PostgreSQL is running
docker-compose ps postgres

# Test connection
psql $DATABASE_URL -c "SELECT 1"
```

### Migration Conflicts

```bash
# Error: Migration conflict detected

# Solution 1: Pull latest migrations
git pull origin main

# Solution 2: Regenerate migrations
rm -rf drizzle/
spfn db generate

# Solution 3: Manual merge
# Edit conflicting migration files manually
```

## Best Practices

### 1. Always Review Migrations

```bash
# After generating, review the SQL
spfn db generate
cat drizzle/0001_*.sql

# Check for:
# - Data loss (DROP COLUMN)
# - Breaking changes
# - Missing constraints
```

### 2. Use Version Control

```bash
# Commit migrations with code changes
git add drizzle/
git add src/lib/db/schema.ts
git commit -m "Add user roles"
```

### 3. Test Migrations Locally

```bash
# 1. Backup database
pg_dump $DATABASE_URL > backup.sql

# 2. Run migration
spfn db migrate

# 3. Test application
spfn dev

# 4. Rollback if needed
psql $DATABASE_URL < backup.sql
```

### 4. Production Checklist

- ✓ Run `spfn build` before deployment
- ✓ Run migrations before starting servers
- ✓ Set `NODE_ENV=production`
- ✓ Use production database credentials
- ✓ Enable graceful shutdown

> **✅ Success:** API Reference Complete!
>
> You've learned all the core Superfunction APIs. Next, explore the architecture section to understand how Superfunction works internally.
>
> [Architecture →](/docs/architecture/how-it-works)
