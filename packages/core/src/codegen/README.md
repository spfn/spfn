# @spfn/core/codegen - API Client Generator

Automatic type-safe API client generation from route contracts.

## Features

- ✅ **Automatic Generation**: Scans route contracts and generates typed client code
- ✅ **Type Safety**: Full TypeScript type inference from contracts
- ✅ **Watch Mode**: Automatically regenerates on contract changes
- ✅ **Resource Grouping**: Organizes client methods by resource
- ✅ **JSDoc Comments**: Includes documentation in generated code
- ✅ **Zero Config**: Works out of the box with sensible defaults

---

## Quick Start

### 1. Add Script to package.json

```json
{
  "scripts": {
    "generate:client": "node dist/scripts/generate-client.js",
    "generate:client:watch": "node dist/scripts/generate-client.js --watch"
  }
}
```

### 2. Run Generator

```bash
# Generate once
npm run generate:client

# Watch mode (regenerate on changes)
npm run generate:client:watch
```

### 3. Use Generated Client

```typescript
import { apiClient } from './generated/api-client';

// Fully typed API calls
const users = await apiClient.users.getAll();
const user = await apiClient.users.getById({ id: '123' });
const newUser = await apiClient.users.create({
  body: { name: 'John', email: 'john@example.com' }
});
```

---

## How It Works

### Contract-Based Generation

The generator scans your route contracts and automatically creates a type-safe client:

```typescript
// src/server/routes/users/contract.ts
import { Type } from '@sinclair/typebox';
import type { RouteContract } from '@spfn/core/route';

export const getUsersContract = {
  method: 'GET' as const,
  path: '/',
  response: Type.Array(Type.Object({
    id: Type.String(),
    name: Type.String()
  }))
} as const satisfies RouteContract;

export const getUserContract = {
  method: 'GET' as const,
  path: '/:id',
  params: Type.Object({
    id: Type.String()
  }),
  response: Type.Object({
    id: Type.String(),
    name: Type.String(),
    email: Type.String()
  })
} as const satisfies RouteContract;
```

### Generated Client

```typescript
// src/generated/api-client.ts (auto-generated)
import { createClient } from '@spfn/core/client';

const client = createClient();

export const apiClient = {
  users: {
    getAll: () => client.call('/users', getUsersContract),
    getById: (options) => client.call('/users/:id', getUserContract, options),
  }
};
```

---

## CLI Usage

### Basic Commands

```bash
# Generate once
node dist/scripts/generate-client.js

# Watch mode
node dist/scripts/generate-client.js --watch

# Custom contracts directory
node dist/scripts/generate-client.js --contracts ./src/contracts

# Custom output file
node dist/scripts/generate-client.js --output ./src/api/client.ts

# Custom base URL
node dist/scripts/generate-client.js --base-url https://api.example.com
```

### CLI Options

| Option | Alias | Description | Default |
|--------|-------|-------------|---------|
| `--contracts` | `-c` | Contracts directory | `src/server/contracts` |
| `--output` | `-o` | Output file path | `src/generated/api-client.ts` |
| `--base-url` | `-b` | Base URL for API client | (uses client default) |
| `--watch` | `-w` | Watch for changes | `false` |
| `--help` | `-h` | Show help message | - |

### Examples

```bash
# Basic usage (default paths)
npm run generate:client

# Custom output location
node dist/scripts/generate-client.js \
  --contracts ./contracts \
  --output ./src/api/generated-client.ts

# Production API URL
node dist/scripts/generate-client.js \
  --base-url https://api.production.com

# Development with watch mode
node dist/scripts/generate-client.js --watch
```

---

## Programmatic API

You can also use the codegen API programmatically:

```typescript
import { scanContracts, generateClient } from '@spfn/core/codegen';
import { resolve } from 'path';

// Scan contracts
const contractsDir = resolve(process.cwd(), 'src/server/contracts');
const mappings = await scanContracts(contractsDir);

console.log(`Found ${mappings.length} contracts`);

// Generate client
const stats = await generateClient(mappings, {
  routesDir: contractsDir,
  outputPath: resolve(process.cwd(), 'src/generated/api-client.ts'),
  baseUrl: 'http://localhost:4000',
  includeTypes: true,
  includeJsDoc: true
});

console.log(`Generated ${stats.methodsGenerated} methods`);
console.log(`Grouped into ${stats.resourcesGenerated} resources`);
```

---

## Contract Requirements

For contracts to be detected and included in the generated client, they must:

1. **Export named constants** ending with `Contract`
2. **Include `method` and `path`** properties
3. **Satisfy `RouteContract` type**

### Valid Contract Examples

```typescript
// ✅ Named export with Contract suffix
export const getUserContract = {
  method: 'GET',
  path: '/:id',
  params: Type.Object({ id: Type.String() }),
  response: Type.Object({ /* ... */ })
} as const satisfies RouteContract;

// ✅ Multiple contracts in one file
export const createUserContract = { /* ... */ };
export const updateUserContract = { /* ... */ };
export const deleteUserContract = { /* ... */ };
```

### Invalid Examples

```typescript
// ❌ Default export (not detected)
export default { method: 'GET', path: '/' };

// ❌ Missing 'Contract' suffix
export const getUser = { method: 'GET', path: '/:id' };

// ❌ Missing method or path
export const getUserContract = {
  response: Type.Object({ /* ... */ })
};
```

---

## Resource Grouping

The generator automatically groups related endpoints into resources based on the file path:

### Directory Structure → Resource Names

```
contracts/
├── users/
│   ├── list.ts      → apiClient.users.list()
│   ├── get.ts       → apiClient.users.get()
│   └── create.ts    → apiClient.users.create()
└── posts/
    ├── list.ts      → apiClient.posts.list()
    └── create.ts    → apiClient.posts.create()
```

### Naming Conventions

- **Directory name** becomes the resource name (e.g., `users`, `posts`)
- **File name** becomes the method name (e.g., `list`, `get`, `create`)
- **Contract name** is used if it differs from file name

---

## Generated Client Structure

### Basic Structure

```typescript
import { createClient, type ContractClient } from '@spfn/core/client';

const client = createClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'
});

export const apiClient = {
  users: {
    list: (options?) => client.call('/users', listUsersContract, options),
    get: (options) => client.call('/users/:id', getUserContract, options),
    create: (options) => client.call('/users', createUserContract, options),
  },
  posts: {
    list: (options?) => client.call('/posts', listPostsContract, options),
    create: (options) => client.call('/posts', createPostContract, options),
  }
};

// Export underlying client for advanced usage
export { client };
```

### Type Inference

The generated client includes full type inference:

```typescript
// TypeScript knows the exact return type
const users = await apiClient.users.list();
// users: Array<{ id: string, name: string, email: string }>

// TypeScript validates parameters
const user = await apiClient.users.get({ params: { id: '123' } });
// ✅ Typed params from contract.params

const newUser = await apiClient.users.create({
  body: { name: 'John', email: 'john@example.com' }
});
// ✅ Typed body from contract.body
```

---

## Watch Mode

Watch mode automatically regenerates the client when contracts change:

```bash
npm run generate:client:watch
```

**Features:**
- Watches for file additions, changes, and deletions
- Debounces multiple changes
- Shows generation stats after each regeneration
- Press `Ctrl+C` to stop

**Output:**
```
🔍 Scanning contracts...
   Contracts directory: /project/src/server/contracts
✅ Found 12 contracts
   Contracts: 12
   Contract files: 6

📝 Generating client...

✨ Client generated successfully!
   Output: /project/src/generated/api-client.ts
   Resources: 4
   Methods: 12
   Time: 145ms

👀 Watching for changes...
```

---

## Integration with Development Workflow

### Next.js Project Setup

```json
{
  "scripts": {
    "dev": "concurrently \"npm run generate:client:watch\" \"next dev\"",
    "build": "npm run generate:client && next build",
    "generate:client": "node dist/scripts/generate-client.js",
    "generate:client:watch": "node dist/scripts/generate-client.js --watch"
  }
}
```

### Pre-commit Hook

```bash
# .husky/pre-commit
#!/bin/sh
npm run generate:client
git add src/generated/api-client.ts
```

### CI/CD Pipeline

```yaml
# .github/workflows/ci.yml
- name: Generate API Client
  run: npm run generate:client

- name: Check for changes
  run: |
    if [ -n "$(git status --porcelain)" ]; then
      echo "Generated client is out of date!"
      exit 1
    fi
```

---

## Troubleshooting

### No Contracts Found

**Problem:** Generator reports 0 contracts found

**Solutions:**
- Ensure contracts export named constants ending with `Contract`
- Verify contracts directory path is correct
- Check that contracts include `method` and `path` properties
- Make sure contracts satisfy `RouteContract` type

### Type Errors in Generated Client

**Problem:** TypeScript errors in generated client code

**Solutions:**
- Regenerate client: `npm run generate:client`
- Ensure all contracts have valid TypeBox schemas
- Check that contract types are exported from server

### Client Not Updating

**Problem:** Changes to contracts not reflected in generated client

**Solutions:**
- Run generator manually: `npm run generate:client`
- Check watch mode is running
- Verify output path matches import path
- Restart watch mode if needed

---

## API Reference

### `scanContracts(dir: string): Promise<RouteContractMapping[]>`

Scans directory for route contracts.

**Parameters:**
- `dir` - Directory to scan for contracts

**Returns:** Array of contract mappings with file paths and metadata

---

### `generateClient(mappings, options): Promise<GenerationStats>`

Generates type-safe API client from contract mappings.

**Parameters:**
- `mappings` - Array of contract mappings from `scanContracts()`
- `options` - Generation options

**Options:**
```typescript
interface ClientGenerationOptions {
  routesDir: string;        // Contracts directory (for relative imports)
  outputPath: string;       // Output file path
  baseUrl?: string;         // Default base URL for client
  includeTypes?: boolean;   // Include type exports (default: true)
  includeJsDoc?: boolean;   // Include JSDoc comments (default: true)
}
```

**Returns:**
```typescript
interface GenerationStats {
  resourcesGenerated: number;  // Number of resource groups
  methodsGenerated: number;    // Total number of methods
}
```

---

### `watchAndGenerate(options): Promise<void>`

Watches contracts directory and regenerates on changes.

**Parameters:**
- `options` - Same as `generateClient()` options

---

## Best Practices

### 1. Organize Contracts by Resource

```
✅ Good - grouped by resource
contracts/
├── users/
│   ├── list.ts
│   ├── get.ts
│   └── create.ts
└── posts/
    ├── list.ts
    └── create.ts

❌ Bad - flat structure
contracts/
├── listUsers.ts
├── getUser.ts
├── createUser.ts
├── listPosts.ts
└── createPost.ts
```

### 2. Use Descriptive Contract Names

```typescript
// ✅ Good - clear, descriptive names
export const getUserByIdContract = { /* ... */ };
export const updateUserProfileContract = { /* ... */ };

// ❌ Bad - vague names
export const userContract = { /* ... */ };
export const contract1 = { /* ... */ };
```

### 3. Keep Generated Client in Source Control

```gitignore
# ❌ Don't ignore generated client
# /src/generated/

# ✅ Commit generated client for:
# - Faster builds (no generation needed)
# - Review changes in PRs
# - Ensure consistency across team
```

### 4. Run Generator in CI/CD

Ensure generated client is up-to-date in CI:

```bash
npm run generate:client
git diff --exit-code src/generated/
```

---

## Related

- [@spfn/core/client](../client/README.md) - HTTP client used by generated code
- [@spfn/core/route](../route/README.md) - Route contracts and types
- [TypeBox](https://github.com/sinclairzx81/typebox) - Schema validation