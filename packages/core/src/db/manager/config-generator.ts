/**
 * Drizzle Kit configuration generator
 * Automatically generates drizzle.config.ts from environment variables
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, dirname, basename } from 'path';
import { env } from '@spfn/core/config';

// ============================================================================
// Constants
// ============================================================================

/**
 * Index file patterns to exclude from schema discovery
 */
const INDEX_FILE_PATTERNS = [
    '/index',
    '/index.ts',
    '/index.js',
    '/index.mjs',
    '\\index',
    '\\index.ts',
    '\\index.js',
    '\\index.mjs',
];

/**
 * Supported file extensions for schema files
 * Only these extensions will be included in schema discovery
 */
const SUPPORTED_EXTENSIONS = ['.ts', '.js', '.mjs'];

// ============================================================================
// Helper Functions (Private)
// ============================================================================

/**
 * Check if a file path is an index file
 *
 * @param filePath - File path to check
 * @returns true if file is an index file
 * @internal
 */
function isIndexFile(filePath: string): boolean
{
    return INDEX_FILE_PATTERNS.some(pattern => filePath.endsWith(pattern));
}

/**
 * Check if a path is absolute
 *
 * @param path - Path to check
 * @returns true if path is absolute
 * @internal
 */
function isAbsolutePath(path: string): boolean
{
    // Unix absolute path (starts with /)
    if (path.startsWith('/')) return true;

    // Windows absolute path (C:\ or C:/)
    return !!path.match(/^[A-Za-z]:[\/\\]/);
}

/**
 * Check if a file has a supported extension
 *
 * @param filePath - File path to check
 * @returns true if file has supported extension
 * @internal
 */
function hasSupportedExtension(filePath: string): boolean
{
    // Exclude .d.ts files (TypeScript declaration files - not actual schemas)
    if (filePath.endsWith('.d.ts')) return false;

    return SUPPORTED_EXTENSIONS.some(ext => filePath.endsWith(ext));
}

/**
 * Filter out index files from file list
 *
 * @param files - Array of file paths
 * @returns Filtered array without index files
 * @internal
 */
function filterIndexFiles(files: string[]): string[]
{
    return files.filter(file => !isIndexFile(file));
}

/**
 * Scan directory recursively for files
 *
 * @param dir - Directory to scan
 * @param extension - Optional file extension filter
 * @returns Array of file paths
 * @internal
 */
function scanDirectoryRecursive(dir: string, extension?: string): string[]
{
    const files: string[] = [];

    if (!existsSync(dir)) return files;

    try
    {
        const entries = readdirSync(dir);

        for (const entry of entries)
        {
            const fullPath = join(dir, entry);

            try
            {
                const stat = statSync(fullPath);

                if (stat.isDirectory())
                {
                    files.push(...scanDirectoryRecursive(fullPath, extension));
                }
                else if (stat.isFile())
                {
                    // Check if file matches extension AND has supported extension
                    if ((!extension || fullPath.endsWith(extension)) && hasSupportedExtension(fullPath))
                    {
                        files.push(fullPath);
                    }
                }
            }
            catch (error: unknown)
            {
                // Skip files we can't stat (permission denied, etc.)
                // Silent skip is intentional - we don't want to fail on restricted files
            }
        }
    }
    catch (error: unknown)
    {
        // Skip directories we can't read (permission denied, etc.)
        // Silent skip is intentional - we don't want to fail on restricted directories
    }

    return files;
}

/**
 * Scan directory (single level) for files matching pattern
 *
 * @param dir - Directory to scan
 * @param filePattern - File pattern to match (e.g., "*.js")
 * @returns Array of file paths
 * @internal
 */
function scanDirectorySingleLevel(dir: string, filePattern: string): string[]
{
    const files: string[] = [];

    if (!existsSync(dir)) return files;

    try
    {
        const entries = readdirSync(dir);

        for (const entry of entries)
        {
            const fullPath = join(dir, entry);

            try
            {
                const stat = statSync(fullPath);

                if (stat.isFile())
                {
                    // Simple pattern matching (*.js matches foo.js) AND check supported extensions
                    if ((filePattern === '*' ||
                        (filePattern.startsWith('*.') && entry.endsWith(filePattern.slice(1)))) &&
                        hasSupportedExtension(fullPath))
                    {
                        files.push(fullPath);
                    }
                }
            }
            catch (error: unknown)
            {
                // Skip files we can't stat
            }
        }
    }
    catch (error: unknown)
    {
        // Skip directories we can't read
    }

    return files;
}

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface DrizzleConfigOptions
{
    /** Database connection URL (defaults to process.env.DATABASE_URL) */
    databaseUrl?: string;

    /** Schema files glob pattern or array of patterns (defaults to './src/server/entities/\*\*\/*.ts') */
    schema?: string | string[];

    /** Migration output directory (defaults to './src/server/drizzle') */
    out?: string;

    /** Database dialect (auto-detected from URL if not provided) */
    dialect?: 'postgresql' | 'mysql' | 'sqlite';

    /** Current working directory for discovering package schemas */
    cwd?: string;

    /** Disable automatic package schema discovery */
    disablePackageDiscovery?: boolean;

    /** Only include schemas from specific package (e.g., '@spfn/cms') */
    packageFilter?: string;

    /** Expand glob patterns to actual file paths (useful for Drizzle Studio) */
    expandGlobs?: boolean;
}

/**
 * Expand glob patterns to actual file paths
 * Handles patterns like:
 * - ./dist/entities/*.js → [./dist/entities/foo.js, ./dist/entities/bar.js]
 * - ./dist/entities/**\/*.js → recursively finds all .js files
 *
 * @param pattern - Glob pattern or file path
 * @returns Array of expanded file paths
 */
function expandGlobPattern(pattern: string): string[]
{
    // If pattern doesn't contain wildcards, return as-is
    if (!pattern.includes('*'))
    {
        return existsSync(pattern) ? [pattern] : [];
    }

    // Handle /**/* pattern (recursive)
    if (pattern.includes('**'))
    {
        const [baseDir, ...rest] = pattern.split('**');
        const extension = rest.join('').replace(/[\/\\]\*\./g, '').trim();
        const dir = baseDir.trim() || '.';

        return scanDirectoryRecursive(dir, extension || undefined);
    }

    // Handle /* pattern (single level)
    const dir = dirname(pattern);
    const filePattern = basename(pattern);

    return scanDirectorySingleLevel(dir, filePattern);
}

/**
 * Discover schema paths from installed packages
 * Only scans packages that:
 * 1. Are in @spfn scope
 * 2. Are direct dependencies with "spfn" keyword or "spfn" field in package.json
 */
function discoverPackageSchemas(cwd: string): string[]
{
    const schemas: string[] = [];
    const nodeModulesPath = join(cwd, 'node_modules');

    if (!existsSync(nodeModulesPath))
    {
        return schemas;
    }

    // Get direct dependencies from project's package.json
    const projectPkgPath = join(cwd, 'package.json');
    let directDeps: Set<string> = new Set();

    if (existsSync(projectPkgPath))
    {
        try
        {
            const projectPkg = JSON.parse(readFileSync(projectPkgPath, 'utf-8'));
            directDeps = new Set([
                ...Object.keys(projectPkg.dependencies || {}),
                ...Object.keys(projectPkg.devDependencies || {})
            ]);
        }
        catch (error: unknown)
        {
            // If we can't read project package.json, just scan @spfn packages
            // Silent skip is intentional - we continue with @spfn package discovery
        }
    }

    const checkPackage = (_pkgName: string, pkgPath: string) =>
    {
        const pkgJsonPath = join(pkgPath, 'package.json');

        if (!existsSync(pkgJsonPath)) return;

        try
        {
            const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));

            // Check if package has schema declarations
            if (pkgJson.spfn?.schemas)
            {
                const packageSchemas = Array.isArray(pkgJson.spfn.schemas)
                    ? pkgJson.spfn.schemas
                    : [pkgJson.spfn.schemas];

                // Convert to absolute paths from package root and expand globs
                for (const schema of packageSchemas)
                {
                    const absolutePath = join(pkgPath, schema);

                    // Expand glob patterns to actual file lists
                    // This prevents drizzle-kit from hanging on glob patterns
                    const expandedFiles = expandGlobPattern(absolutePath);

                    // Filter out index files (they are re-exports, not schema definitions)
                    const schemaFiles = filterIndexFiles(expandedFiles);

                    schemas.push(...schemaFiles);
                }
            }
        }
        catch (error: unknown)
        {
            // Skip packages with invalid package.json
            // Silent skip is intentional - we continue checking other packages
        }
    };

    // 1. Always scan @spfn/* packages
    const spfnDir = join(nodeModulesPath, '@spfn');
    if (existsSync(spfnDir))
    {
        try
        {
            const spfnPackages = readdirSync(spfnDir);
            for (const pkg of spfnPackages)
            {
                checkPackage(`@spfn/${pkg}`, join(spfnDir, pkg));
            }
        }
        catch (error: unknown)
        {
            // Skip if can't read @spfn directory
            // Silent skip is intentional - we continue with direct dependencies
        }
    }

    // 2. Check direct dependencies for SPFN integration
    for (const depName of directDeps)
    {
        // Skip if already checked (@spfn/* packages)
        if (depName.startsWith('@spfn/')) continue;

        // Resolve package path (handle scoped packages)
        const pkgPath = depName.startsWith('@')
            ? join(nodeModulesPath, ...depName.split('/'))
            : join(nodeModulesPath, depName);

        checkPackage(depName, pkgPath);
    }

    return schemas;
}

/**
 * Detect database dialect from connection URL
 */
export function detectDialect(url: string): 'postgresql' | 'mysql' | 'sqlite'
{
    if (url.startsWith('postgres://') || url.startsWith('postgresql://'))
    {
        return 'postgresql';
    }

    if (url.startsWith('mysql://'))
    {
        return 'mysql';
    }

    if (url.startsWith('sqlite://') || url.includes('.db') || url.includes('.sqlite'))
    {
        return 'sqlite';
    }

    throw new Error(
        `Unsupported database URL format: ${url}. Supported: postgresql://, mysql://, sqlite://`
    );
}

/**
 * Generate Drizzle Kit configuration
 *
 * @param options - Configuration options
 * @returns Drizzle Kit configuration object
 *
 * @example
 * ```ts
 * // Zero-config (reads from process.env.DATABASE_URL)
 * const config = getDrizzleConfig();
 *
 * // Custom config
 * const config = getDrizzleConfig({
 *   databaseUrl: 'postgresql://localhost/mydb',
 *   schema: './src/db/schema/*.ts',
 *   out: './migrations',
 * });
 * ```
 */
export function getDrizzleConfig(options: DrizzleConfigOptions = {})
{
    const databaseUrl = options.databaseUrl ?? env.DATABASE_URL;

    if (!databaseUrl)
    {
        throw new Error(
            'DATABASE_URL is required. Set it in .env or pass it to getDrizzleConfig()'
        );
    }

    const dialect = options.dialect ?? detectDialect(databaseUrl);
    const out = options.out ?? './src/server/drizzle';

    // If packageFilter is specified, only include that package's schemas
    if (options.packageFilter)
    {
        const packageSchemas = options.disablePackageDiscovery
            ? []
            : discoverPackageSchemas(options.cwd ?? process.cwd());

        // Filter to only the specified package
        const filteredSchemas = packageSchemas.filter(schemaPath =>
            schemaPath.includes(`node_modules/${options.packageFilter}/`)
        );

        if (filteredSchemas.length === 0)
        {
            throw new Error(
                `No schemas found for package ${options.packageFilter}. ` +
                `Make sure the package is installed and has "spfn.schemas" in package.json.`
            );
        }

        const schema = filteredSchemas.length === 1 ? filteredSchemas[0] : filteredSchemas;

        return {
            schema,
            out,
            dialect,
            dbCredentials: getDbCredentials(dialect, databaseUrl),
        };
    }

    // Default: merge user schemas and all package schemas
    const userSchema = options.schema ?? './src/server/entities/**/*.ts';  // Support nested folders
    const userSchemas = Array.isArray(userSchema) ? userSchema : [userSchema];

    // Discover package schemas unless disabled
    const packageSchemas = options.disablePackageDiscovery
        ? []
        : discoverPackageSchemas(options.cwd ?? process.cwd());

    // Merge user schemas and package schemas
    let allSchemas = [...userSchemas, ...packageSchemas];

    // Expand glob patterns if requested (useful for Drizzle Studio)
    if (options.expandGlobs)
    {
        const expandedSchemas: string[] = [];
        for (const schema of allSchemas)
        {
            const expanded = expandGlobPattern(schema);

            // Filter out index files (they are re-exports, not schema definitions)
            const filtered = filterIndexFiles(expanded);

            expandedSchemas.push(...filtered);
        }
        allSchemas = expandedSchemas;
    }

    const schema = allSchemas.length === 1 ? allSchemas[0] : allSchemas;

    return {
        schema,
        out,
        dialect,
        dbCredentials: getDbCredentials(dialect, databaseUrl),
    };
}

/**
 * Get database credentials based on dialect
 */
function getDbCredentials(dialect: string, url: string)
{
    switch (dialect)
    {
        case 'postgresql':
        case 'mysql':
            return { url };

        case 'sqlite':
            // Extract file path from sqlite:// URL
            const dbPath = url.replace('sqlite://', '').replace('sqlite:', '');
            return { url: dbPath };

        default:
            throw new Error(`Unsupported dialect: ${dialect}`);
    }
}

/**
 * Generate drizzle.config.ts file content
 *
 * @param options - Configuration options
 * @returns File content as string
 */
export function generateDrizzleConfigFile(options: DrizzleConfigOptions = {}): string
{
    const config = getDrizzleConfig(options);
    const cwd = options.cwd ?? process.cwd();

    // Convert schema paths to absolute paths for Drizzle Studio compatibility
    const normalizeSchemaPath = (schemaPath: string): string =>
    {
        // If already absolute, return as-is
        if (isAbsolutePath(schemaPath))
        {
            return schemaPath;
        }
        // Convert relative to absolute
        return join(cwd, schemaPath);
    };

    // Format schema value (handle both string and array)
    const schemaValue = Array.isArray(config.schema)
        ? `[\n        ${config.schema.map(s => `'${normalizeSchemaPath(s)}'`).join(',\n        ')}\n    ]`
        : `'${normalizeSchemaPath(config.schema as string)}'`;

    return `import { defineConfig } from 'drizzle-kit';

export default defineConfig({
    schema: ${schemaValue},
    out: '${config.out}',
    dialect: '${config.dialect}',
    dbCredentials: ${JSON.stringify(config.dbCredentials, null, 4)},
});
`;
}