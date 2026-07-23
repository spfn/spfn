---
title: "CLI Commands"
description: "Complete reference for Superfunction CLI commands"
order: 5
available: true
---

# CLI Commands

Superfunction provides a powerful CLI for development, building, and database management.

## spfn dev

Start development servers for both Next.js and Hono server. Automatically runs codegen on contract changes. Use `--watch` flag to enable hot reload.

```bash
# Start dev servers (Next.js + Hono)
spfn dev

# Start only Hono server
spfn dev --server-only

# Custom port and host
spfn dev --port 8790 --host localhost

# Custom routes directory
spfn dev --routes src/server/routes

# Enable hot reload (watch mode)
spfn dev --watch
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--server-only` | Start only Hono server (skip Next.js) | false |
| `-p, --port` | Server port | 8790 |
| `-h, --host` | Server host | localhost |
| `--routes` | Routes directory path | src/server/routes |
| `--watch` | Enable hot reload (watch mode) | false |

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
Uses **timestamp prefix** by default for branch-parallel compatibility.

```bash
# Generate migration
spfn db generate

# Output (timestamp-prefixed)
✓ Migration generated: drizzle/1764036749408_*.sql
```

> **Note:** Entity Processing
>
> `spfn db generate` processes your project's entities defined in the schema files.

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

Apply pending migrations to the database. This applies **function package migrations first**
(the `migrations/` directory bundled inside installed `@spfn/*` packages such as `@spfn/auth`),
then project migrations from `src/server/drizzle`. It is the command that creates package
tables — they are not part of `spfn db push`'s schema diff.

```bash
# Apply all pending migrations
spfn db migrate

# Create automatic backup before migration
spfn db migrate --with-backup

# Output
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

✓ Applying project migrations...
✓ Project migrations applied successfully
```

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

## spfn db status

Show applied/pending migration status for every migration source — installed `@spfn/*`
packages with bundled migrations and the project's own `src/server/drizzle` — without
touching the database. Use this first when tables seem to be missing.

```bash
spfn db status

# Output
📦 Migration status:

  @spfn/auth                       12/12 applied
  @spfn/cms                        4/6 applied, 2 pending
      - 0005_label_defaults
      - 0006_locale_index
  project (src/server/drizzle)     8/8 applied

⚠️  2 pending migration(s) — run: pnpm spfn db migrate
```

`spfn dev` runs the same check at startup and warns when anything is pending.

## spfn db push

Push schema changes to the database (safe mode by default). The command uses Drizzle Kit's current PostgreSQL diff engine, including composite-primary-key introspection. Additive changes (CREATE TABLE, ADD COLUMN, etc.) are applied automatically, while destructive changes (DROP TABLE, DROP COLUMN, etc.) require confirmation. The selected statement set is applied in one transaction, so a failed statement rolls back the whole push.

```bash
# Push schema changes (safe mode — prompts for destructive changes)
spfn db push

# Preview changes without applying
spfn db push --dry-run

# Apply all changes including destructive ones without prompting
spfn db push --force
```

### Options

| Flag | Description |
|------|-------------|
| `--dry-run` | Show classified SQL statements without applying |
| `--force` | Apply all changes including destructive ones |

### Safe Mode Classification

| Category | Examples | Behavior |
|----------|----------|----------|
| **Safe** | CREATE TABLE, ADD COLUMN, CREATE INDEX | Auto-applied |
| **Warning** | SET NOT NULL, RENAME COLUMN | Auto-applied with warning |
| **Destructive** | DROP TABLE, DROP COLUMN, column type change | Requires `--force` or interactive confirmation |

> **⚠️ Warning:** Development Only
>
> `spfn db push` is intended for development only. For production, always use `spfn db generate` and `spfn db migrate` to maintain migration history.

> **Note:** Package tables are not diffed by push
>
> Schemas from installed `@spfn/*` packages (e.g. `@spfn/auth`) are excluded from the push
> diff — their tables come from the packages' bundled migrations, which push applies as its
> final step. If package tables are missing, check `spfn db status` and run `spfn db migrate`.

## spfn db reindex

Convert existing sequential-prefix migrations (`0000_`, `0001_`) to timestamp-prefix format for better branch-parallel compatibility. If your project was created before timestamp prefix became the default, run this once to migrate existing files.

```bash
# Preview changes without applying
spfn db reindex --dry-run

# Apply conversion
spfn db reindex
```

### What It Does

1. Reads `_journal.json` from the drizzle output directory
2. For each sequential-prefixed entry, replaces the prefix with the `when` timestamp
3. Renames SQL files (`0001_smooth_fury.sql` → `1764036749408_smooth_fury.sql`)
4. Renames snapshot files (`meta/0001_snapshot.json` → `meta/1764036749408_snapshot.json`)
5. Updates journal tags accordingly
6. Creates a `_journal.json.bak` backup before modifying

### Options

| Flag | Description |
|------|-------------|
| `--dry-run` | Show the reindex plan without making any changes |

> **Note:** Entries that already use timestamp prefix are automatically skipped.

> **Safe with existing databases:** Reindex only renames files and updates journal tags — the `when` timestamp and SQL content remain unchanged, so `__drizzle_migrations` records stay valid. You can run `reindex` even after migrations have been applied.

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
spfn db backup --schema public

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
spfn db restore backup.sql --schema public

# Data-only restore (requires .dump format)
spfn db restore backup.dump --data-only

# Schema-only restore (requires .dump format)
spfn db restore backup.dump --schema-only

# Show detailed restore progress
spfn db restore backup.dump --verbose
```

### Options

| Option | Description |
|--------|-------------|
| `--drop` | Drop existing tables before restore |
| `-s, --schema <name>` | Restore specific schema only |
| `--data-only` | Restore data only (requires `.dump` format) |
| `--schema-only` | Restore schema only (requires `.dump` format) |
| `-v, --verbose` | Show detailed restore progress |

### Progress & Error Reporting

Restore progress is displayed in real-time via the spinner. For `.dump` files, `pg_restore --verbose` provides object-level tracking. For `.sql` files, `ON_ERROR_STOP=1` is enabled to halt on the first error.

```bash
# Default mode — spinner shows current progress
⠋ Restoring backup... [3/23] processing item 3/23 TABLE public.users
✔ Restore completed (23 objects)

⚠️  Warnings during restore (1):
  - WARNING: table "sessions" already exists, skipping

✅ Database restored successfully

# Verbose mode — streams all output in real-time
spfn db restore backup.dump --verbose
  pg_restore: creating TABLE "public"."users"
  pg_restore: creating TABLE "public"."posts"
  pg_restore: processing item 1/23 TABLE public.users
  ...
✔ Restore completed (23 objects)
✅ Database restored successfully
```

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

Generate route metadata for RPC client. This step is optional as the define-route pattern provides type safety without code generation.

```bash
# Generate route metadata (optional)
spfn codegen

# Output
✓ Running generators...
✓ Generated files successfully
```

### Type-Safe Client (No Codegen Required)

With the define-route pattern, types are inferred directly from your router:

```typescript
// src/server/router.ts
import { route, defineRouter } from '@spfn/core/route';
import { Type } from '@sinclair/typebox';

export const getUser = route.get('/users/:id')
    .input({ params: Type.Object({ id: Type.String() }) })
    .handler(async (c) =>
    {
        const { params } = await c.data();
        return { id: params.id, name: 'John Doe' };
    });

export const appRouter = defineRouter({ getUser });
export type AppRouter = typeof appRouter;
```

```typescript
// src/lib/api.ts
import { createApi } from '@spfn/core/client';
import type { AppRouter } from '@/server/router';

// Type-safe client - no codegen step needed
export const api = createApi<AppRouter>();

// Usage with full type safety
const user = await api.getUser.call({ params: { id: '123' } });
//    ^? { id: string; name: string }
```

> **Note:** Types Update Instantly
>
> With the define-route pattern, types are inferred at compile time. When you modify a route, TypeScript immediately reflects the changes—no code generation step required.

## spfn env

환경변수 관리를 위한 명령어 모음. 스키마 기반으로 .env 파일을 생성, 검증, 검색합니다.

### spfn env init

스키마 기반으로 .env 템플릿 파일을 생성합니다.

```bash
# 기본 4개 example 파일 생성
spfn env init

# 특정 환경용 템플릿 추가 생성
spfn env init --env production
spfn env init --env staging

# 기존 파일 덮어쓰기
spfn env init --force
```

#### Options

| Option | Description |
|--------|-------------|
| `-p, --package <package>` | 스키마를 읽을 패키지명 (default: `@spfn/core`) |
| `-e, --env <environment>` | 환경별 템플릿 추가 생성 (`production`, `staging` 등) |
| `-f, --force` | 기존 파일 덮어쓰기 |

### spfn env check

.env 파일들을 스키마와 대조하여 누락/오류를 검사합니다.

```bash
# 기본 파일들 체크
spfn env check

# 특정 환경의 파일 체인 전체 체크
spfn env check --env production
```

#### Options

| Option | Description |
|--------|-------------|
| `-p, --package <package>` | 스키마를 읽을 패키지명 (default: `@spfn/core`) |
| `-e, --env <environment>` | 특정 환경의 파일 체인 체크 |

### spfn env validate

실제 `process.env` 값을 스키마에 대해 검증합니다. CI/CD 파이프라인에서 배포 전 검증에 유용합니다.

```bash
# 현재 process.env 검증
spfn env validate

# 특정 환경의 .env 파일을 로드한 후 검증
spfn env validate --env production

# 엄격 모드 (로드 실패도 에러로 처리)
spfn env validate --strict
```

#### Options

| Option | Description |
|--------|-------------|
| `-p, --packages <packages...>` | 검증할 패키지 목록 (default: `@spfn/core`) |
| `-e, --env <environment>` | 해당 환경의 .env 파일 로드 후 검증 |
| `-s, --strict` | 로드 실패 시에도 에러로 처리 |

### spfn env search

환경변수를 이름이나 설명으로 검색합니다.

```bash
# DATABASE 관련 변수 검색
spfn env search database

# URL 관련 변수 검색
spfn env search url
```

## spfn secret

로컬·운영 시크릿을 하나의 스키마·하나의 CLI로 관리합니다. 로컬은 OS 키체인,
운영(deployed)은 SOPS 암호화 파일에 저장합니다. 런타임은 참조를 직접 보지 않습니다 —
로컬은 `spfn dev`가, 운영은 GitOps가 실제 값을 프로세스 env로 주입하므로 앱은 항상
평문 `process.env`만 읽습니다.

```bash
# 로컬 시크릿을 키체인에 저장 (값은 마스킹 프롬프트로 입력)
spfn secret set DATABASE_URL

# 운영 시크릿을 SOPS 파일(secrets/production.enc.json)에 암호화 저장
spfn secret set DATABASE_URL --env production

# 선언된 시크릿과 환경별 상태 (값은 출력하지 않음)
spfn secret list --env production

# generate 전략이 있는 시크릿을 자동 생성/회전
spfn secret generate --all
spfn secret rotate JWT_SECRET

# age 키 생성 + .sops.yaml recipient 등록 (no-cloud 백엔드)
spfn secret keygen
spfn secret recipients add age1...

# 평문 시크릿 유출 정적 점검
spfn secret check
```

### 로컬 (키체인)

`secret set <KEY>`는 값을 OS 키체인(macOS `security`, Windows Credential Manager —
옵션 `@napi-rs/keyring`, Linux libsecret)에 저장하고, `.env.server`에
`secret:keychain:spfn_<KEY>` 참조만 기록합니다. 참조는 민감정보가 아니며 실제 값은
repo에 들어가지 않습니다. `spfn dev`가 참조를 풀어 서버 자식 프로세스에 주입합니다.

### 운영 (SOPS)

`secret set <KEY> --env production`은 값을 `secrets/<env>.enc.json`에 SOPS로 암호화해
기록합니다. 백엔드(age / GCP KMS / AWS KMS)는 `.sops.yaml` creation rule이 파일 경로로
선택합니다. KMS는 로컬 키 파일이 필요 없고(IAM + 클라우드 인증), age는 키 파일을
직접 다루는 no-cloud 폴백입니다. 암호화 파일을 커밋하면 GitOps가 배포 시 복호화해
env로 주입합니다. `sops`/`age` 바이너리는 운영 env에만 필요하고 로컬 키체인 사용엔
필요 없습니다.

### 스키마 기반 generate / rotate

`envSecret({ generate: 'base64url32' })`로 선언한 시크릿은 우리가 만들어내는
회전 가능한 값이라 `secret generate`/`rotate`가 자동 생성합니다. `generate`가 없는
시크릿은 외부에서 받아 붙여넣는 값(`secret set`)입니다. rotate는 출처만 바꾸므로
반영하려면 배포가 필요하고, 토큰·서명 키처럼 겹침 구간이 필요한 값은 앱이 current +
previous를 함께 검증하도록 받쳐줘야 합니다.

#### Options

| Option | 설명 |
|--------|------|
| `-e, --env <env>` | 대상 환경 (기본 `local`; `development`/`staging`/`production`) |
| `-p, --package <pkg>` | env 스키마를 읽을 패키지 (기본 `@spfn/core`) |
| `-a, --all` | (`generate`/`rotate`) 대상 시크릿 일괄 처리 |

## Environment Variables

CLI 명령어는 6-layer 우선순위로 `.env` 파일들을 로드합니다.

```bash
# .env (committed — 공통 기본값)
NODE_ENV=local
SPFN_LOG_LEVEL=info
SPFN_API_URL=http://localhost:8790

# .env.local (gitignored — Next.js용 로컬 오버라이드)
NEXT_PUBLIC_SPFN_API_URL=http://localhost:8790

# .env.server (gitignored — 서버 전용 시크릿)
DATABASE_URL=postgresql://spfn:spfn@localhost:5432/spfn_dev

# .env.production (committed — production 설정)
SPFN_LOG_LEVEL=warn
SPFN_API_URL=https://api.myapp.com
```

> **Note:** `.env.local`은 Next.js용입니다. 서버 전용 시크릿(`DATABASE_URL` 등)은 `.env.server`에 넣으세요. `.env.server`는 gitignored 이며 서버 전용(시크릿 포함)입니다.

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
FROM node:22-alpine

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

# Solution 1: Convert to timestamp prefix (prevents future conflicts)
spfn db reindex

# Solution 2: Pull latest migrations
git pull origin main

# Solution 3: Regenerate migrations
rm -rf drizzle/
spfn db generate

# Solution 4: Manual merge
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
> You've learned all the core Superfunction APIs. Next, explore the core concepts to understand how Superfunction works internally.
>
> [How It Works →](/docs/core-concepts/how-it-works)
