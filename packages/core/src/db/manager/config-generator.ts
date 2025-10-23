/**
 * Drizzle Kit configuration generator
 * Automatically generates drizzle.config.ts from environment variables
 */

import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

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
        catch (error)
        {
            // If we can't read project package.json, just scan @spfn packages
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

                // Convert to absolute paths from package root
                for (const schema of packageSchemas)
                {
                    const absolutePath = join(pkgPath, schema);
                    schemas.push(absolutePath);
                }
            }
        }
        catch (error)
        {
            // Skip packages with invalid package.json
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
        catch (error)
        {
            // Skip if can't read @spfn directory
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
    const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;

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
    const allSchemas = [...userSchemas, ...packageSchemas];
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

    // Format schema value (handle both string and array)
    const schemaValue = Array.isArray(config.schema)
        ? `[\n        ${config.schema.map(s => `'${s}'`).join(',\n        ')}\n    ]`
        : `'${config.schema}'`;

    return `import { defineConfig } from 'drizzle-kit';

export default defineConfig({
    schema: ${schemaValue},
    out: '${config.out}',
    dialect: '${config.dialect}',
    dbCredentials: ${JSON.stringify(config.dbCredentials, null, 4)},
});
`;
}