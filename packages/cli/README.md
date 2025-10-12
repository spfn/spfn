# @spfn/cli

> ⚠️ **Alpha Release**: SPFN is currently in alpha. APIs may change. Use `@alpha` tag for installation.

## Installation

**Recommended: Use npx (no installation required)**
```bash
npx spfn@alpha init
```

**Optional: Global installation**
```bash
npm install -g spfn@alpha
# or
pnpm add -g spfn@alpha
# or
yarn global add spfn@alpha
```

## Quick Start

```bash
# 1. Initialize SPFN in your Next.js project
cd your-nextjs-project
spfn init

# 2. Start development server
npm run spfn:dev
# or: spfn dev
```

Visit:
- Next.js app: http://localhost:3790
- API health: http://localhost:8790/health
- API examples: http://localhost:8790/examples

---

## Commands

### `spfn init`

Initialize SPFN in an existing Next.js project.

```bash
spfn init
```

**What it does:**

1. ✅ Installs dependencies (@spfn/core, hono, drizzle-orm, etc.)
2. ✅ Creates `src/server/` directory structure with:
   - `routes/` - API routes with co-located contracts (contract.ts + index.ts)
   - `entities/` - Drizzle ORM schemas
   - `middlewares/` - Custom middleware functions
3. ✅ Adds SPFN-specific scripts to package.json (preserves your existing scripts)
4. ✅ Creates .env.local.example with default ports (3790/8790)
5. ✅ Copies .guide/ directory for Claude Code documentation

**Options:**
- `-y, --yes` - Skip all prompts

---

### `spfn dev`

Start development server (Next.js + SPFN automatically).

```bash
# Using npm script (recommended)
npm run spfn:dev

# Or use CLI directly
spfn dev
```

**Features:**
- 🔍 Auto-detects Next.js
- 🚀 Runs both Next.js (3790) + Hono (8790) servers
- 🔥 Hot reload for backend routes
- 📊 Colored output with process names

**Options:**
- `-p, --port <port>` - Server port (default: 8790)
- `-h, --host <host>` - Server host (default: localhost)
- `--server-only` - Run only Hono server (skip Next.js)

**Examples:**
```bash
npm run spfn:dev            # Next.js (3790) + Hono (8790)
npm run spfn:server         # Hono only (8790)
npm run spfn:next           # Next.js only (3790)

spfn dev                    # Next.js (3790) + Hono (8790)
spfn dev --server-only      # Hono only (8790)
spfn dev -p 5000            # Hono only with custom port
```

**Custom Ports:**
To customize ports, edit the generated scripts in `package.json`:
```json
{
  "scripts": {
    "spfn:dev": "spfn dev -p 9000",           // Change Hono port
    "spfn:next": "next dev --turbo --port 4000"  // Change Next.js port
  }
}
```

---

### `spfn generate` (alias: `spfn g`)

Generate CRUD routes and repository from a Drizzle entity.

```bash
# Generate from entity name
spfn generate users

# Generate from entity file path
spfn generate src/server/entities/users.ts
```

**What it generates:**

1. ✅ Repository (`src/server/repositories/users.repository.ts`)
   - Extends BaseRepository with findById, create, update, delete, findPage
   - Singleton instance pattern
   - Includes documentation for inherited methods

2. ✅ Contract definitions (`src/server/routes/users/contract.ts`)
   - Auto-generated TypeBox schemas from Drizzle entity using drizzle-typebox
   - 5 contracts: list (GET /), create (POST /), get (GET /:id), update (PUT /:id), delete (DELETE /:id)
   - Full type safety for params, query, body, and response

3. ✅ Collection routes (`src/server/routes/users/index.ts`)
   - GET /users - List with pagination
   - POST /users - Create new item

4. ✅ Item routes (`src/server/routes/users/[id]/index.ts`)
   - GET /users/:id - Get by ID
   - PUT /users/:id - Update item
   - DELETE /users/:id - Delete item

**Options:**

- `-f, --force` - Overwrite existing files without confirmation
- `-i, --interactive` - Prompt before overwriting each file
- `--only <files>` - Only generate specific files (comma-separated: `contract`, `repository`, `routes`)
- `--dry-run` - Show what would be generated without creating files

**Examples:**

```bash
# Basic usage
spfn generate users

# Generate from entity file
spfn generate src/server/entities/products.ts

# Only generate repository and contract
spfn generate users --only repository,contract

# Preview without creating files
spfn generate users --dry-run

# Force overwrite existing files
spfn generate users --force

# Interactive mode - prompt for each file
spfn generate users --interactive
```

**Safety:**

By default, `spfn generate` will **refuse to overwrite existing files** to prevent accidental code loss. Use `--force` to overwrite or `--interactive` to review each file.

---

### `spfn start`

Start production Hono server.

```bash
# Using npm script (recommended)
npm run spfn:start

# Or use CLI directly
spfn start
```

**Options:**
- `-p, --port <port>` - Server port (default: 8790)
- `-h, --host <host>` - Server host (default: 0.0.0.0)

---

### Database Commands

SPFN provides convenient wrappers around Drizzle Kit for database management.

#### `spfn db generate` (alias: `spfn db g`)

Generate database migrations from schema changes.

```bash
spfn db generate
```

This analyzes your Drizzle entities and creates migration SQL files in `src/server/migrations/`.

#### `spfn db push`

Push schema changes directly to the database without creating migration files (useful for development).

```bash
spfn db push
```

⚠️ **Warning:** This modifies your database schema directly. Use migrations for production.

#### `spfn db migrate` (alias: `spfn db m`)

Run pending migrations against your database.

```bash
spfn db migrate
```

#### `spfn db studio`

Open Drizzle Studio - a visual database GUI for browsing and editing data.

```bash
spfn db studio
# Or with custom port
spfn db studio --port 5000
```

Default port: 4983

#### `spfn db check`

Check database connection and display connection info.

```bash
spfn db check
```

#### `spfn db drop`

Drop all database tables. ⚠️ **Dangerous!** This will delete all data.

```bash
spfn db drop
```

---

## Generated Scripts

After `spfn init`, these scripts are **added** to your package.json (existing scripts are preserved):

```json
{
  "scripts": {
    "spfn:dev": "spfn dev",                      // Next.js + Hono
    "spfn:server": "spfn dev --server-only",     // Hono only (8790)
    "spfn:next": "next dev --turbo --port 3790", // Next.js only (3790)
    "spfn:start": "spfn start"                   // Production Hono
  }
}
```

**Note:** Your existing scripts like `dev`, `build`, `start` are **not modified**.

---

## Requirements

- Node.js >= 18
- Next.js 15+ with App Router
- src/ directory structure
- Turbopack recommended

---

## License

MIT
