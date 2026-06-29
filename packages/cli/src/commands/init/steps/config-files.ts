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
 * Write an env file. When it already exists we never overwrite user values —
 * instead we append any SPFN keys the file is missing, so required vars like
 * SPFN_API_URL are added even on a project that already has its own env file.
 */
function writeEnvFile(cwd: string, filename: string, content: string): void
{
    const filePath = join(cwd, filename);

    if (!existsSync(filePath))
    {
        writeFileSync(filePath, content);
        logger.success(`Created ${filename}`);

        return;
    }

    mergeMissingEnvKeys(filePath, filename, content);
}

/**
 * Append the assignment lines from `template` whose keys are absent from the
 * existing file, preserving everything the user already has.
 */
function mergeMissingEnvKeys(filePath: string, filename: string, template: string): void
{
    const existing = readFileSync(filePath, 'utf-8');
    const existingKeys = collectEnvKeys(existing);

    const missing = template
        .split('\n')
        .filter((line) =>
        {
            const key = envKeyOf(line);

            return key !== null && !existingKeys.has(key);
        });

    if (missing.length === 0)
    {
        return;
    }

    const block = `\n# Added by spfn init\n${missing.join('\n')}\n`;
    writeFileSync(filePath, existing.replace(/\n*$/, '\n') + block);
    logger.success(`Updated ${filename} (added ${missing.length} SPFN key(s))`);
}

/**
 * Extract the variable name from an `KEY=value` line, or null for comments/blanks.
 */
function envKeyOf(line: string): string | null
{
    // Tolerate dotenv's `export ` prefix and surrounding whitespace, so a key
    // already present as `export DATABASE_URL=` isn't re-appended with our default.
    const match = line.match(/^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=/);

    return match ? match[1] : null;
}

function collectEnvKeys(content: string): Set<string>
{
    const keys = new Set<string>();

    for (const line of content.split('\n'))
    {
        const key = envKeyOf(line);
        if (key !== null)
        {
            keys.add(key);
        }
    }

    return keys;
}

/**
 * Update .gitignore with SPFN patterns, creating the file if it doesn't exist.
 *
 * The env files generated above are real, secret-bearing files (.env.server holds
 * DB/cache credentials), so the ignore rules must be guaranteed even in a project
 * that ships without a .gitignore.
 */
function updateGitignore(cwd: string): void
{
    const gitignorePath = join(cwd, '.gitignore');
    const existed = existsSync(gitignorePath);

    try
    {
        const content = existed ? readFileSync(gitignorePath, 'utf-8') : '';
        let updated = content;
        let changed = false;

        // Add .spfn directory. Substring match so an existing `.spfn`, `.spfn/`
        // or `/.spfn/` rule all count — gitignore line order is irrelevant, so we
        // just append rather than splicing after a `/build` anchor.
        if (!content.includes('.spfn'))
        {
            updated += `
# spfn
/.spfn/
`;
            changed = true;
        }

        // Add env local patterns (Next.js)
        if (!hasIgnoreRule(content, '.env.local') && !hasIgnoreRule(content, '.env.*.local'))
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
        if (!hasIgnoreRule(content, '.env.server'))
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
            logger.success(existed
                ? 'Updated .gitignore with .spfn directory and env patterns'
                : 'Created .gitignore with .spfn directory and env patterns');
        }
    }
    catch (error)
    {
        logger.warn('Could not update .gitignore — add .env.local and .env.server manually before committing, so the generated .env.server secrets are not tracked');
    }
}

/**
 * True when `pattern` is present as its own line (ignoring surrounding
 * whitespace), so `.env.server` does not match `.env.server.example`.
 */
function hasIgnoreRule(content: string, pattern: string): boolean
{
    return content.split('\n').some((line) => line.trim() === pattern);
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
