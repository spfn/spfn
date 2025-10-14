# SPFN Project Guide

Welcome to your SPFN project! This directory contains practical guides to help you build and deploy your application.

## Quick Links

- **[Quick Start](./quick-start.md)** - Build your first API endpoint (5 minutes)
- **[Deployment](./deployment.md)** - Deploy to production

## Documentation Structure

### For Beginners
1. Start with [Quick Start](./quick-start.md) to create your first endpoint
2. Read the [SPFN Framework README](https://github.com/spfn/spfn) for overall concepts
3. Check [Deployment Guide](./deployment.md) when ready to go live

### For Reference
- Full API documentation: `node_modules/@spfn/core/README.md`
- Routing system: `node_modules/@spfn/core/src/route/README.md`
- Database guide: `node_modules/@spfn/core/src/db/README.md`
- Transactions: `node_modules/@spfn/core/src/db/docs/transactions.md`

## Project Structure

```
your-project/
├── src/
│   ├── app/              # Next.js frontend (port 3790)
│   └── server/           # SPFN backend (port 8790)
│       ├── entities/     # Database schemas
│       ├── repositories/ # Data access layer
│       ├── services/     # Business logic
│       └── routes/       # API endpoints + contracts
├── .guide/               # This directory (project guides)
├── .env.local           # Environment variables
└── docker-compose.yml   # Local database setup
```

## Available Commands

```bash
# Development
npm run spfn:dev        # Start backend (8790) + frontend (3790)
npm run spfn:server     # Start backend only
npm run spfn:next       # Start frontend only

# Production
npm run spfn:build      # Build for production
npm run spfn:start      # Start production server

# Database
npx spfn db generate    # Generate migrations
npx spfn db migrate     # Run migrations
npx spfn db studio      # Open database GUI

# Code Generation
npx spfn generate users # Generate CRUD boilerplate
```

## Getting Help

- **Issues**: [GitHub Issues](https://github.com/spfn/spfn/issues)
- **Docs**: [spfn.xyz](https://superfunction.xyz)
- **Package Docs**: Check `node_modules/@spfn/core/` for detailed API reference

## Editing These Guides

These guides are yours! Feel free to:
- Add your team's specific setup instructions
- Document your project's conventions
- Add deployment configs for your infrastructure

---

**Next Step**: Start with [Quick Start Guide](./quick-start.md) →