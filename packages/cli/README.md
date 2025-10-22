# spfn

> Superfunction CLI - The Backend Layer for Next.js

The official CLI tool for SPFN framework. Initialize projects, generate boilerplate code, and manage your database.

## Usage

> ⚠️ **Alpha Release**: SPFN is currently in alpha. Use `@alpha` tag for installation.

### Quick Start (New Project)
```bash
# Create new project with all SPFN features pre-configured
npx spfn@alpha create my-app
cd my-app
docker compose up -d
npm run spfn:dev
```

### Add to Existing Next.js Project
```bash
# Using npx (no installation required) - Recommended
npx spfn@alpha init

# Or install globally (alpha version)
npm install -g spfn@alpha
spfn init
```

## Commands

### Create New Project
```bash
spfn create <name>           # Create new Next.js project with SPFN (all-in-one)
spfn create my-app           # Example: Create project with TypeScript, App Router, SVGR, and SPFN
spfn create my-app --shadcn  # Include shadcn/ui component library
```

### Project Initialization
```bash
spfn init              # Initialize SPFN in existing Next.js project
spfn init -y           # Skip prompts, use defaults
```

**What `spfn init` creates:**
- `src/server/` - Backend structure (routes, entities, repositories)
- `docker-compose.yml` - PostgreSQL + Redis for local development
- `Dockerfile`, `.dockerignore`, `docker-compose.production.yml` - Production deployment
- `.guide/` - **Quick-start and deployment guides** (⭐ Use with AI tools!)
- `.env.local.example` - Environment variable template
- `spfn.config.js` - Deployment configuration with JSDoc type hints

### Code Generation
```bash
spfn generate <name>   # Generate entity, routes, repository, and client
spfn generate users    # Example: Generate users CRUD
```

### Development & Production
```bash
# Development
spfn dev                    # Start both Next.js (3790) + API server (8790)
spfn dev --server-only      # Start API server only (8790)
spfn dev --no-watch         # Disable hot reload

# Production
spfn build                  # Build Next.js + compile server
spfn start                  # Start production server
spfn start --server-only    # Start API server only (no Next.js)
```

### Database Management
```bash
spfn db generate      # Generate database migrations
spfn db push          # Push schema to database (no migrations)
spfn db migrate       # Run pending migrations
spfn db studio        # Open Drizzle Studio (database GUI)
spfn db check         # Check database connection
spfn db drop          # Drop all tables (⚠️ dangerous!)
```

### Setup Features
```bash
spfn setup icons      # Setup SVGR for SVG icon management
```

### Utilities
```bash
spfn key              # Generate encryption key for .env
```

## Configuration

### spfn.config.js

SPFN uses `spfn.config.js` for deployment configuration with full JSDoc type support for IDE autocomplete.

**Basic Configuration:**
```javascript
/**
 * @type {import('spfn').SpfnConfig}
 */
export default {
  packageManager: 'pnpm',
  deployment: {
    // Your app's subdomain on spfn.app
    // Creates region-specific domains:
    // - myapp.us.spfn.app (Next.js)
    // - api-myapp.us.spfn.app (API)
    subdomain: 'myapp',

    // Optional: Deployment region (defaults to 'us')
    // Available: 'us' (Virginia, default), 'kr' (Seoul), 'jp', 'sg', 'eu' (coming soon)
    region: 'us',

    // Optional: Add custom domains
    customDomains: {
      nextjs: ['www.example.com', 'example.com'],
      spfn: ['api.example.com']
    },

    // Optional: Environment variables for both Next.js and SPFN backend
    // ⚠️ WARNING: These values are committed to Git
    // Do NOT put sensitive credentials here!
    env: {
      NEXT_PUBLIC_API_URL: 'https://api-myapp.us.spfn.app',
      NODE_ENV: 'production'
    }
  }
}
```

**Features:**
- **JSDoc Type Hints** - IDE autocomplete via `@type {import('spfn').SpfnConfig}`
- **Multi-Region Deployment** - Deploy to Seoul (kr), Virginia (us), and more
- **Dual Domain Setup** - Automatic `{subdomain}.{region}.spfn.app` and `api-{subdomain}.{region}.spfn.app`
- **Custom Domains** - Support for multiple custom domains
- **Environment Variables** - Shared between Next.js and SPFN backend
- **ESM/CJS Support** - Works with both module systems

**Security Note:**
- `spfn.config.js` is committed to Git
- Only use for non-sensitive configuration
- For secrets (DB passwords, API keys), use CI/CD secrets management

## Documentation

For complete documentation and guides, see:
- **[SPFN Framework](../../README.md)** - Getting started
- **[@spfn/core](../core/README.md)** - API reference and core concepts
- **`.guide/` directory in your project** - Quick-start and deployment guides

### Working with AI Tools

When using AI assistants (Claude, ChatGPT, etc.) to build your SPFN project:

**⭐ Share the `.guide/` documentation with your AI assistant!**

After running `spfn init`, you'll have a `.guide/` directory with practical guides:
- **`quick-start.md`** - Build your first API endpoint (5 minutes)
- **`deployment.md`** - Complete deployment guide

These guides help AI understand SPFN's architecture and generate correct code for:
- Creating entities and routes
- Database migrations
- Type-safe API clients
- Production deployment

**Example prompt:**
```
I'm using SPFN framework. Here's the quick-start guide:
[paste .guide/quick-start.md]

Now help me create a blog post API with title, content, and author fields.
```

## Requirements

- Node.js 18+
- Next.js 15+ (App Router)
- PostgreSQL (optional: Redis)

## Links

- 🌐 Website: [superfunction.xyz](https://superfunction.xyz)
- 📦 npm: [spfn](https://npmjs.com/package/spfn) (CLI)
- 📦 npm: [@spfn/core](https://npmjs.com/package/@spfn/core) (Core)
- 💬 GitHub: [spfn/spfn](https://github.com/spfn/spfn)