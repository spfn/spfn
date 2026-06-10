import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import fse from 'fs-extra';
import { logger } from '../../../utils/logger.js';

const { writeFileSync } = fse;

/**
 * Setup configuration files:
 * - .env.example (shared defaults, committed)
 * - .env.local.example (local overrides with secrets, gitignored)
 * - .env.server.example (server-only template incl. secrets; copy to .env.server, gitignored)
 * - .spfnrc.ts (codegen configuration)
 * - .gitignore (add .spfn directory + env patterns)
 * - tsconfig.json (exclude src/server for Vercel)
 */
export async function setupConfigFiles(cwd: string): Promise<void>
{
    generateEnvExamples(cwd);

    // Create .spfnrc.ts for codegen configuration
    const spfnrcPath = join(cwd, '.spfnrc.ts');
    if (!existsSync(spfnrcPath))
    {
        const spfnrcContent = `import { defineConfig, defineGenerator } from '@spfn/core/codegen';

/**
 * SPFN Codegen Configuration
 *
 * Configure code generators here. Generators run during \`spfn dev\` and \`spfn codegen run\`.
 */

export default defineConfig({
    generators: [
        // Route map generator - generates routeName → {method, path} mappings
        // Used by RPC proxy to resolve routes without importing server code
        defineGenerator({
            name: '@spfn/core:route-map',
            routerPath: './src/server/router.ts',
            outputPath: './src/generated/route-map.ts',
        }),
    ]
});
`;
        writeFileSync(spfnrcPath, spfnrcContent);
        logger.success('Created .spfnrc.ts (codegen configuration)');
    }

    updateGitignore(cwd);
    updateTsconfig(cwd);
}

/**
 * Generate separated .env example files
 */
function generateEnvExamples(cwd: string): void
{
    // .env.example — shared defaults (committed, non-sensitive)
    writeEnvExample(cwd, '.env.example', `# Shared defaults (committed)
# These values are shared across all environments.

# Environment
NODE_ENV=local

# Logging
SPFN_LOG_LEVEL=info

# Server
PORT=4000

# SPFN API Server URL (for API Route Proxy and SSR)
SPFN_API_URL=http://localhost:8790
NEXT_PUBLIC_SPFN_API_URL=http://localhost:8790
`);

    // .env.local.example — local overrides (gitignored, sensitive)
    writeEnvExample(cwd, '.env.local.example', `# Local overrides (gitignored)
# Developer-specific values that should NOT be committed.

# Database (matches docker-compose.yml)
DATABASE_URL=postgresql://spfn:spfn@localhost:5432/spfn_dev

# Cache - Redis/Valkey (optional)
CACHE_URL=redis://localhost:6379

# SPFN App URL (optional, for CORS and redirects)
# SPFN_APP_URL=http://localhost:3790
`);

    // .env.server.example — server-only template (copy to .env.server, gitignored)
    writeEnvExample(cwd, '.env.server.example', `# Server-only environment (template)
# Copy to .env.server (gitignored) and fill in real values.
# These values are only loaded by the SPFN server, not by Next.js.

# Database pool
DB_POOL_MAX=10
DB_POOL_IDLE_TIMEOUT=30

# Server timeouts
SERVER_TIMEOUT=120000
SHUTDOWN_TIMEOUT=30000

# --- Secrets (never commit .env.server) ---

# Database write/read URLs (master-replica pattern, optional)
# DATABASE_WRITE_URL=postgresql://user:password@master:5432/dbname
# DATABASE_READ_URL=postgresql://user:password@replica:5432/dbname

# Cache password (optional)
# CACHE_PASSWORD=your-redis-password
`);
}

/**
 * Write a single .env example file (skip if exists)
 */
function writeEnvExample(cwd: string, filename: string, content: string): void
{
    const filePath = join(cwd, filename);

    if (existsSync(filePath))
    {
        return;
    }

    writeFileSync(filePath, content);
    logger.success(`Created ${filename}`);
}

/**
 * Update .gitignore with SPFN patterns
 */
function updateGitignore(cwd: string): void
{
    const gitignorePath = join(cwd, '.gitignore');

    if (!existsSync(gitignorePath))
    {
        return;
    }

    try
    {
        const content = readFileSync(gitignorePath, 'utf-8');
        let updated = content;
        let changed = false;

        // Add .spfn directory
        if (!content.includes('.spfn'))
        {
            updated = updated.replace(
                /# production\n\/build/,
                '# production\n/build\n\n# spfn\n/.spfn/'
            );
            changed = true;
        }

        // Add env local patterns (Next.js)
        if (!content.includes('.env.local') && !content.includes('.env.*.local'))
        {
            updated += `
# environment secrets (local overrides)
.env.local
.env.*.local
`;
            changed = true;
        }

        // Add .env.server independently — it holds server secrets and must be
        // ignored regardless of whether the .env.local block above was added.
        if (!content.includes('.env.server'))
        {
            updated += `
# spfn server env (secrets)
.env.server
`;
            changed = true;
        }

        if (changed)
        {
            writeFileSync(gitignorePath, updated);
            logger.success('Updated .gitignore with .spfn directory and env patterns');
        }
    }
    catch (error)
    {
        logger.warn('Could not update .gitignore (you can add patterns manually)');
    }
}

/**
 * Update tsconfig.json to exclude src/server
 */
function updateTsconfig(cwd: string): void
{
    const tsconfigPath = join(cwd, 'tsconfig.json');

    if (!existsSync(tsconfigPath))
    {
        return;
    }

    try
    {
        const tsconfigContent = readFileSync(tsconfigPath, 'utf-8');
        const tsconfig = JSON.parse(tsconfigContent);

        if (!tsconfig.exclude)
        {
            tsconfig.exclude = [];
        }

        if (!tsconfig.exclude.includes('src/server'))
        {
            tsconfig.exclude.push('src/server');
            writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2) + '\n');
            logger.success('Updated tsconfig.json (excluded src/server for Vercel compatibility)');
        }
    }
    catch (error)
    {
        logger.warn('Could not update tsconfig.json (you can add "src/server" to exclude manually)');
    }
}
