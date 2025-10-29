/**
 * Function Route Discovery
 *
 * Automatically discovers and loads routes from SPFN functions
 *
 * NOTE: Contract-based routing - routes use absolute paths defined in contracts
 * No basePath needed - each contract defines its own absolute path (e.g., '/cms/labels')
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { logger } from '../logger';

const routeLogger = logger.child('function-routes');

export type FunctionRouteInfo = {
    packageName: string;
    routesDir: string;
    packagePath: string;
};

/**
 * Discover SPFN functions with route declarations
 *
 * Scans node_modules for packages that declare routes in package.json
 *
 * Example package.json:
 * ```json
 * {
 *   "name": "@spfn/cms",
 *   "spfn": {
 *     "routes": {
 *       "dir": "./dist/routes"
 *     }
 *   }
 * }
 * ```
 */
export function discoverFunctionRoutes(cwd: string = process.cwd()): FunctionRouteInfo[]
{
    const functions: FunctionRouteInfo[] = [];
    const nodeModulesPath = join(cwd, 'node_modules');

    try
    {
        // Read package.json to get dependencies
        const projectPkgPath = join(cwd, 'package.json');
        const projectPkg = JSON.parse(readFileSync(projectPkgPath, 'utf-8'));

        const dependencies = {
            ...projectPkg.dependencies,
            ...projectPkg.devDependencies,
        };

        // Scan each dependency for spfn.routes
        for (const [packageName] of Object.entries(dependencies))
        {
            // Only scan @spfn/* and packages starting with spfn-
            if (!packageName.startsWith('@spfn/') && !packageName.startsWith('spfn-'))
            {
                continue;
            }

            try
            {
                const pkgPath = join(nodeModulesPath, ...packageName.split('/'), 'package.json');
                const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

                if (pkg.spfn?.routes?.dir)
                {
                    const { dir } = pkg.spfn.routes;
                    const packagePath = dirname(pkgPath);
                    const routesDir = join(packagePath, dir);

                    functions.push({
                        packageName,
                        routesDir,
                        packagePath,
                    });

                    routeLogger.debug('Discovered function routes', {
                        package: packageName,
                        dir,
                    });
                }
            }
            catch (error)
            {
                // Silently skip packages that don't exist or can't be read
                // This is normal for optional dependencies or workspace links
            }
        }
    }
    catch (error)
    {
        routeLogger.warn('Failed to discover function routes', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }

    return functions;
}