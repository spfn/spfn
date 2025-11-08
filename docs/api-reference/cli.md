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

# Create automatic backup before migration
spfn db migrate --with-backup

# Output with SPFN modules installed
📦 Applying function package migrations:
  - @spfn/cms
  - @spfn/auth
✅ Function migrations applied

✓ Applying project migrations...
✓ Project migrations applied successfully
```

### Options

| Option | Description |
|--------|-------------|
| `--with-backup` | Create a pre-migration backup before applying migrations |

### Auto-Backup Feature

The `--with-backup` flag creates a compressed backup tagged as "pre-migration" before applying any migrations. This provides a safety net for risky migration operations:

```bash
spfn db migrate --with-backup

# Output
📦 Creating pre-migration backup...

💾 Creating database backup...
✅ Backup created successfully
   File: /Users/project/backups/mydb_2025-01-05_143022.dump
   Size: 156.20 KB

📋 Collecting metadata...
✓ Metadata saved: mydb_2025-01-05_143022.meta.json

📦 Applying function package migrations...
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

## spfn db push

Push schema changes directly to the database without generating migration files. Useful for rapid prototyping in development.

```bash
# Push schema changes to database
spfn db push
```

> **⚠️ Warning:** Development Only
>
> `spfn db push` is intended for development only. For production, always use `spfn db generate` and `spfn db migrate` to maintain migration history.

## spfn db studio

Open Drizzle Studio, a web-based GUI for browsing and editing your database.

```bash
# Open Drizzle Studio (default port 4983)
spfn db studio

# Use custom port
spfn db studio --port 4984
```

Drizzle Studio will be available at `https://local.drizzle.studio`.

### Auto-Port Finding

If the default port is in use, the command automatically finds the next available port:

```bash
spfn db studio
# ⚠️  Port 4983 is in use, using port 4984 instead
```

This allows you to run multiple Studio instances across different projects simultaneously.

## spfn db backup

Create a backup of your database. Backups are stored in the `./backups` directory.

```bash
# Create backup (default: SQL format)
spfn db backup

# Create compressed backup
spfn db backup --format custom

# Backup to custom path
spfn db backup --output /path/to/backup.sql

# Backup specific schema only
spfn db backup --schema spfn_cms

# Data-only backup (no schema)
spfn db backup --data-only

# Schema-only backup (no data)
spfn db backup --schema-only

# Tagged backup for production
spfn db backup --env production --tag "release,v1.2.3"
```

### Options

| Option | Description |
|--------|-------------|
| `-f, --format <format>` | Backup format: `sql` or `custom` (default: `sql`) |
| `-o, --output <path>` | Custom output path |
| `-s, --schema <name>` | Backup specific schema only |
| `--data-only` | Backup data only (no schema) |
| `--schema-only` | Backup schema only (no data) |
| `--tag <tags>` | Comma-separated tags for this backup |
| `--env <environment>` | Environment label (e.g., `production`, `staging`) |

### Output

```bash
💾 Creating database backup...

✅ Backup created successfully
   File: /Users/project/backups/mydb_2025-01-05_143022.sql
   Size: 218.40 KB

📋 Collecting metadata...
✓ Metadata saved: mydb_2025-01-05_143022.meta.json
```

### Backup Formats

| Format | Extension | Compression | Use Case |
|--------|-----------|-------------|----------|
| `sql` | `.sql` | None | Text-based, readable, version control |
| `custom` | `.dump` | Built-in | Compressed, faster restore |

> **Note:** Security
>
> Backup files contain sensitive data. The backup commands automatically update both:
> - `./backups/.gitignore` - Ignores all `.sql` and `.dump` files
> - Project root `.gitignore` - Adds `backups/` directory
>
> This prevents accidental commits of sensitive backup files to version control.

## spfn db restore

Restore database from a backup file. Automatically displays backup metadata and version compatibility warnings.

```bash
# Interactive backup selection
spfn db restore

# Restore specific file
spfn db restore backups/mydb_2025-01-05_143022.sql

# Drop existing tables before restore
spfn db restore backup.sql --drop

# Restore specific schema only
spfn db restore backup.sql --schema spfn_cms

# Data-only restore (requires .dump format)
spfn db restore backup.dump --data-only

# Schema-only restore (requires .dump format)
spfn db restore backup.dump --schema-only
```

### Options

| Option | Description |
|--------|-------------|
| `--drop` | Drop existing tables before restore |
| `-s, --schema <name>` | Restore specific schema only |
| `--data-only` | Restore data only (requires `.dump` format) |
| `--schema-only` | Restore schema only (requires `.dump` format) |

### Metadata & Version Check

Before restore, metadata is displayed with version compatibility warnings:

```bash
📋 Backup Information:

  Database: mydb
  Created: 1/5/2025, 2:30:22 PM
  Environment: production
  Tags: release, v1.2.3

⚠️  Version Warnings:

  - Git commit mismatch: backup from abc1234, current is def5678
  - Migration version mismatch: backup has 42 migrations, current has 45
    Last migration in backup: 0042_add_user_roles
    Current last migration: 0045_add_notifications

⚠️  This will replace all data in the database. Continue? (y/N)
```

### Interactive Selection

When no file is specified, you'll be prompted to select from available backups:

```bash
spfn db restore

? Select backup to restore:
  > mydb_2025-01-05_143022.sql (218.40 KB)
    mydb_2025-01-04_120000.sql (215.12 KB)
    mydb_2025-01-03_120000.sql (210.45 KB)
```

> **⚠️ Warning:** Data Loss
>
> Restoring a backup will replace all data in the database. Version warnings help prevent accidental data loss from incompatible backups.

## spfn db backup:list

List all available database backups.

```bash
spfn db backup:list
```

### Output

```bash
📋 Database backups:

  Date                  Size        File
  ─────────────────────────────────────────────────────────
  01/05/2025, 02:30:22 PM  218.40 KB   mydb_2025-01-05_143022.sql
  01/04/2025, 12:00:00 PM  215.12 KB   mydb_2025-01-04_120000.sql
  01/03/2025, 12:00:00 PM  210.45 KB   mydb_2025-01-03_120000.sql

  Total: 3 backup(s)
```

## spfn db backup:clean

Remove old database backups based on retention policies.

```bash
# Keep 10 most recent backups (default)
spfn db backup:clean

# Keep 5 most recent backups
spfn db backup:clean --keep 5

# Delete backups older than 7 days
spfn db backup:clean --older-than 7
```

### Confirmation

The command shows which backups will be deleted and asks for confirmation:

```bash
🧹 Cleaning old backups...

The following 2 backup(s) will be deleted:

  - mydb_2025-01-01_120000.sql (205.34 KB)
  - mydb_2024-12-31_120000.sql (203.12 KB)

? Proceed with deletion? (y/N)
```

## spfn db sync

Sync database between environments with automatic backup protection. Perfect for pushing local development data to staging/dev servers, or pulling production data for local debugging.

```bash
# Sync local → dev server (push)
spfn db sync dev

# Sync dev server → local (pull)
spfn db sync dev --pull

# Preview without making changes
spfn db sync dev --dry-run

# Sync specific tables only
spfn db sync dev --tables users,posts

# Exclude specific tables
spfn db sync dev --exclude-tables logs,sessions

# Data-only sync (preserve schema)
spfn db sync dev --data-only

# Skip confirmation prompt (useful for CI/CD)
spfn db sync dev --yes

# Force sync to production (requires confirmation)
spfn db sync prod --force
```

### Environment Configuration

Configure sync targets in your `.env` file using the `SPFN_DB_*` prefix:

```bash
# .env or .env.local
DATABASE_URL=postgresql://localhost:5432/myapp_local

# Sync targets
SPFN_DB_DEV=postgresql://user:pass@dev-server:5432/myapp_dev
SPFN_DB_STAGING=postgresql://user:pass@staging:5432/myapp_staging
SPFN_DB_PROD=postgresql://user:pass@prod:5432/myapp_prod
```

### Options

| Option | Description |
|--------|-------------|
| `--pull` | Reverse direction: pull from target to local |
| `--tables <tables>` | Sync only specific tables (comma-separated) |
| `--exclude-tables <tables>` | Exclude specific tables (comma-separated) |
| `--data-only` | Sync data only (schema unchanged) |
| `--schema-only` | Sync schema only (data unchanged) |
| `--force` | Allow syncing to production-like environments |
| `--dry-run` | Show sync plan without making changes |
| `-y, --yes` | Skip confirmation prompt |

### Sync Process

The sync process has 4 steps with automatic safety measures:

```bash
spfn db sync dev

🔄 Database sync

📋 Sync Plan:

  Source:  local (myapp_local)
           42 tables, 156.20 KB

  Target:  dev (myapp_dev)
           42 tables, 143.15 KB

  ⚠️  Target database will be completely replaced!
  ℹ️  Target will be backed up before sync

? Sync local → dev? (y/N)

📦 Step 1/4: Creating target backup...
✅ Backup created successfully

📤 Step 2/4: Dumping source database...
✓ Source dump created

📥 Step 3/4: Restoring to target database...
✓ Target restored

🧹 Step 4/4: Cleaning up...
✓ Temporary files deleted

✅ Sync completed successfully!
   local → dev
```

### Safety Features

**Automatic Backup**
Target database is always backed up before sync (cannot be skipped):
```bash
# Backup is created automatically in ./backups
backups/dev_2025-01-05_143022.dump
backups/dev_2025-01-05_143022.meta.json
```

**Production Protection**
Syncing to production-like environments requires explicit `--force` flag:
```bash
# This will be blocked
spfn db sync prod

# ❌ Cannot sync to production-like environment 'prod' without --force flag
#    This is a safety measure to prevent accidental data loss
#    Use --force if you really want to do this

# Must use --force
spfn db sync prod --force
```

Environment names containing `prod`, `production`, `live`, or `main` are considered production-like.

**Explicit Confirmation**
Every sync requires user confirmation after displaying the plan.

**Connection Verification**
Both source and target connections are tested before starting.

### Common Use Cases

**1. Push Local Changes to Dev**
```bash
# After developing locally with test data
spfn db sync dev

# Dev server now has your local data
```

**2. Pull Production Data for Debugging**
```bash
# Get production data for local debugging
spfn db sync prod --pull --force

# Or pull without sensitive tables
spfn db sync prod --pull --force --exclude-tables payment_logs,user_sessions
```

**3. Clone Environment**
```bash
# Copy staging to dev
SPFN_DB_STAGING=postgresql://staging:5432/db
spfn db sync dev --from staging
```

**4. Partial Sync**
```bash
# Sync only specific tables (e.g., product catalog)
spfn db sync dev --tables products,categories,brands

# Sync everything except logs
spfn db sync dev --exclude-tables access_logs,error_logs,audit_logs
```

**5. Preview Changes**
```bash
# See what would happen without actually doing it
spfn db sync dev --dry-run

# ✅ Dry run complete (no changes made)
```

### Recovery

If sync fails or produces unexpected results, restore from the automatic backup:

```bash
# List recent backups
spfn db backup:list

# Restore from pre-sync backup
spfn db restore backups/dev_2025-01-05_143022.dump
```

### Workflow Examples

**Development Workflow**
```bash
# 1. Develop locally with test data
npm run dev

# 2. Create some test users, posts, etc.
# ...

# 3. Push to dev server for team testing
spfn db sync dev

# 4. Team tests features on dev server with your data
```

**Debugging Production Issues**
```bash
# 1. Pull production data (excluding sensitive tables)
spfn db sync prod --pull --force \
  --exclude-tables user_passwords,payment_methods,sessions

# 2. Debug locally with production-like data
npm run dev

# 3. Fix issue and test with real data
```

**Setting Up New Environment**
```bash
# Clone staging to new preview environment
SPFN_DB_PREVIEW=postgresql://preview:5432/db
spfn db sync preview --from staging

# Or from local snapshot
spfn db backup --tag "seed-data"
spfn db restore backups/seed_data.dump
```

> **⚠️ Important:** Full Replacement
>
> Sync performs a **complete replacement** of the target database. All existing data in the target will be deleted and replaced with source data. Always review the sync plan before confirming.

> **💡 Tip:** Table Filtering
>
> Use `--exclude-tables` to skip large or sensitive tables like logs, sessions, or analytics data for faster syncs.

## spfn db drop

Drop all tables in the database. **Use with extreme caution.**

```bash
spfn db drop
```

> **⚠️ Danger:** Destructive Operation
>
> This command will permanently delete all tables in your database. It cannot be undone. Always create a backup before running this command.

## spfn db check

Check database connection and schema status.

```bash
spfn db check

# Output
✓ Database connection OK
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
    "db:push": "spfn db push",
    "db:studio": "spfn db studio",
    "db:backup": "spfn db backup",
    "db:restore": "spfn db restore",
    "db:sync": "spfn db sync",
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
spfn db backup

# 2. Run migration
spfn db migrate

# 3. Test application
spfn dev

# 4. Rollback if needed
spfn db restore
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
