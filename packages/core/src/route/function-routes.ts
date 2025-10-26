/**
 * Function Route Discovery
 *
 * Automatically discovers and loads routes from SPFN functions
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { logger } from '../logger';

const routeLogger = logger.child('function-routes');

export type FunctionRouteInfo = {
    packageName: string;
    basePath: string;
    routesDir: string;
    packagePath: string;
};

/**
 * Discover SPFN functions with route declarations
 *
 * Scans node_modules for packages that declare routes in package.json
 */
export function discoverFunctionRoutes(cwd: string = process.cwd()): FunctionRouteInfo[]
{
    const functions: FunctionRouteInfo[] = [];
    const nodeModulesPath = join(cwd, 'node_modules');
    const basePathMap = new Map<string, string>(); // Track basePath → packageName for conflict detection

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

                if (pkg.spfn?.routes)
                {
                    const { basePath, dir } = pkg.spfn.routes;
                    const packagePath = dirname(pkgPath);
                    const routesDir = join(packagePath, dir);

                    // Check for basePath conflicts
                    const existingPackage = basePathMap.get(basePath);
                    if (existingPackage)
                    {
                        routeLogger.warn('Route basePath conflict detected', {
                            basePath,
                            existingPackage,
                            newPackage: packageName,
                            solution: 'Use different basePath values in package.json or use package-based prefix',
                        });
                    }
                    else
                    {
                        basePathMap.set(basePath, packageName);
                    }

                    functions.push({
                        packageName,
                        basePath,
                        routesDir,
                        packagePath,
                    });

                    routeLogger.debug('Discovered function routes', {
                        package: packageName,
                        basePath,
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