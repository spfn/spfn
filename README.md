# Superfunction (SPFN)

> A TypeScript fullstack framework by INFLIKE Inc.
>
> Combining the best of Next.js and Hono
>
> The productivity of Rails + The robustness of Spring Boot, but for TypeScript

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node.js-18+-green)](https://nodejs.org/)

## 🎯 What is SPFN?

SPFN is a modern fullstack TypeScript framework that brings enterprise-grade backend features to the Next.js ecosystem. It combines:

- **Next.js** for the frontend (App Router)
- **Hono** for the backend (lightweight, fast)
- **Drizzle ORM** for type-safe database operations
- **File-based routing** for API endpoints
- **Automatic transaction management**
- **Repository pattern** for data access

## ✨ Key Features

### 🗂️ File-based API Routing
Next.js-style routing for your backend API:
```
src/server/routes/
├── users/
│   ├── index.ts          → GET/POST /api/users
│   ├── [id].ts          → GET/PUT/DELETE /api/users/:id
│   └── [id]/
│       └── posts.ts     → GET /api/users/:id/posts
```

### 🔄 Automatic Transaction Management
```typescript
// Just add middleware - transactions work automatically!
export const middlewares = [Transactional()];

export async function POST(c: RouteContext) {
  // All DB operations in a transaction
  const user = await db.insert(users).values(data).returning();
  await db.insert(profiles).values({ userId: user.id });
  // Auto-commit on success, auto-rollback on error
  return c.json(user, 201);
}
```

### 📦 Spring Data-inspired Repository Pattern
```typescript
const userRepo = new Repository(db, users);

// Pagination, filtering, sorting - all built-in
const result = await userRepo.findPage({
  where: { status: 'active' },
  pagination: { page: 1, limit: 10 },
  sort: { field: 'createdAt', order: 'desc' }
});
```

### 🗄️ Redis Cache with Master-Replica Support
```typescript
// Auto-detects from environment variables
import { getRedis, getRedisRead } from '@spfn/core';

await getRedis().set('key', 'value');        // Write to master
const value = await getRedisRead().get('key'); // Read from replica
```

### 🔐 Client-Key Authentication
```typescript
// ECDSA-based authentication system
import { ClientKeyAuth } from '@spfn/auth';

// 3-tier caching: Memory → Redis → Database
// Replay attack protection with nonce + timestamp
// AES-256-GCM encrypted private key storage
```

## 📦 Packages

This monorepo contains the following packages:

### [@spfn/core](./packages/core)
Core framework features:
- File-based routing
- Transaction management
- Repository pattern
- Redis cache
- Error handling
- Type generation

### [@spfn/auth](./packages/auth)
Authentication system:
- Client-Key authentication (ECDSA P-256)
- 3-tier caching (Memory/Redis/DB)
- Replay attack protection
- Secure key storage (AES-256-GCM)

### [@spfn/cli](./packages/cli) *(Coming Soon)*
Code generation CLI:
```bash
npx spfn create my-app          # Create new project
npx spfn add auth/client-key    # Add authentication
npx spfn generate crud users    # Generate CRUD routes
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Redis 7+ (optional)

### Installation

```bash
# Clone repository
git clone https://github.com/spfn/spfn.git
cd spfn

# Install dependencies
pnpm install

# Set up environment
cp packages/core/.env.example packages/core/.env.local

# Run database migrations
cd packages/core
pnpm db:migrate
```

### Development

```bash
# Run all packages in watch mode
pnpm dev

# Run specific package
pnpm dev --filter=@spfn/core

# Run tests
pnpm test

# Build all packages
pnpm build
```

## 📚 Documentation

**[📖 Full Documentation](./docs/README.md)**

### Getting Started
- [Installation Guide](./docs/guides/installation.md)
- [Quick Start](./docs/guides/getting-started.md)
- [Architecture Overview](./docs/project/architecture.md)
- [Framework Philosophy](./docs/project/philosophy.md)

### Core Concepts
- [File-based Routing](./docs/guides/routing.md)
- [Database & Repository](./docs/guides/database.md)
- [Transaction Management](./docs/guides/transactions.md)
- [Authentication](./docs/guides/authentication.md)
- [Redis Cache](./docs/guides/caching.md)
- [Error Handling](./docs/guides/error-handling.md)

### Project Info
- [Contributing Guide](./CONTRIBUTING.md)
- [Coding Standards](./docs/project/coding-standards.md)
- [Roadmap](./docs/project/roadmap.md)

## 🏗️ Project Structure

```
spfn/
├── packages/
│   ├── core/                 # Framework core
│   │   ├── src/
│   │   │   ├── route/       # File-based routing
│   │   │   ├── db/          # Database & ORM
│   │   │   ├── cache/       # Redis cache
│   │   │   ├── server/      # Server utilities
│   │   │   ├── utils/       # Transaction utils
│   │   │   ├── middleware/  # Built-in middleware
│   │   │   ├── errors/      # Error handling
│   │   │   └── scripts/     # Code generation
│   │   └── docs/            # Documentation
│   │
│   ├── auth/                # Authentication
│   │   ├── src/
│   │   │   ├── server/      # Server implementation
│   │   │   └── shared/      # Shared types
│   │   └── docs/            # Auth documentation
│   │
│   └── cli/                 # CLI tool (coming soon)
│
├── apps/                    # Example applications
├── docs/                    # Documentation
│   ├── guides/              # User guides
│   ├── api/                 # API reference
│   ├── project/             # Project info
│   └── advanced/            # Advanced topics
└── .dev/                    # Development tracking
```

## 🧪 Testing

The framework includes comprehensive test coverage:

```bash
# Run all tests
pnpm test

# Run tests for specific package
pnpm test --filter=@spfn/core

# Run tests with coverage
pnpm test:coverage

# Run tests in watch mode
pnpm test:watch
```

**Test Coverage:**
- @spfn/core: 150+ tests
- @spfn/auth: 45+ tests
- Total: 195+ tests passing

## 📈 Roadmap

### v0.1.0 (Current)
- [x] File-based routing
- [x] Transaction management
- [x] Repository pattern
- [x] Redis cache
- [x] Client-Key authentication

### v0.2.0 (Next)
- [ ] CLI tool for code generation
- [ ] Type-safe API client generation
- [ ] WebSocket support
- [ ] Real-time subscriptions

### v1.0.0 (Future)
- [ ] Production-ready deployment guides
- [ ] Monitoring & observability
- [ ] Performance optimization
- [ ] Horizontal scaling patterns

See [ROADMAP](./docs/project/roadmap.md) for details.

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](./CONTRIBUTING.md) for details.

### Development Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`pnpm test`)
5. Commit with conventional commits (`git commit -m 'feat: add amazing feature'`)
6. Push to your fork (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## 🙏 Acknowledgments

Built with amazing open source tools:

- [Next.js](https://nextjs.org/) - React framework
- [Hono](https://hono.dev/) - Ultrafast web framework
- [Drizzle ORM](https://orm.drizzle.team/) - TypeScript ORM
- [Turborepo](https://turbo.build/) - Monorepo build system
- [PostgreSQL](https://www.postgresql.org/) - Database
- [Redis](https://redis.io/) - Cache & pub/sub
- [Vitest](https://vitest.dev/) - Testing framework

## 💬 Community & Support

- 📖 [Documentation](./packages/core/README.md)
- 🐛 [Issue Tracker](https://github.com/spfn/spfn/issues)
- 💡 [Discussions](https://github.com/spfn/spfn/discussions)

## ⭐ Star History

If you find Superfunction useful, please consider giving it a star! ⭐

---

**Made with ❤️ by [INFLIKE Inc.](https://inflike.com) for TypeScript developers**