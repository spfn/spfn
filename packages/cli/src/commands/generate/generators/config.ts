/**
 * Configuration file generators
 */

import { join } from 'path';
import { writeFileSync } from 'fs';
import { toSnakeCase } from '../string-utils.js';

/**
 * Generate package.json
 */
export function generatePackageJson(fnDir: string, scope: string, fnName: string, description: string): void
{
    const content = {
        name: `${scope}/${fnName}`,
        version: '0.1.0-alpha.1',
        description,
        type: 'module',
        main: './dist/index.js',
        types: './dist/index.d.ts',
        exports: {
            '.': {
                types: './dist/index.d.ts',
                import: './dist/index.js',
                require: './dist/index.js',
            },
            './server': {
                types: './dist/server.d.ts',
                import: './dist/server.js',
                require: './dist/server.js',
            },
            './client': {
                types: './dist/client.d.ts',
                import: './dist/client.js',
                require: './dist/client.js',
            },
        },
        files: ['dist', 'migrations', 'README.md'],
        scripts: {
            build: 'npm run db:generate && tsup',
            watch: 'tsup --watch',
            dev: 'tsup --watch',
            'type-check': 'tsc --noEmit',
            clean: 'rm -rf dist migrations',
            'db:generate': 'drizzle-kit generate',
            codegen: 'spfn codegen run',
            test: 'vitest',
            'test:watch': 'vitest --watch',
            'test:coverage': 'vitest run --coverage',
            'test:routes': 'vitest src/server/routes',
            'docker:test:up': 'docker compose -f docker-compose.test.yml up -d',
            'docker:test:down': 'docker compose -f docker-compose.test.yml down',
            'docker:test:logs': 'docker compose -f docker-compose.test.yml logs -f',
        },
        keywords: ['spfn', fnName, 'nextjs', 'typescript'],
        author: 'SPFN Team',
        license: 'MIT',
        spfn: {
            prefix: `/_${fnName}`,
            schemas: ['./dist/server/entities/*.js'],
            routes: { dir: './dist/server/routes' },
            migrations: { dir: './migrations' },
            codegen: {
                generators: [
                    {
                        name: '@spfn/core:contract',
                        contractsDir: 'src/lib/contracts',
                        outputPath: 'src/api',
                        runOn: ['build', 'manual'],
                    },
                    {
                        name: '${scope}/${fnName}:example',
                        runOn: ['manual'],
                    },
                ],
            },
            setupMessage: `  📚 Next steps:\n    1. Import from '${scope}/${fnName}'\n    2. View data: pnpm spfn db studio\n    3. API at: http://localhost:8790/_${fnName}`,
        },
        peerDependencies: {
            '@spfn/core': 'workspace:*',
            'drizzle-orm': '^0.44.0',
            next: '^15.0.0',
            react: '^18.0.0 || ^19.0.0',
        },
        dependencies: {
            '@sinclair/typebox': '^0.34.0',
        },
        devDependencies: {
            '@types/node': '^20.11.0',
            '@types/react': '^19',
            '@vitest/coverage-v8': '^4.0.6',
            'drizzle-kit': '^0.31.6',
            'drizzle-typebox': '^0.1.0',
            glob: '^11.0.3',
            postgres: '^3.4.0',
            spfn: 'workspace:*',
            tsup: '^8.3.5',
            tsx: '^4.19.2',
            typescript: '^5',
            vitest: '^4.0.6',
        },
    };

    writeFileSync(
        join(fnDir, 'package.json'),
        JSON.stringify(content, null, 2) + '\n'
    );
}

/**
 * Generate tsconfig.json
 */
export function generateTsConfig(fnDir: string): void
{
    const content = {
        extends: '../../tsconfig.json',
        compilerOptions: {
            outDir: './dist',
            rootDir: './src',
            composite: true,
            paths: {
                '@/*': ['./src/*'],
            },
        },
        include: ['src/**/*'],
        exclude: ['node_modules', 'dist'],
    };

    writeFileSync(
        join(fnDir, 'tsconfig.json'),
        JSON.stringify(content, null, 2) + '\n'
    );
}

/**
 * Generate tsup.config.ts
 */
export function generateTsupConfig(fnDir: string): void
{
    const content = `import { defineConfig } from 'tsup';
import { glob } from 'glob';
import * as path from 'path';

// Find all route handler files
const routeFiles = glob.sync('src/server/routes/**/index.ts');
const routeEntries = Object.fromEntries(
    routeFiles.map((file) =>
    {
        const key = file
            .replace('src/', '')
            .replace('/index.ts', '/index')
            .replace('.ts', '');
        return [key, file];
    })
);

// Find all entity files
const entityFiles = glob.sync('src/server/entities/**/*.ts');
const entityEntries = Object.fromEntries(
    entityFiles.map((file) =>
    {
        const key = file.replace('src/', '').replace('.ts', '');
        return [key, file];
    })
);

// Find all contract files
const contractFiles = glob.sync('src/lib/contracts/**/*.ts');
const contractEntries = Object.fromEntries(
    contractFiles.map((file) =>
    {
        const key = file.replace('src/', '').replace('.ts', '');
        return [key, file];
    })
);

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        server: 'src/server.ts',
        client: 'src/client.ts',
        ...entityEntries,
        ...contractEntries,
        ...routeEntries,
    },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: false,
    esbuildOptions(options)
    {
        // Add path alias support
        options.alias = {
            '@': path.resolve(__dirname, './src'),
        };
    },
    external: [
        '@spfn/core',
        'drizzle-orm',
        'next',
        'react',
        '@sinclair/typebox',
        'jiti',
        'zustand',
        'server-only',
        'react-dom',
    ],
});
`;

    writeFileSync(join(fnDir, 'tsup.config.ts'), content);
}

/**
 * Generate drizzle.config.ts
 */
export function generateDrizzleConfig(fnDir: string, scope: string, fnName: string): void
{
    const schemaName = `spfn_${toSnakeCase(fnName)}`;

    const content = `import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Config for ${scope}/${fnName} package
 *
 * This generates migrations for the ${fnName} schema that will be
 * bundled with the package and applied automatically when
 * users run \`spfn db push\` or \`spfn db migrate\`
 */
export default defineConfig({
    schema: './src/server/entities/*.ts',
    out: './migrations',
    dialect: 'postgresql',
    schemaFilter: ['${schemaName}'], // Only generate for ${fnName} schema
});
`;

    writeFileSync(join(fnDir, 'drizzle.config.ts'), content);
}

/**
 * Generate initial migration with schema creation
 */
export function generateInitMigration(fnDir: string, fnName: string): void
{
    const { loadTemplate } = require('../template-loader.js');
    const { toPascalCase } = require('../string-utils.js');

    const content = loadTemplate('init-migration', {
        FN_NAME: fnName,
        PASCAL_NAME: toPascalCase(fnName),
    });

    // Create migrations directory and meta directory
    const migrationsDir = join(fnDir, 'migrations');
    const metaDir = join(migrationsDir, 'meta');

    const { mkdirSync } = require('fs');
    mkdirSync(migrationsDir, { recursive: true });
    mkdirSync(metaDir, { recursive: true });

    // Write initial migration
    writeFileSync(join(migrationsDir, '0000_init.sql'), content);

    // Create meta journal
    const journal = {
        version: '7',
        dialect: 'postgresql',
        entries: [
            {
                idx: 0,
                version: '7',
                when: Date.now(),
                tag: '0000_init',
                breakpoints: true,
            },
        ],
    };
    writeFileSync(join(metaDir, '_journal.json'), JSON.stringify(journal, null, 2));

    // Create snapshot
    const snapshot = {
        id: '00000000-0000-0000-0000-000000000000',
        prevId: '',
        version: '7',
        dialect: 'postgresql',
        tables: {},
        enums: {},
        schemas: {},
        sequences: {},
        _meta: {
            schemas: {},
            tables: {},
            columns: {},
        },
    };
    writeFileSync(join(metaDir, '0000_snapshot.json'), JSON.stringify(snapshot, null, 2));
}

/**
 * Generate example generator file
 */
export function generateExampleGenerator(fnDir: string, scope: string, fnName: string): void
{
    const { toPascalCase } = require('../string-utils.js');
    const pascalName = toPascalCase(fnName);

    const content = `/**
 * Example Custom Generator for ${fnName}
 *
 * This is a template for creating custom code generators.
 * Uncomment and modify to create your own generator.
 */

import type { Generator, GeneratorOptions } from '@spfn/core/codegen';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

/**
 * Example: Auto-generate index files for types
 */
export function create${pascalName}ExampleGenerator(): Generator
{
    return {
        name: '${fnName}:example',

        // Define when this generator should run
        // Options: 'build', 'manual', 'watch', 'start'
        runOn: ['build', 'manual'],

        // Optional: watch for file changes
        watchPatterns: [
            'src/lib/types/**/*.ts',
        ],

        async generate(options: GeneratorOptions): Promise<void>
        {
            const { cwd, debug } = options;

            if (debug)
            {
                console.log('Running ${fnName} example generator...');
            }

            // Your generation logic here
            const outputDir = join(cwd, 'src/generated');
            const outputPath = join(outputDir, 'example.ts');

            // Ensure output directory exists
            mkdirSync(outputDir, { recursive: true });

            // Generate content
            const content = \`/**
 * Auto-generated file
 *
 * @generated \${new Date().toISOString()}
 */

export const generatedAt = '\${new Date().toISOString()}';
export const moduleName = '${fnName}';
\`;

            writeFileSync(outputPath, content, 'utf-8');

            if (debug)
            {
                console.log('✓ Generated:', outputPath);
            }
        },
    };
}
`;

    const generatorsDir = join(fnDir, 'src/server/generators');
    mkdirSync(generatorsDir, { recursive: true });

    writeFileSync(
        join(generatorsDir, 'example-generator.ts'),
        content
    );

    // Also create generators index
    const indexContent = `/**
 * Custom Generators
 *
 * Export your custom generators here.
 *
 * The example generator is already registered in package.json.
 * Comment it out if you don't want to use it.
 */

export { create${pascalName}ExampleGenerator } from './example-generator.js';
`;

    writeFileSync(
        join(generatorsDir, 'index.ts'),
        indexContent
    );
}

/**
 * Generate README.md
 */
export function generateReadme(fnDir: string, scope: string, fnName: string, description: string): void
{
    const content = `# ${scope}/${fnName}

${description}

## 📦 Installation

For users of your module:

\`\`\`bash
spfn add ${scope}/${fnName}
\`\`\`

## 🚀 Usage

\`\`\`typescript
// Server-side
import { /* your entities, repositories */ } from '${scope}/${fnName}/server';

// Client-side
import { /* your hooks, components */ } from '${scope}/${fnName}/client';

// Generated API client
import { ${fnName}Api } from '${scope}/${fnName}/api';

// Example: Using the generated API client
const data = await ${fnName}Api.list();
\`\`\`

## 📁 Project Structure

\`\`\`
src/
├── lib/
│   ├── contracts/         # API contracts (shared types)
│   └── types/            # Shared TypeScript types
├── server/
│   ├── entities/         # Drizzle ORM entities
│   ├── repositories/     # Data access layer
│   ├── routes/           # API route handlers
│   ├── helpers/          # Server utilities
│   └── generators/       # Code generators (optional)
├── client/
│   ├── hooks/            # React hooks
│   ├── store/            # Zustand stores
│   └── components/       # React components
├── api/                  # Auto-generated API client (do not edit manually)
├── index.ts              # Main entry point
├── server.ts             # Server exports
└── client.ts             # Client exports
\`\`\`

## 🛠️ Development Guide

### Available Scripts

\`\`\`bash
# Development
pnpm dev                  # Watch mode - auto rebuild on changes
pnpm build                # Build for production
pnpm type-check           # TypeScript type checking

# Database
pnpm db:generate          # Generate migrations from entities
pnpm clean                # Clean dist and migrations

# Code Generation
pnpm codegen              # Generate API client from contracts

# Testing
pnpm test                 # Run tests
pnpm test:watch           # Watch mode
pnpm test:coverage        # Generate coverage report
pnpm test:routes          # Test only routes

# Docker (for testing)
pnpm docker:test:up       # Start test database
pnpm docker:test:down     # Stop test database
pnpm docker:test:logs     # View database logs
\`\`\`

### Development Workflow

1. **Define Entities** (\`src/server/entities/\`)
   \`\`\`typescript
   // src/server/entities/${fnName}-example.ts
   import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';

   export const ${fnName}Examples = pgTable('${fnName}_examples', {
     id: uuid('id').primaryKey().defaultRandom(),
     name: text('name').notNull(),
     createdAt: timestamp('created_at').defaultNow().notNull(),
   });
   \`\`\`

2. **Generate Migrations**
   \`\`\`bash
   pnpm db:generate
   \`\`\`

3. **Create Repositories** (\`src/server/repositories/\`)
   \`\`\`typescript
   // src/server/repositories/example-repository.ts
   import { db } from '@spfn/core/db';
   import { ${fnName}Examples } from '../entities/${fnName}-example';

   export class ExampleRepository {
     static async findAll() {
       return db.select().from(${fnName}Examples);
     }
   }
   \`\`\`

4. **Define Contracts** (\`src/lib/contracts/\`)
   \`\`\`typescript
   // src/lib/contracts/example.ts
   import { contract } from '@spfn/core';
   import { Type as t } from '@sinclair/typebox';

   export const getExamplesContract = contract({
     method: 'GET',
     path: '/_${fnName}/examples',
     responses: {
       200: t.Array(t.Object({
         id: t.String(),
         name: t.String(),
         createdAt: t.String(),
       })),
     },
   });
   \`\`\`

5. **Create Routes** (\`src/server/routes/\`)
   \`\`\`typescript
   // src/server/routes/examples/index.ts
   import { route } from '@spfn/core';
   import { getExamplesContract } from '@/lib/contracts/example';
   import { ExampleRepository } from '@/server/repositories/example-repository';

   export const GET = route(getExamplesContract, async () => {
     const examples = await ExampleRepository.findAll();
     return { status: 200, body: examples };
   });
   \`\`\`

6. **Generate API Client**
   \`\`\`bash
   pnpm codegen
   \`\`\`

   This generates type-safe API client in \`src/api/\`:
   \`\`\`typescript
   // Auto-generated
   export const ${fnName}Api = {
     examples: Examples,
     // ... other resources
   };
   \`\`\`

7. **Write Tests** (\`src/server/routes/__tests__/\`)
   \`\`\`typescript
   import { describe, it, expect, beforeAll } from 'vitest';
   import { GET } from '../examples/index';

   describe('GET /_${fnName}/examples', () => {
     it('should return all examples', async () => {
       const response = await GET();
       expect(response.status).toBe(200);
       expect(Array.isArray(response.body)).toBe(true);
     });
   });
   \`\`\`

8. **Create Client Hooks** (optional)
   \`\`\`typescript
   // src/client/hooks/use-examples.ts
   'use client';
   import { useState, useEffect } from 'react';
   import { ${fnName}Api } from '@/api';

   export function useExamples() {
     const [examples, setExamples] = useState([]);
     const [loading, setLoading] = useState(true);

     useEffect(() => {
       ${fnName}Api.examples.list()
         .then(setExamples)
         .finally(() => setLoading(false));
     }, []);

     return { examples, loading };
   }
   \`\`\`

### Configuration

The module is configured via \`package.json\`:

\`\`\`json
{
  "spfn": {
    "prefix": "/_${fnName}",
    "schemas": ["./dist/server/entities/*.js"],
    "routes": { "dir": "./dist/server/routes" },
    "migrations": { "dir": "./migrations" },
    "codegen": {
      "generators": [{
        "name": "@spfn/core:contract",
        "contractsDir": "src/lib/contracts",
        "outputPath": "src/api"
      }]
    }
  }
}
\`\`\`

#### Configuration Options

| Field | Type | Description |
|-------|------|-------------|
| \`prefix\` | \`string\` | API route prefix for this module. Used for namespacing routes and generating API client name. Example: \`"/_${fnName}"\` becomes \`${fnName}Api\` |
| \`schemas\` | \`string[]\` | Glob patterns for Drizzle entity files. These are used by \`spfn db push\` to apply migrations. |
| \`routes.dir\` | \`string\` | Directory containing compiled route handlers. Used by \`spfn start\` to load routes. |
| \`migrations.dir\` | \`string\` | Directory containing database migration files generated by \`drizzle-kit generate\`. |
| \`codegen.generators\` | \`Generator[]\` | Array of code generators to run. Built-in: \`@spfn/core:contract\` for API client generation. |
| \`setupMessage\` | \`string\` | (Optional) Message shown after \`spfn add ${scope}/${fnName}\` to guide users. |

#### Built-in Generator: @spfn/core:contract

The contract generator automatically creates type-safe API clients from your route contracts.

\`\`\`json
{
  "name": "@spfn/core:contract",
  "contractsDir": "src/lib/contracts",  // Where to scan for contracts
  "outputPath": "src/api"                // Where to generate API client
}
\`\`\`

**How it works:**
1. Scans \`contractsDir\` for contract exports
2. Groups routes by resource (based on file name)
3. Generates:
   - Resource files (\`src/api/Examples.ts\`)
   - Type exports for params, query, body, response
   - Main index file with \`${fnName}Api\` object
4. Uses \`prefix\` to generate unique API name (avoids naming conflicts)

**Generated API structure:**
\`\`\`typescript
// src/api/index.ts
export const ${fnName}Api = {
  examples: Examples,           // Camel case keys
  exampleById: ExampleById,
  // ...
};
\`\`\`

## 🎨 Custom Generators

You can create custom code generators for your module. Generators run automatically during development and build.

### Creating a Custom Generator

1. **Create generator file** (\`src/server/generators/\`)

\`\`\`typescript
// src/server/generators/sync-generator.ts
import type { Generator, GeneratorOptions } from '@spfn/core/codegen';
import { writeFileSync } from 'fs';
import { join } from 'path';

export function createSyncGenerator(): Generator {
  return {
    name: '${fnName}-sync',

    // Define when this generator should run
    runOn: ['build', 'manual'],  // 'build', 'manual', 'watch', 'start'

    // Optional: watch for file changes
    watchPatterns: [
      'src/server/entities/**/*.ts',
      'src/lib/types/**/*.ts',
    ],

    async generate(options: GeneratorOptions): Promise<void> {
      const { cwd, debug } = options;

      if (debug) {
        console.log('Running ${fnName} sync generator...');
      }

      // Your generation logic here
      const outputPath = join(cwd, 'src/generated/sync.ts');
      const content = \`// Auto-generated sync file
export const generatedAt = '\${new Date().toISOString()}';
\`;

      writeFileSync(outputPath, content, 'utf-8');

      if (debug) {
        console.log('✓ Generated:', outputPath);
      }
    },
  };
}
\`\`\`

2. **Export generator** (\`src/server/generators/index.ts\`)

\`\`\`typescript
export { createSyncGenerator } from './sync-generator.js';
\`\`\`

3. **Register in package.json**

\`\`\`json
{
  "spfn": {
    "codegen": {
      "generators": [
        {
          "name": "@spfn/core:contract",
          "contractsDir": "src/lib/contracts",
          "outputPath": "src/api"
        },
        {
          "name": "${scope}/${fnName}:sync",  // Custom generator
          "watchPatterns": ["src/server/entities/**/*.ts"]
        }
      ]
    }
  }
}
\`\`\`

### Generator Options

\`\`\`typescript
interface Generator {
  name: string;                    // Generator name
  runOn?: GeneratorTrigger[];      // When to run: 'build' | 'manual' | 'watch' | 'start'
  watchPatterns?: string[];        // Glob patterns to watch
  generate: (options: GeneratorOptions) => Promise<void>;
}

interface GeneratorOptions {
  cwd: string;                     // Current working directory
  debug?: boolean;                 // Debug mode flag
  trigger?: {                      // Trigger information (for watch mode)
    type: 'watch' | 'manual' | 'build' | 'start';
    changedFile?: {
      path: string;
      event: 'add' | 'change' | 'unlink';
    };
  };
}
\`\`\`

### Real-World Example: Type Sync Generator

\`\`\`typescript
// src/server/generators/type-sync-generator.ts
import type { Generator, GeneratorOptions } from '@spfn/core/codegen';
import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

/**
 * Generates a type index that auto-exports all types
 */
export function createTypeSyncGenerator(): Generator {
  return {
    name: '${fnName}-type-sync',
    runOn: ['build', 'watch', 'manual'],
    watchPatterns: ['src/lib/types/**/*.ts'],

    async generate(options: GeneratorOptions): Promise<void> {
      const { cwd, debug } = options;
      const typesDir = join(cwd, 'src/lib/types');
      const outputFile = join(typesDir, 'index.ts');

      // Read all type files
      const files = readdirSync(typesDir)
        .filter(f => f.endsWith('.ts') && f !== 'index.ts')
        .map(f => f.replace('.ts', ''));

      // Generate exports
      const content = \`/**
 * Auto-generated type index
 *
 * @generated \${new Date().toISOString()}
 */

\${files.map(f => \`export * from './\${f}.js';\`).join('\\n')}
\`;

      writeFileSync(outputFile, content, 'utf-8');

      if (debug) {
        console.log(\`✓ Synced \${files.length} type files\`);
      }
    },
  };
}
\`\`\`

### Running Generators

\`\`\`bash
# Run all generators
pnpm codegen

# Run specific generator
pnpm spfn codegen run --generator ${scope}/${fnName}:sync

# Watch mode (auto-runs on file changes)
pnpm spfn codegen watch
\`\`\`

## 🧪 Testing

### Setup Test Database

\`\`\`bash
# Start PostgreSQL in Docker
pnpm docker:test:up

# Run tests
pnpm test

# Stop database
pnpm docker:test:down
\`\`\`

### Test Structure

\`\`\`
src/server/routes/
├── examples/
│   ├── index.ts
│   └── __tests__/
│       └── index.test.ts
\`\`\`

## 📚 API Documentation

### Entities

Document your database entities here.

### Routes

- \`GET /_${fnName}/...\` - Description
- \`POST /_${fnName}/...\` - Description
- \`GET /_${fnName}/.../:id\` - Description
- \`PATCH /_${fnName}/.../:id\` - Description
- \`DELETE /_${fnName}/.../:id\` - Description

### Client API

The generated \`${fnName}Api\` provides type-safe methods for all routes.

## 📦 Publishing

1. Update version in \`package.json\`
2. Build the package: \`pnpm build\`
3. Test in a real project
4. Publish: \`npm publish\` (or via your CI/CD)

## 🏗️ Architecture

This module follows SPFN's 3-layer architecture:

- **Shared Layer** (\`lib/\`): Contracts and types shared between client and server
- **Server Layer** (\`server/\`): Database entities, repositories, business logic, API routes
- **Client Layer** (\`client/\`): React hooks, components, state management

## 🤝 Contributing

Contributions are welcome! Please follow the development workflow above.

## 📄 License

MIT
`;

    writeFileSync(join(fnDir, 'README.md'), content);
}