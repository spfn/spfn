import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import fse from 'fs-extra';
import { logger } from '../../../utils/logger.js';

const { writeFileSync } = fse;

// .env.local template — Next.js-facing values (non-secret URLs).
const ENV_LOCAL_TEMPLATE = `# Next.js environment
# Loaded by Next.js (and the SPFN backend). Only non-secret, Next.js-facing
# values belong here — server secrets go in .env.server.

# SPFN API endpoint — browser + Next.js SSR/proxy target
SPFN_API_URL=http://localhost:8790
NEXT_PUBLIC_SPFN_API_URL=http://localhost:8790

# Next.js app URL (used by the SPFN server for CORS/redirects)
SPFN_APP_URL=http://localhost:3790
`;

// .env.server template — SPFN backend only; secrets live here, never loaded by
// Next.js. SERVER_ENV_KEYS is derived from it so the two never drift.
const ENV_SERVER_TEMPLATE = `# SPFN backend environment
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
`;

// .env.example — committed reference, derived from the two templates above so its
// key list never drifts from what init actually generates. Documentation only:
// real values go in .env.local / .env.server (gitignored). Because it is committed,
// concrete DB credentials are replaced with placeholders (AGENTS.md hard rule #4).
const ENV_EXAMPLE_TEMPLATE = `# Example environment — committed reference for the variables SPFN uses.
# Real values live in .env.local (Next.js) and .env.server (backend secrets),
# both gitignored. This file documents the keys; it is not loaded by anything.

${ENV_LOCAL_TEMPLATE}
${ENV_SERVER_TEMPLATE}`.replace(/(postgresql:\/\/)[^@\s/]+@/g, '$1user:password@');

/**
 * Setup configuration files:
 * - .env.local (Next.js-facing env: API/app URLs — non-secret, gitignored)
 * - .env.server (SPFN backend env + secrets: DB, cache, pool — never loaded by Next.js, gitignored)
 * - .env.example (committed, placeholder-only reference for the variables above)
 * - .spfnrc.ts (codegen configuration)
 * - .gitignore (add .spfn directory + env patterns)
 * - tsconfig.json (exclude src/server for Vercel)
 */
export async function setupConfigFiles(cwd: string): Promise<void>
{
    // Update .gitignore first so the secret-bearing .env.server is written under
    // an existing ignore rule, never tracked even briefly.
    updateGitignore(cwd);
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
    writeEnvFile(cwd, '.env.local', ENV_LOCAL_TEMPLATE);
    writeEnvFile(cwd, '.env.server', ENV_SERVER_TEMPLATE);
    writeExampleEnv(cwd, ENV_EXAMPLE_TEMPLATE);
    warnOverriddenServerKeys(cwd);
}

/**
 * Write the committed .env.example reference, but never clobber a user's own.
 */
function writeExampleEnv(cwd: string, content: string): void
{
    const filePath = join(cwd, '.env.example');

    if (existsSync(filePath))
    {
        return;
    }

    writeFileSync(filePath, content);
    logger.success('Created .env.example (committed reference)');
}

// Active (uncommented) keys .env.server owns, derived from its template so the
// two never drift. Used to warn when one is already set in an earlier-loaded file.
const SERVER_ENV_KEYS = collectEnvKeys(ENV_SERVER_TEMPLATE);

// Matches the dotenv files @spfn/core's loadEnv reads (.env, .env.local,
// .env.<nodeEnv>[.local]) for ANY NODE_ENV, but NOT non-dotenv names like
// direnv's .envrc. .env.server (what we generate) is excluded separately.
const DOTENV_FILE = /^\.env(\.[a-z0-9_-]+)?(\.local)?$/i;

/**
 * Warn when a key .env.server owns is already set in another env file the backend
 * loads earlier. .env.server loads last and wins, so the user's existing value
 * (e.g. a real DATABASE_URL in .env.local) is silently overridden at runtime.
 * Best-effort: an unreadable entry is skipped, never fatal to init.
 */
function warnOverriddenServerKeys(cwd: string): void
{
    for (const file of overridableEnvFiles(cwd))
    {
        const content = readEnvFileSafe(join(cwd, file));

        if (content === null)
        {
            continue;
        }

        const keys = collectEnvKeys(content);
        const clashing = [...SERVER_ENV_KEYS].filter((key) => keys.has(key));

        if (clashing.length > 0)
        {
            // .env and .env.local load for every NODE_ENV; the env-specific files
            // (.env.production etc.) only load when that NODE_ENV is active, so don't
            // claim an unconditional override for them.
            const alwaysLoaded = file === '.env' || file === '.env.local';
            const when = alwaysLoaded ? 'its value wins at runtime' : 'its value wins when that NODE_ENV is active';
            logger.warn(`${file} also sets ${clashing.join(', ')} — .env.server loads last and ${when}`);
        }
    }
}

/**
 * The dotenv files loadEnv reads before .env.server, excluding .env.server itself
 * and the committed .env.example / *.example references.
 */
function overridableEnvFiles(cwd: string): string[]
{
    return readdirSync(cwd).filter((name) =>
        DOTENV_FILE.test(name)
        && name !== '.env.server'
        && name !== '.env.example'
        && !name.endsWith('.example'));
}

/**
 * Read a file as text, or null when it's absent, a directory, or unreadable —
 * so a stray `.env`-named directory never crashes init.
 */
function readEnvFileSafe(filePath: string): string | null
{
    try
    {
        return readFileSync(filePath, 'utf-8');
    }
    catch
    {
        return null;
    }
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
    // Count commented keys as present too: a user who commented out DATABASE_URL
    // did so deliberately — don't re-append an active default over their choice.
    const existingKeys = collectDeclaredKeys(existing);

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
    return collectKeys(content, false);
}

/**
 * Like collectEnvKeys but also counts commented `# KEY=` declarations, so a
 * deliberately-disabled key is treated as already present and not re-added.
 */
function collectDeclaredKeys(content: string): Set<string>
{
    return collectKeys(content, true);
}

function collectKeys(content: string, includeCommented: boolean): Set<string>
{
    const keys = new Set<string>();

    for (const line of content.split('\n'))
    {
        // includeCommented strips a leading `# ` first, so `# DATABASE_URL=` and
        // `DATABASE_URL=` both parse through the same envKeyOf rule.
        const key = envKeyOf(includeCommented ? line.replace(/^\s*#\s*/, '') : line);
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
        const additions = pendingIgnoreRules(content);

        if (additions.length === 0)
        {
            return;
        }

        writeFileSync(gitignorePath, content + additions.join(''));
        logger.success(existed
            ? 'Updated .gitignore with .spfn directory and env patterns'
            : 'Created .gitignore with .spfn directory and env patterns');
    }
    catch
    {
        logger.warn('Could not update .gitignore — add .env.local and .env.server manually before committing, so the generated .env.server secrets are not tracked');
    }
}

/**
 * The ignore blocks not already covered by the .gitignore, ready to append.
 */
function pendingIgnoreRules(content: string): string[]
{
    const lines = content.split('\n');
    const rules: string[] = [];

    if (!gitignoreCovers(lines, '.spfn'))
    {
        rules.push('\n# spfn\n/.spfn/\n');
    }

    if (!gitignoreCovers(lines, '.env.local'))
    {
        rules.push('\n# environment secrets (local overrides)\n.env.local\n');
    }

    // Checked independently: a project may already ignore .env.local but not the
    // .env.*.local glob (e.g. a future .env.production.local with real secrets).
    if (!gitignoreCovers(lines, '.env.*.local'))
    {
        rules.push('\n# environment secrets (env-specific local overrides)\n.env.*.local\n');
    }

    if (!gitignoreCovers(lines, '.env.server'))
    {
        rules.push('\n# spfn server env (secrets)\n.env.server\n');
    }

    // Keep the committed .env.example reference tracked even when a broad `.env*`
    // glob (create-next-app ships one) would otherwise ignore it.
    if (!lines.some((line) => line.trim() === '!.env.example'))
    {
        rules.push('\n# spfn env reference (committed)\n!.env.example\n');
    }

    return rules;
}

/**
 * True when some ignore line already covers `target`. Matches an exact rule
 * (ignoring leading/trailing slashes) or a trailing-`*` glob like `.env*`, but
 * not a comment or a longer name such as `.spfnrc.ts` / `.env.server.example`.
 * An explicit `!target` negation forces "not covered" so we re-add the rule —
 * otherwise a negated secret file would be left git-tracked.
 */
function gitignoreCovers(lines: string[], target: string): boolean
{
    const normalized = stripSlashes(target);
    let covered = false;

    for (const raw of lines)
    {
        const line = raw.trim();

        if (line === '' || line.startsWith('#'))
        {
            continue;
        }

        if (line.startsWith('!'))
        {
            const negated = stripSlashes(line.slice(1));
            if (negated === normalized || (negated.endsWith('*') && normalized.startsWith(negated.slice(0, -1))))
            {
                return false;
            }
            continue;
        }

        const rule = stripSlashes(line);
        if (rule === normalized || (rule.endsWith('*') && normalized.startsWith(rule.slice(0, -1))))
        {
            covered = true;
        }
    }

    return covered;
}

function stripSlashes(value: string): string
{
    return value.replace(/^\//, '').replace(/\/$/, '');
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
    catch
    {
        logger.warn('Could not update tsconfig.json (you can add "src/server" to exclude manually)');
    }
}
