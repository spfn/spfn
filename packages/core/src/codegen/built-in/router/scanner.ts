/**
 * Router Scanner (AST-based)
 *
 * Scans route files using static analysis (no code execution)
 * Similar to contract scanner but for define-route system
 */

import { readFileSync } from 'fs';
import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import * as ts from 'typescript';
import { logger } from '@spfn/core/logger';

const scannerLogger = logger.child('@spfn/core:router-scanner');

export interface RouteMetadata
{
    method: string;
    path: string;
}

export interface RouterMetadata
{
    routes: Record<string, RouteMetadata>;
    routerTypeName: string;
}

/**
 * Scan routes directory and extract metadata using AST parsing
 *
 * This scans route files directly, similar to how contract scanner works.
 * Safer than executing router code at build time.
 */
export async function scanRouter(
    cwd: string,
    debug?: boolean
): Promise<RouterMetadata | null>
{
    try
    {
        // Assume routes are in src/server/routes
        const routesDir = join(cwd, 'src', 'server', 'routes');
        const routeFiles = await scanRouteFiles(routesDir);

        if (debug)
        {
            scannerLogger.debug('Found route files', { count: routeFiles.length });
        }

        const routes: Record<string, RouteMetadata> = {};

        // Scan each route file for exported routes
        for (const filePath of routeFiles)
        {
            const fileRoutes = extractRouteExports(filePath);

            for (const route of fileRoutes)
            {
                routes[route.name] = {
                    method: route.method,
                    path: route.path,
                };

                if (debug)
                {
                    scannerLogger.debug('Route found', {
                        name: route.name,
                        method: route.method,
                        path: route.path,
                    });
                }
            }
        }

        if (Object.keys(routes).length === 0)
        {
            if (debug)
            {
                scannerLogger.warn('No routes found');
            }

            return null;
        }

        return {
            routes,
            routerTypeName: 'AppRouter',  // Infer from common pattern
        };
    }
    catch (error)
    {
        const err = error instanceof Error ? error : new Error(String(error));
        scannerLogger.error('Failed to scan routes', err);
        return null;
    }
}

/**
 * Recursively scan for route files
 */
async function scanRouteFiles(dir: string, files: string[] = []): Promise<string[]>
{
    try
    {
        const entries = await readdir(dir);

        for (const entry of entries)
        {
            const fullPath = join(dir, entry);
            const fileStat = await stat(fullPath);

            if (fileStat.isDirectory())
            {
                await scanRouteFiles(fullPath, files);
            }
            else if (
                (entry.endsWith('.ts') || entry.endsWith('.js')) &&
                !entry.endsWith('.d.ts') &&
                !entry.endsWith('.test.ts')
            )
            {
                files.push(fullPath);
            }
        }
    }
    catch (error)
    {
        // Directory doesn't exist or not readable
    }

    return files;
}

/**
 * Route export information
 */
interface RouteExport
{
    name: string;
    method: string;
    path: string;
}

/**
 * Extract route exports from a TypeScript file using AST
 *
 * Looks for: export const myRoute = route.get('/path').handler(...)
 */
function extractRouteExports(filePath: string): RouteExport[]
{
    const sourceCode = readFileSync(filePath, 'utf-8');
    const sourceFile = ts.createSourceFile(
        filePath,
        sourceCode,
        ts.ScriptTarget.Latest,
        true
    );

    const exports: RouteExport[] = [];

    function visit(node: ts.Node): void
    {
        // Look for: export const xxxRoute = route.get('/path')...
        if (ts.isVariableStatement(node))
        {
            const hasExport = node.modifiers?.some(
                m => m.kind === ts.SyntaxKind.ExportKeyword
            );

            if (hasExport && node.declarationList.declarations.length > 0)
            {
                const declaration = node.declarationList.declarations[0];

                if (
                    ts.isVariableDeclaration(declaration) &&
                    ts.isIdentifier(declaration.name) &&
                    declaration.initializer
                )
                {
                    const name = declaration.name.text;

                    // Extract route.METHOD('/path') pattern
                    const routeData = extractRouteChain(declaration.initializer);

                    if (routeData)
                    {
                        exports.push({
                            name,
                            method: routeData.method,
                            path: routeData.path,
                        });
                    }
                }
            }
        }

        ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return exports;
}

/**
 * Extract method and path from route chain
 *
 * Pattern: route.get('/path').input(...).handler(...)
 */
function extractRouteChain(initializer: ts.Expression): { method: string; path: string } | null
{
    // Find the first .get() .post() etc call in the chain
    let current: ts.Expression | undefined = initializer;

    while (current)
    {
        if (ts.isCallExpression(current) && ts.isPropertyAccessExpression(current.expression))
        {
            const methodName = current.expression.name.text;
            const isRouteMethod = ['get', 'post', 'put', 'patch', 'delete'].includes(methodName);

            if (isRouteMethod && current.arguments.length > 0)
            {
                const pathArg = current.arguments[0];

                if (ts.isStringLiteral(pathArg))
                {
                    return {
                        method: methodName.toUpperCase(),
                        path: pathArg.text,
                    };
                }
            }

            // Move to the object being accessed (route.get -> route)
            current = current.expression.expression;
        }
        else
        {
            break;
        }
    }

    return null;
}