# SPFN Documentation

Welcome to the Superfunction (SPFN) documentation.

**SPFN** is a TypeScript fullstack framework that brings enterprise-grade backend features to the Next.js ecosystem, combining the best of Next.js and Hono.

## 📖 Getting Started

New to SPFN? Start here:

1. [Installation](./guides/installation.md) - Install SPFN in your project
2. [Getting Started](./guides/getting-started.md) - Build your first API
3. [Routing Basics](./guides/routing.md) - Learn file-based routing

## 📚 User Guides

### Core Features

- [**File-based Routing**](./guides/routing.md) - Next.js-style API routing
- [**Database & Repository**](./guides/database.md) - Type-safe database operations
- [**Repository Pattern**](./guides/repository.md) - Spring Data-inspired data access
- [**Transactions**](./guides/transactions.md) - Automatic transaction management
- [**Error Handling**](./guides/error-handling.md) - Custom error classes

### Additional Features

- [**Authentication**](./guides/authentication.md) - Client-key authentication system
- [**Caching**](./guides/caching.md) - Redis caching with master-replica support
- [**Deployment**](./guides/deployment.md) - Production deployment guide

## 🔧 API Reference

- [**@spfn/core**](./api/core.md) - Core framework API (Coming soon)
- [**@spfn/auth**](./api/auth.md) - Authentication API
- [**@spfn/cli**](./api/cli.md) - CLI commands (Coming soon)

### Package Documentation

- [@spfn/core](../packages/core/README.md) - Framework core
- [@spfn/auth](../packages/auth/README.md) - Authentication system
- [@spfn/cli](../packages/cli/README.md) - CLI tool

## 🏗️ Project Information

Learn about the project's design and development:

- [**Architecture Overview**](./project/architecture.md) - System architecture
- [**Framework Philosophy**](./project/philosophy.md) - Design principles
- [**Roadmap**](./project/roadmap.md) - Development roadmap
- [**Coding Standards**](./project/coding-standards.md) - Code style guide

## 🚀 Advanced Topics

Deep dives into advanced features:

- [**Authentication Architecture**](./advanced/auth-architecture.md) - How auth works internally
- [**Security Best Practices**](./advanced/auth-security.md) - Security guidelines
- [**Performance Optimization**](./advanced/performance.md) - Performance tuning (Coming soon)
- [**Contributing Guide**](./advanced/contributing-guide.md) - How to contribute (Coming soon)

## 🧪 Module Documentation

Technical documentation for developers:

### @spfn/core Modules

- [Route Module](../packages/core/src/route/README.md) - Route discovery and loading
- [Database Module](../packages/core/src/db/README.md) - Database and ORM
- [Server Module](../packages/core/src/server/README.md) - Server utilities
- [Utils Module](../packages/core/src/utils/README.md) - Transaction utilities
- [Cache Module](../packages/core/src/cache/README.md) - Redis caching
- [Error Module](../packages/core/src/errors/README.md) - Error handling
- [Logger Module](../packages/core/src/logger/README.md) - Logging system
- [Middleware Module](../packages/core/src/middleware/README.md) - Built-in middleware
- [Client Module](../packages/core/src/client/README.md) - Client utilities
- [Query Module](../packages/core/src/query/README.md) - Query helpers

## 🤝 Community

- [**GitHub Repository**](https://github.com/spfn/spfn)
- [**Issue Tracker**](https://github.com/spfn/spfn/issues)
- [**Discussions**](https://github.com/spfn/spfn/discussions)
- [**Contributing**](../CONTRIBUTING.md)

## 📦 Quick Links

### Installation

```bash
# Add to existing Next.js project
npx @spfn/cli init

# Start development
npx spfn dev
```

### Minimal Example

```typescript
// src/server/index.ts
import { startServer } from '@spfn/core/server';
await startServer();

// src/server/routes/users/index.ts
export async function GET(c: RouteContext) {
  return c.json({ users: [] });
}
```

## 📄 License

MIT License - Copyright (c) 2025 INFLIKE Inc.

See [LICENSE](../LICENSE) for details.

---

**Made with ❤️ by [INFLIKE Inc.](https://inflike.com)**