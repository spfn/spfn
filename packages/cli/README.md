# @spfn/cli

## Installation

```bash
npm install -g @spfn/cli
# or
pnpm add -g @spfn/cli
# or
yarn global add @spfn/cli
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
   - `routes/` - API routes using createApp() pattern
   - `contracts/` - TypeBox validation schemas
   - `entities/` - Drizzle ORM schemas
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
