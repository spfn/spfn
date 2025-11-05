---
title: "Creating Modules"
description: "Learn how to create reusable Superfunction modules that can be shared across projects or published to npm"
order: 2
available: true
---

# Creating Superfunction Modules

Learn how to create reusable Superfunction modules that can be shared across projects or published to npm.

## Overview

Superfunction modules are self-contained packages that provide:
- Database entities with migrations
- Type-safe API routes
- Auto-generated client SDKs
- React hooks and components
- Full TypeScript support

Examples of modules:
- `@spfn/auth` - Authentication & user management
- `@spfn/cms` - Content management system
- `@mycompany/billing` - Custom billing module
- `@username/blog` - Personal blog module

## Quick Start

### 1. Generate a New Module

```bash
# In your monorepo root (workspaces/spfn)
npx spfn generate

# Or with options
npx spfn generate my-module --description "My awesome module"
```

You'll be prompted for:
- **NPM Scope**: Your organization or username (e.g., `@mycompany`, `@username`)
  - Use `@spfn` for official modules
  - Use your own scope for custom modules
- **Function Name**: Module name (lowercase, hyphen-separated)
- **Description**: Brief description
- **Entities**: Initial database entities (optional)

### 2. Build and Test

```bash
cd packages/my-module
pnpm build
pnpm test
```

### 3. Use in Your App

```bash
# From your Next.js app
spfn add @mycompany/my-module
```

## Module Structure

Generated modules follow Superfunction's 3-layer architecture:

```
my-module/
├── src/
│   ├── lib/                    # Shared layer
│   │   ├── contracts/          # API contract definitions
│   │   └── types/              # Shared TypeScript types
│   ├── server/                 # Server layer
│   │   ├── entities/           # Drizzle ORM entities
│   │   ├── repositories/       # Data access layer
│   │   ├── routes/             # API route handlers
│   │   ├── helpers/            # Server utilities
│   │   └── generators/         # Custom code generators
│   ├── client/                 # Client layer
│   │   ├── hooks/              # React hooks
│   │   ├── store/              # Zustand stores
│   │   └── components/         # React components
│   ├── api/                    # Auto-generated (DO NOT EDIT)
│   ├── index.ts                # Main entry point
│   ├── server.ts               # Server exports
│   └── client.ts               # Client exports
├── migrations/                 # Database migrations
├── package.json               # Module configuration
├── tsconfig.json
├── tsup.config.ts             # Build configuration
├── drizzle.config.ts          # Database configuration
└── README.md                  # Module documentation
```

## Development Workflow

### Step 1: Define Database Entities

When you run `spfn generate fn` with entities, the CLI **automatically generates** a properly structured schema file:

```typescript
// src/server/entities/schema.ts (auto-generated ✨)
import { createFunctionSchema } from '@spfn/core/db';

// ✅ Export schema to auto-generate CREATE SCHEMA in migrations
export const myModuleSchema = createFunctionSchema('@mycompany/my-module');
```

Generated entity files import this schema:

```typescript
// src/server/entities/post.ts (auto-generated ✨)
import { index, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { myModuleSchema } from './schema';

export const post = myModuleSchema.table('post', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('spfn_my_module_post_name_idx').on(table.name),
]);
```

> **✅ Best Practice: Schema Structure**
>
> The `spfn generate fn` command follows the recommended pattern:
> - **One schema file** (`schema.ts`) per module - exported for Drizzle Kit
> - **Entity files** import the schema instead of creating local instances
> - **Index file** exports both schema and entities
>
> This ensures `CREATE SCHEMA` is auto-generated in migrations.
>
> **Manual Entity Creation:**
> If you're adding entities manually (not via generate), always import the existing schema:
>
> ```typescript
> // ✅ Good: Import existing schema
> import { myModuleSchema } from './schema';
> export const newEntity = myModuleSchema.table(...);
>
> // ❌ Bad: Create local schema
> const schema = createFunctionSchema('@my/module');
> export const newEntity = schema.table(...);
> ```

### Step 2: Generate Migrations

```bash
pnpm db:generate
```

This creates SQL migration files in the `migrations/` directory.

### Step 3: Create Repositories

Implement data access logic:

```typescript
// src/server/repositories/post-repository.ts
import { db } from '@spfn/core/db';
import { posts } from '../entities/post';

export class PostRepository {
  static async findAll() {
    return db.select().from(posts).orderBy(posts.createdAt);
  }

  static async findById(id: string) {
    const [post] = await db.select().from(posts).where(eq(posts.id, id));
    return post;
  }

  static async create(data: { title: string; content: string }) {
    const [post] = await db.insert(posts).values(data).returning();
    return post;
  }
}
```

### Step 4: Define API Contracts

Create type-safe API contracts:

```typescript
// src/lib/contracts/posts.ts
import { contract } from '@spfn/core';
import { Type as t } from '@sinclair/typebox';

export const getPostsContract = contract({
  method: 'GET',
  path: '/_my-module/posts',
  responses: {
    200: t.Array(t.Object({
      id: t.String(),
      title: t.String(),
      content: t.String(),
      createdAt: t.String(),
    })),
  },
});

export const createPostContract = contract({
  method: 'POST',
  path: '/_my-module/posts',
  body: t.Object({
    title: t.String(),
    content: t.String(),
  }),
  responses: {
    201: t.Object({
      id: t.String(),
      title: t.String(),
      content: t.String(),
    }),
  },
});
```

### Step 5: Implement Route Handlers

```typescript
// src/server/routes/posts/index.ts
import { route } from '@spfn/core';
import { getPostsContract, createPostContract } from '@/lib/contracts/posts';
import { PostRepository } from '@/server/repositories/post-repository';

export const GET = route(getPostsContract, async () => {
  const posts = await PostRepository.findAll();
  return { status: 200, body: posts };
});

export const POST = route(createPostContract, async ({ body }) => {
  const post = await PostRepository.create(body);
  return { status: 201, body: post };
});
```

### Step 6: Generate API Client

```bash
pnpm codegen
```

This automatically generates a type-safe client SDK in `src/api/`:

```typescript
// Auto-generated: src/api/index.ts
export const myModuleApi = {
  posts: Posts,  // Fully typed!
};
```

### Step 7: Create React Hooks (Optional)

```typescript
// src/client/hooks/use-posts.ts
'use client';
import { useState, useEffect } from 'react';
import { myModuleApi } from '@/api';

export function usePosts() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    myModuleApi.posts.list()
      .then(setPosts)
      .finally(() => setLoading(false));
  }, []);

  const createPost = async (data: { title: string; content: string }) => {
    const newPost = await myModuleApi.posts.create({ body: data });
    setPosts([...posts, newPost]);
    return newPost;
  };

  return { posts, loading, createPost };
}
```

### Step 8: Write Tests

```typescript
// src/server/routes/posts/__tests__/index.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { GET, POST } from '../index';

describe('POST /_my-module/posts', () => {
  it('should create a new post', async () => {
    const response = await POST({
      body: { title: 'Test', content: 'Content' }
    });

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('id');
    expect(response.body.title).toBe('Test');
  });
});
```

## Configuration

### Package.json Configuration

The `spfn` field in `package.json` configures your module:

```json
{
  "name": "@mycompany/my-module",
  "spfn": {
    "prefix": "/_my-module",
    "schemas": ["./dist/server/entities/*.js"],
    "routes": { "dir": "./dist/server/routes" },
    "migrations": { "dir": "./migrations" },
    "codegen": {
      "generators": [
        {
          "name": "@spfn/core:contract",
          "contractsDir": "src/lib/contracts",
          "outputPath": "src/api",
          "runOn": ["build", "manual"]
        }
      ]
    }
  }
}
```

| Field | Description |
|-------|-------------|
| `prefix` | URL prefix for all routes (e.g., `/_my-module`) |
| `schemas` | Glob patterns for entity files |
| `routes.dir` | Directory containing route handlers |
| `migrations.dir` | Migration files directory |
| `codegen.generators` | Code generators to run |

### API Name Generation

The `prefix` field automatically generates a unique API client name:

- `/_my-module` → `myModuleApi`
- `/_auth` → `authApi`
- `/_cms` → `cmsApi`

This prevents naming conflicts when using multiple modules.

## Custom Code Generators

Modules can include custom generators that run during development:

```typescript
// src/server/generators/sync-types.ts
import type { Generator, GeneratorOptions } from '@spfn/core/codegen';
import { writeFileSync } from 'fs';
import { join } from 'path';

export function createTypeSyncGenerator(): Generator {
  return {
    name: 'my-module:sync-types',
    runOn: ['build', 'watch', 'manual'],
    watchPatterns: ['src/lib/types/**/*.ts'],

    async generate(options: GeneratorOptions) {
      const { cwd, debug } = options;

      // Your generation logic
      const output = `// Auto-generated types index\n`;
      writeFileSync(join(cwd, 'src/lib/types/index.ts'), output);

      if (debug) {
        console.log('✓ Types synchronized');
      }
    },
  };
}
```

Register in `package.json`:

```json
{
  "spfn": {
    "codegen": {
      "generators": [
        {
          "name": "@mycompany/my-module:sync-types",
          "watchPatterns": ["src/lib/types/**/*.ts"]
        }
      ]
    }
  }
}
```

## Publishing Your Module

### 1. Prepare for Publishing

```bash
# Build the module
pnpm build

# Run tests
pnpm test

# Verify package contents
npm pack --dry-run
```

### 2. Update Version

```json
{
  "version": "1.0.0"
}
```

### 3. Publish to npm

```bash
# Public package
npm publish --access public

# Private package (requires paid npm account)
npm publish
```

### 4. Using Your Published Module

Users can install and use your module:

```bash
# Install
npm install @mycompany/my-module

# Add to Superfunction app
spfn add @mycompany/my-module
```

## Best Practices

### 1. Naming Conventions

- **Package name**: `@scope/module-name` (lowercase, hyphen-separated)
- **Prefix**: `/_module-name` (matches package name)
- **Entities**: PascalCase + descriptive (e.g., `BlogPosts`, `UserProfiles`)
- **Repositories**: PascalCase + `Repository` suffix
- **Routes**: Organize by resource (e.g., `routes/posts/`, `routes/comments/`)

### 2. Database Schema Isolation

Always use a dedicated schema for your module:

```typescript
const myModuleSchema = pgSchema('spfn_my_module');

export const posts = myModuleSchema.table('posts', { /* ... */ });
```

This prevents table name conflicts with other modules.

### 3. API Versioning

Consider versioning your API routes:

```typescript
// v1
path: '/_my-module/v1/posts'

// v2 (when breaking changes)
path: '/_my-module/v2/posts'
```

### 4. Documentation

Include comprehensive documentation in your README:
- Installation instructions
- Configuration options
- API reference
- Usage examples
- Migration guides

### 5. Testing

Write tests for:
- Route handlers (integration tests)
- Repositories (unit tests)
- Hooks (React Testing Library)
- Generators (if applicable)

## Examples

### Official Superfunction Modules

- **[@spfn/auth](https://github.com/spfn/auth)** - User authentication
  - JWT-based authentication
  - Password hashing with bcrypt
  - Session management
  - Protected route helpers

- **[@spfn/cms](https://github.com/spfn/cms)** - Content management
  - Multi-language support
  - Version control
  - Draft/publish workflow
  - React hooks for content

### Community Modules

Check out [spfn.dev/modules](https://spfn.dev/modules) for community-contributed modules.

## Troubleshooting

### Module Not Found After Installation

Rebuild your Next.js app:

```bash
rm -rf .next
npm run dev
```

### Migration Conflicts

If multiple modules modify the same tables, you'll see migration errors. Ensure each module uses its own schema:

```typescript
// ❌ Bad: using public schema
export const posts = pgTable('posts', { /* ... */ });

// ✅ Good: using module-specific schema
const mySchema = pgSchema('spfn_my_module');
export const posts = mySchema.table('posts', { /* ... */ });
```

### Type Errors in Generated Client

Regenerate the client after updating contracts:

```bash
pnpm codegen
```

## Next Steps

- [Module Architecture](./architecture.md) - Deep dive into module structure
- [Advanced Patterns](./advanced-patterns.md) - Complex module scenarios
- [Contributing Modules](./contributing.md) - Share your modules with the community

## Resources

- [Superfunction CLI Reference](../api-reference/cli.md)
- [Contract System](../core-concepts/contracts.md)
- [Code Generators](../guides/code-generation.md)