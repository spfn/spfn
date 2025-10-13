# spfn

> Superfunction CLI - The Backend Layer for Next.js

The official CLI tool for SPFN framework. Initialize projects, generate boilerplate code, and manage your database.

## Usage

> ⚠️ **Alpha Release**: SPFN is currently in alpha. Use `@alpha` tag for installation.

```bash
# Using npx (no installation required) - Recommended
npx spfn@alpha init

# Or install globally (alpha version)
npm install -g spfn@alpha
spfn init
```

## Commands

### Project Initialization
```bash
spfn init              # Initialize SPFN in Next.js project
```

### Code Generation
```bash
spfn generate <name>   # Generate entity, routes, repository, and client
spfn generate users    # Example: Generate users CRUD
```

### Development
```bash
spfn dev              # Start dev server with watch mode
spfn start            # Start production server
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

### Utilities
```bash
spfn key              # Generate encryption key for .env
```

## Documentation

For complete documentation and guides, see:
- **[SPFN Framework](../../README.md)** - Getting started
- **[@spfn/core](../core/README.md)** - API reference and core concepts

## Requirements

- Node.js 18+
- Next.js 15+ (App Router)
- PostgreSQL (optional: Redis)

## Links

- 🌐 Website: [superfunction.xyz](https://superfunction.xyz)
- 📦 npm: [@spfn/core](https://npmjs.com/package/@spfn/core)
- 💬 GitHub: [spfn/spfn](https://github.com/spfn/spfn)