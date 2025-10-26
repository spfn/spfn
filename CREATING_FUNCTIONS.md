# Creating SPFN Functions

> Build reusable, shareable backend modules for the SPFN ecosystem

This guide explains how to create your own SPFN functions - self-contained backend modules that automatically integrate with any SPFN project.

---

## Table of Contents

- [What are SPFN Functions?](#what-are-spfn-functions)
- [Why Create Functions?](#why-create-functions)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Step-by-Step Guide](#step-by-step-guide)
- [Best Practices](#best-practices)
- [Publishing](#publishing)
- [Examples](#examples)

---

## What are SPFN Functions?

SPFN Functions are npm packages that extend SPFN projects with plug-and-play functionality. They:

- **Auto-register database schemas** via `spfn.schemas` in package.json
- **Auto-mount API routes** at a specified base path via `spfn.routes`
- **Provide code generators** for client integration
- **Run setup tasks** when installed via `pnpm spfn add`

### Real-world Example

```bash
# Install @spfn/cms function
pnpm spfn add @spfn/cms

# Automatically:
# ✓ Installs package
# ✓ Generates database migrations
# ✓ Applies migrations
# ✓ Routes available at /cms/*
# ✓ Shows setup guide
```

---

## Why Create Functions?

| Benefit | Description |
|---------|-------------|
| **Reusability** | Share common functionality across projects |
| **Ecosystem** | Contribute to the SPFN community |
| **Zero-config** | Functions self-declare their requirements |
| **Type-safe** | Full type safety from database to API to client |
| **Isolation** | No hard dependencies between functions |

---

## Quick Start

```bash
# 1. Create package directory
mkdir my-spfn-function
cd my-spfn-function

# 2. Initialize package
pnpm init

# 3. Install dependencies
pnpm add -D @spfn/core drizzle-orm typescript
pnpm add @sinclair/typebox

# 4. Create source structure
mkdir -p src/{entities,routes,generators}

# 5. Build and test
pnpm build
pnpm spfn add file:../my-spfn-function  # Test in a SPFN project
```

---

## Project Structure

```
@mycompany/spfn-analytics/
├── package.json              # Function metadata
├── tsconfig.json             # TypeScript config
├── src/
│   ├── entities/            # Database schemas (Drizzle)
│   │   └── events.ts
│   ├── routes/              # API routes (file-based)
│   │   ├── events/
│   │   │   ├── contract.ts
│   │   │   └── index.ts
│   │   └── stats/
│   │       └── index.ts
│   ├── generators/          # Code generators (optional)
│   │   └── analytics-client.ts
│   ├── client/              # Client utilities (optional)
│   │   └── hooks.ts
│   ├── index.ts            # Main exports
│   └── server.ts           # Server-side exports
└── dist/                    # Build output
```

---

## Step-by-Step Guide

### Step 1: Package Configuration

Create `package.json` with SPFN metadata:

```json
{
  "name": "@mycompany/spfn-analytics",
  "version": "1.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./server": {
      "types": "./dist/server.d.ts",
      "import": "./dist/server.js"
    }
  },
  "spfn": {
    "schemas": [
      "./dist/entities/*.js"
    ],
    "routes": {
      "basePath": "/analytics",
      "dir": "./dist/routes"
    },
    "generators": [
      "./dist/generators/*.js"
    ],
    "setupMessage": "📊 Analytics installed!\n  View stats: http://localhost:8790/analytics"
  },
  "peerDependencies": {
    "@spfn/core": "^0.1.0-alpha",
    "drizzle-orm": "^0.44.0"
  }
}
```

#### Key Fields

| Field | Required | Description |
|-------|----------|-------------|
| `spfn.schemas` | ✅ Yes | Glob patterns for Drizzle schema files |
| `spfn.routes` | Optional | Base path and directory for API routes |
| `spfn.generators` | Optional | Code generators for client integration |
| `spfn.setupMessage` | Optional | Message shown after installation |

### Step 2: Define Database Schemas

Create Drizzle schemas in `src/entities/`:

#### Option A: Using PostgreSQL Schemas (Recommended - Prevents Conflicts)

```typescript
// src/entities/events.ts
import { text, jsonb } from 'drizzle-orm/pg-core';
import { id, timestamps, createFunctionSchema } from '@spfn/core/db';

// Create isolated schema for this function
// @mycompany/spfn-analytics → mycompany_spfn_analytics schema
const schema = createFunctionSchema('@mycompany/spfn-analytics');

export const analyticsEvents = schema.table('events', {
  id: id(),
  name: text('name').notNull(),
  userId: text('user_id'),
  metadata: jsonb('metadata'),
  ...timestamps(),
});

// Creates table: mycompany_spfn_analytics.events
// No conflicts with other functions!
```

#### Option B: Table Name Prefixes (Legacy)

```typescript
// src/entities/events.ts
import { pgTable, text, jsonb } from 'drizzle-orm/pg-core';
import { id, timestamps } from '@spfn/core/db';

// Use package-specific prefix
export const analyticsEvents = pgTable('analytics_events', {
  id: id(),
  name: text('name').notNull(),
  userId: text('user_id'),
  metadata: jsonb('metadata'),
  ...timestamps(),
});

// Creates table: analytics_events (in public schema)
// Risk: Another package might also create 'analytics_events'
```

**Why PostgreSQL Schemas?**
- ✅ Complete isolation between functions
- ✅ No naming conflicts
- ✅ Better organization in database tools
- ✅ Easier to manage permissions
- ✅ Clean uninstall (drop schema)

### Step 3: Create API Routes

#### 3.1 Define Contract

```typescript
// src/routes/events/contract.ts
import { Type } from '@sinclair/typebox';

export const trackEventContract = {
  method: 'POST',
  path: '/',
  body: Type.Object({
    name: Type.String(),
    userId: Type.Optional(Type.String()),
    metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown()))
  }),
  response: Type.Object({
    id: Type.Number(),
    success: Type.Boolean()
  })
};
```

#### 3.2 Implement Route

```typescript
// src/routes/events/index.ts
import { createApp } from '@spfn/core/route';
import { create } from '@spfn/core/db';
import { analyticsEvents } from '../../entities/events.js';
import { trackEventContract } from './contract.js';

const app = createApp();

app.bind(trackEventContract, async (c) => {
  const data = await c.data();

  const event = await create(analyticsEvents, {
    name: data.name,
    userId: data.userId,
    metadata: data.metadata,
  });

  return c.json({
    id: event.id,
    success: true
  });
});

export default app;
```

### Step 4: Add Code Generators (Optional)

```typescript
// src/generators/analytics-client.ts
import type { CodeGenerator } from '@spfn/core/codegen';

export const analyticsClientGenerator: CodeGenerator = {
  name: 'analytics-client',
  async generate() {
    const code = `
// Auto-generated analytics client
import { api } from '@/lib/api';

export const analytics = {
  track: async (name: string, metadata?: Record<string, unknown>) => {
    return api.analytics.events.trackEvent({
      body: { name, metadata }
    });
  }
};
`;

    return {
      files: [
        {
          path: 'src/lib/analytics.ts',
          content: code,
        },
      ],
    };
  },
};

export default analyticsClientGenerator;
```

### Step 5: Build Configuration

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

Add build script to `package.json`:

```json
{
  "scripts": {
    "build": "tsc",
    "watch": "tsc --watch",
    "clean": "rm -rf dist"
  }
}
```

### Step 6: Testing Your Function

Test locally before publishing:

```bash
# In your function directory
pnpm build

# In a SPFN project
pnpm add file:../path/to/your/function

# Or use pnpm spfn add for full setup
pnpm spfn add @mycompany/spfn-analytics
```

After installation, verify:

1. **Schema discovery:**
   ```
   ✓ Discovered schemas from @mycompany/spfn-analytics
   ```

2. **Route mounting:**
   ```
   ✓ Function routes loaded: /analytics (7 routes)
   ```

3. **Test endpoints:**
   ```bash
   curl http://localhost:8790/analytics/events
   ```

### Step 7: Publishing

Publish to npm for public use:

```bash
# Build the function
pnpm build

# Publish to npm
npm publish --access public
```

---

## Best Practices

### ✅ DO

- **Keep it focused**: One function, one responsibility
- **Use peer dependencies**: Don't bundle heavy dependencies
- **Provide types**: Export TypeScript types for better DX
- **Document well**: Add README with setup instructions
- **Version carefully**: Use semantic versioning
- **Test migrations**: Ensure database migrations work

### ❌ DON'T

- **Don't bundle core dependencies**: Use peerDependencies
- **Don't use global state**: Keep functions isolated
- **Don't skip validation**: Always validate inputs
- **Don't hardcode values**: Use environment variables
- **Don't break backward compatibility**: Follow semver

---

## Naming Conventions

For auto-discovery to work, your package name must:

| Pattern | Example | Use Case |
|---------|---------|----------|
| `@spfn/*` | `@spfn/cms` | Official SPFN functions |
| `spfn-*` | `spfn-analytics` | Community functions |
| `@company/spfn-*` | `@mycompany/spfn-auth` | Private/scoped functions |

⚠️ **Important**: Packages not matching these patterns won't be auto-discovered!

---

## Publishing

### Public Package (npm)

```bash
# 1. Build
pnpm build

# 2. Version
npm version patch  # or minor, major

# 3. Publish
npm publish --access public

# 4. Tag alpha/beta
npm dist-tag add @mycompany/spfn-analytics@1.0.0 alpha
```

### Private Package (Scoped)

```bash
# Publish to npm registry (requires paid account)
npm publish

# Or use private registry
npm publish --registry https://your-registry.com
```

---

## Examples

### Authentication Function

```typescript
// @spfn/auth
{
  "spfn": {
    "schemas": ["./dist/entities/*.js"],
    "routes": {
      "basePath": "/auth",
      "dir": "./dist/routes"
    }
  }
}

// Routes:
// POST /auth/signup
// POST /auth/login
// POST /auth/logout
// GET  /auth/me
```

### File Storage Function

```typescript
// @spfn/storage
{
  "spfn": {
    "schemas": ["./dist/entities/*.js"],
    "routes": {
      "basePath": "/storage",
      "dir": "./dist/routes"
    }
  }
}

// Routes:
// POST /storage/upload
// GET  /storage/:id
// DELETE /storage/:id
```

### Notifications Function

```typescript
// @spfn/notify
{
  "spfn": {
    "schemas": ["./dist/entities/*.js"],
    "routes": {
      "basePath": "/notify",
      "dir": "./dist/routes"
    },
    "generators": ["./dist/generators/*.js"]
  }
}

// Routes:
// POST /notify/email
// POST /notify/sms
// POST /notify/push
```

---

## Real-world Reference: @spfn/cms

The `@spfn/cms` package is a complete example of an SPFN function:

**Features:**
- Database schemas for labels, values, versions
- API routes at `/cms/*` for content management
- Client hooks like `useLabels()` for React
- Code generator for label sync
- Zustand store for state management

**Source code:**
- GitHub: [github.com/spfnio/spfn/tree/main/packages/cms](https://github.com/spfnio/spfn/tree/main/packages/cms)
- Package structure, schemas, routes, generators

---

## Common Use Cases

| Use Case | Package Name | Description |
|----------|--------------|-------------|
| Authentication | `@spfn/auth` | User management, sessions, permissions |
| File Storage | `@spfn/storage` | Upload, resize, CDN integration |
| Notifications | `@spfn/notify` | Email, SMS, push notifications |
| Analytics | `@spfn/analytics` | Event tracking, dashboards |
| CMS | `@spfn/cms` | Content management, labels, versioning |
| Payments | `@spfn/payments` | Stripe, PayPal integration |
| Search | `@spfn/search` | Full-text search, filters |
| Admin | `@spfn/admin` | Admin panel, CRUD operations |

---

## Troubleshooting

### Function not discovered?

1. Check package name matches pattern (`@spfn/*` or `spfn-*`)
2. Verify `spfn.schemas` or `spfn.routes` in package.json
3. Run `pnpm install` to refresh node_modules
4. Check server logs for discovery messages

### Routes not mounting?

1. Verify `spfn.routes.dir` points to correct directory
2. Check route files export Hono app as default
3. Ensure files match pattern: `*.ts` or `*.js` (not test files)
4. Check server logs for route registration

### Schemas not found?

1. Verify `spfn.schemas` glob pattern
2. Ensure schemas are in `dist/` after build
3. Check schemas export Drizzle tables
4. Run migrations: `pnpm spfn db push`

---

## Support

- **Documentation**: [superfunction.xyz/docs/creating-functions](https://superfunction.xyz/docs/creating-functions)
- **GitHub Issues**: [github.com/spfnio/spfn/issues](https://github.com/spfnio/spfn/issues)
- **Discussions**: [github.com/spfnio/spfn/discussions](https://github.com/spfnio/spfn/discussions)

---

## License

MIT - See [LICENSE](./LICENSE) for details