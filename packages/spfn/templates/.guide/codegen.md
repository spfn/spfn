# Code Generation Guide

SPFN automatically generates type-safe client code from your API routes using the **Codegen Orchestrator** system.

## How It Works

When you run `npm run spfn:dev`, SPFN:

1. Scans your `src/server/routes` directory for route contracts
2. Generates a type-safe client in `src/lib/api.ts`
3. Watches for changes and regenerates automatically

## Quick Start

### 1. Define a Route Contract

```typescript
// src/server/routes/users/contracts.ts
import { Type } from '@sinclair/typebox';

export const getUsersContract = {
  method: 'GET' as const,
  path: '/',
  query: Type.Object({
    page: Type.Optional(Type.Number()),
    limit: Type.Optional(Type.Number()),
  }),
  response: Type.Object({
    users: Type.Array(Type.Object({
      id: Type.String(),
      name: Type.String(),
      email: Type.String(),
    })),
    total: Type.Number(),
  }),
};
```

### 2. Implement the Route

```typescript
// src/server/routes/users/index.ts
import { createApp } from '@spfn/core/route';
import { getUsersContract } from './contracts';

const app = createApp();

app.bind(getUsersContract, async (c) => {
  const { page = 1, limit = 10 } = c.query;
  
  // Your implementation here
  const users = await fetchUsers(page, limit);
  
  return c.json(users);
});

export default app;
```

### 3. Use the Generated Client

After running `npm run spfn:dev`, use the auto-generated client:

```typescript
// src/app/users/page.tsx
import { api } from '@/lib/api';

export default async function UsersPage() {
  // ✅ Fully typed!
  const data = await api.users.get({
    query: { page: 1, limit: 10 }
  });

  return (
    <div>
      <h1>Users ({data.total})</h1>
      {data.users.map(user => (
        <div key={user.id}>
          {user.name} - {user.email}
        </div>
      ))}
    </div>
  );
}
```

## Configuration

Configure codegen in `.spfnrc.json`:

```json
{
  "codegen": {
    "generators": {
      "contract": {
        "enabled": true,
        "routesDir": "src/server/routes",
        "outputPath": "src/lib/api.ts",
        "baseUrl": "http://localhost:8790"
      }
    }
  }
}
```

Or in `package.json`:

```json
{
  "spfn": {
    "codegen": {
      "generators": {
        "contract": {
          "enabled": true
        }
      }
    }
  }
}
```

## Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `enabled` | `true` | Enable/disable contract generator |
| `routesDir` | `src/server/routes` | Directory containing your route files |
| `outputPath` | `src/lib/api.ts` | Where to generate the client file |
| `baseUrl` | `http://localhost:8790` | API base URL for the client |

## Advanced: Custom Generators

You can create custom code generators for your project-specific needs.

### Example: Admin Navigation Generator

```typescript
// .spfn/generators/admin-nav.ts
import type { Generator, GeneratorOptions } from '@spfn/core/codegen';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';

export default function createAdminNavGenerator(): Generator
{
  return {
    name: 'admin-nav',
    watchPatterns: ['src/app/admin/**/page.tsx'],

    async generate(options: GeneratorOptions): Promise<void>
    {
      const cwd = options.cwd;
      const adminDir = join(cwd, 'src', 'app', 'admin');
      const outputPath = join(cwd, 'src', 'lib', 'admin', 'nav-data.generated.tsx');

      // 1. Scan admin pages
      const pages = await scanAdminPages(adminDir);

      // 2. Generate navigation data
      const navData = generateNavData(pages);

      // 3. Write output
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, navData, 'utf-8');

      if (options.debug) {
        console.log(`Generated navigation data for ${pages.length} pages`);
      }
    }
  };
}

async function scanAdminPages(dir: string) {
  // Your scanning logic here
  return [];
}

function generateNavData(pages: any[]) {
  return `// Auto-generated navigation data\nexport const navItems = ${JSON.stringify(pages, null, 2)};\n`;
}
```

### Register Custom Generator

```json
// .spfnrc.json
{
  "codegen": {
    "generators": {
      "contract": { "enabled": true },
      "adminNav": {
        "enabled": true,
        "loader": ".spfn/generators/admin-nav.ts"
      }
    }
  }
}
```

## How Codegen Integrates with spfn dev

When you run `npm run spfn:dev`, SPFN starts three processes:

1. **Next.js Dev Server** - Your frontend (port 3000)
2. **SPFN API Server** - Your backend routes (port 8790)
3. **Codegen Watcher** - Automatic code generation

The watcher:
- Generates all code once on startup
- Watches for file changes matching generator patterns
- Regenerates automatically when files change
- Handles errors gracefully (one generator failure doesn't stop others)

## Troubleshooting

### Client not generating

**Check:**
1. Routes directory exists: `src/server/routes`
2. Contracts are properly exported
3. No syntax errors in route files
4. Watch patterns match your files

**Run generation manually:**
```bash
# Generate once without watch
npx tsx -e "
import { CodegenOrchestrator, loadCodegenConfig, createGeneratorsFromConfig } from '@spfn/core/codegen';
const config = loadCodegenConfig(process.cwd());
const generators = createGeneratorsFromConfig(config);
const orchestrator = new CodegenOrchestrator({ generators, cwd: process.cwd(), debug: true });
await orchestrator.generateAll();
"
```

### Files not regenerating on change

**Ensure:**
- Watch patterns include the changed files
- No infinite loops (generator not watching its own output)
- File changes are being saved properly

### Generated client has errors

**Common issues:**
- Contract types don't match route implementation
- Missing TypeBox imports in contracts
- Incorrect response type definitions

**Fix:** Update your contracts to match your route responses exactly.

## Best Practices

### Route Contracts

✅ **Do:**
- Define clear, specific contracts
- Use descriptive property names
- Include JSDoc comments for documentation
- Keep response types focused

```typescript
/**
 * Get paginated list of users
 */
export const getUsersContract = {
  method: 'GET' as const,
  path: '/',
  query: Type.Object({
    /** Page number (1-indexed) */
    page: Type.Optional(Type.Number()),
    /** Items per page */
    limit: Type.Optional(Type.Number()),
  }),
  // ...
};
```

❌ **Don't:**
- Use generic names like `data` or `result`
- Return inconsistent response structures
- Mix concerns in a single endpoint

### Generated Files

✅ **Do:**
- Add `*.generated.*` to `.gitignore` if you regenerate on build
- Commit generated files if they're stable (recommended for SPFN)
- Review generated code after major changes

❌ **Don't:**
- Manually edit generated files (changes will be overwritten)
- Ignore TypeScript errors in generated files
- Watch generated files in your generators (causes infinite loops)

### Performance

✅ **Do:**
- Use specific watch patterns (e.g., `src/server/routes/**/*.ts`)
- Make generators idempotent (same input = same output)
- Log progress with `debug` flag during development

❌ **Don't:**
- Watch entire project directory
- Perform expensive operations synchronously
- Generate on every file change without debouncing (handled by orchestrator)

## Learn More

- [Codegen API Reference](../node_modules/@spfn/core/src/codegen/README.md)
- [Generator Interface](../node_modules/@spfn/core/src/codegen/generator.ts)
- [Example Generators](../node_modules/@spfn/core/src/codegen/generators/)

## Need Help?

- [GitHub Issues](https://github.com/spfn/spfn/issues)
- [Documentation](https://github.com/spfn/spfn)
