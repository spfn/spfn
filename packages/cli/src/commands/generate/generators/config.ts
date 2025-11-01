/**
 * Configuration file generators
 */

import { join } from 'path';
import { writeFileSync } from 'fs';
import { toSnakeCase } from '../string-utils.js';

/**
 * Generate package.json
 */
export function generatePackageJson(fnDir: string, fnName: string, description: string): void
{
    const content = {
        name: `@spfn/${fnName}`,
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
            clean: 'rm -rf dist migrations',
            'db:generate': 'drizzle-kit generate',
        },
        keywords: ['spfn', fnName, 'nextjs', 'typescript'],
        author: 'SPFN Team',
        license: 'MIT',
        spfn: {
            schemas: ['./dist/server/entities/*.js'],
            routes: { dir: './dist/server/routes' },
            migrations: { dir: './migrations' },
            setupMessage: `  📚 Next steps:\n    1. Import from '@spfn/${fnName}'\n    2. View data: pnpm spfn db studio\n    3. API at: http://localhost:8790/${fnName}`,
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
            '@types/react': '^19',
            'drizzle-kit': '^0.31.6',
            'drizzle-typebox': '^0.1.0',
            glob: '^11.0.3',
            tsup: '^8.3.5',
            tsx: '^4.19.2',
            typescript: '^5',
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
export function generateDrizzleConfig(fnDir: string, fnName: string): void
{
    const schemaName = `spfn_${toSnakeCase(fnName)}`;

    const content = `import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Config for @spfn/${fnName} package
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
 * Generate README.md
 */
export function generateReadme(fnDir: string, fnName: string, description: string): void
{
    const content = `# @spfn/${fnName}

${description}

## Installation

\`\`\`bash
spfn add @spfn/${fnName}
\`\`\`

## Usage

\`\`\`typescript
import { } from '@spfn/${fnName}';
\`\`\`

## API

### Entities

TODO: Document your entities

### Routes

- \`GET /${fnName}\` - List items
- \`POST /${fnName}\` - Create item
- \`GET /${fnName}/:id\` - Get item
- \`PATCH /${fnName}/:id\` - Update item
- \`DELETE /${fnName}/:id\` - Delete item

## Development

\`\`\`bash
# Build the package
npm run build

# Watch mode
npm run watch

# Generate migrations
npm run db:generate
\`\`\`

## License

MIT
`;

    writeFileSync(join(fnDir, 'README.md'), content);
}