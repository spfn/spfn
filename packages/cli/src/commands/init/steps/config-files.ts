import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import fse from 'fs-extra';
import { logger } from '../../../utils/logger.js';

const { writeFileSync } = fse;

/**
 * Setup configuration files:
 * - .env.local (Next.js-facing env: API/app URLs — non-secret, gitignored)
 * - .env.server (SPFN backend env + secrets: DB, cache, pool — never loaded by Next.js, gitignored)
 * - .spfnrc.ts (codegen configuration)
 * - .gitignore (add .spfn directory + env patterns)
 * - tsconfig.json (exclude src/server for Vercel)
 */
export async function setupConfigFiles(cwd: string): Promise<void>
{
    generateEnvFiles(cwd);

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
 * Generate ready-to-use env files, split by which process loads them.
 *
 * .env.local is loaded by Next.js (and also the SPFN backend), so only
 * non-secret, Next.js-facing values go there. .env.server is loaded ONLY by the
 * SPFN backend, so every server secret (DB URL, cache, credentials) lives there
 * and never reaches the Next.js process. Both files are gitignored.
 */
function generateEnvFiles(cwd: string): void
{
    // .env.local — Next.js-facing values (non-secret URLs)
    writeEnvFile(cwd, '.env.local', `# Next.js environment
# Loaded by Next.js (and the SPFN backend). Only non-secret, Next.js-facing
# values belong here — server secrets go in .env.server.

# SPFN API endpoint — browser + Next.js SSR/proxy target
SPFN_API_URL=http://localhost:8790
NEXT_PUBLIC_SPFN_API_URL=http://localhost:8790

# Next.js app URL (used by the SPFN server for CORS/redirects)
SPFN_APP_URL=http://localhost:3790
`);

    // .env.server — SPFN backend only; secrets live here, never loaded by Next.js
    writeEnvFile(cwd, '.env.server', `# SPFN backend environment
# Loaded ONLY by the SPFN server, never by Next.js. Keep all server-only config
# and secrets here so they never reach the Next.js process.

# Environment
NODE_ENV=local

# Logging
SPFN_LOG_LEVEL=info

# Database (matches docker-compose.yml) — secret, server-only
DATABASE_URL=postgresql://spfn:spfn@localhost:5432/spfn_dev

# Cache — Redis/Valkey (optional)
CACHE_URL=redis://localhost:6379

# Database pool
DB_POOL_MAX=10
DB_POOL_IDLE_TIMEOUT=30

# --- Optional secrets (uncomment and set as needed) ---
# DATABASE_WRITE_URL=postgresql://user:password@master:5432/dbname
# DATABASE_READ_URL=postgresql://user:password@replica:5432/dbname
# CACHE_PASSWORD=your-redis-password
`);
}

/**
 * Write an env file (skip if it already exists, to preserve user values)
 */
function writeEnvFile(cwd: string, filename: string, content: string): void
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
                '# production\n/build\n\n# spfn\n/.spfn/',
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
