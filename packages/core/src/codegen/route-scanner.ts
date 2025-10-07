/**
 * Route-Contract Scanner
 *
 * Scans route files and maps them to their contracts
 */

import { readdir, stat } from 'fs/promises';
import { join, relative } from 'path';
import {
    extractContractImports,
    extractBindCalls,
    filterContractImports,
    resolveImportPath
} from './ast-parser.js';
import type { RouteContractMapping } from './types.js';

/**
 * Scan routes directory and extract route-contract mappings
 */
export async function scanRouteContracts(routesDir: string): Promise<RouteContractMapping[]>
{
    const mappings: RouteContractMapping[] = [];
    const routeFiles = await scanRouteFiles(routesDir);

    for (let i = 0; i < routeFiles.length; i++)
    {
        const file = routeFiles[i];
        const fileMappings = await extractRouteContractsFromFile(file, routesDir);

        for (let j = 0; j < fileMappings.length; j++)
        {
            mappings.push(fileMappings[j]);
        }
    }

    return mappings;
}

/**
 * Extract route-contract mappings from a single route file
 */
async function extractRouteContractsFromFile(
    filePath: string,
    routesDir: string
): Promise<RouteContractMapping[]>
{
    const mappings: RouteContractMapping[] = [];

    try
    {
        // 1. Extract all imports
        const allImports = extractContractImports(filePath);

        // 2. Filter only contract-like imports
        const contractImports = filterContractImports(allImports);

        // 3. Extract bind() calls
        const bindCalls = extractBindCalls(filePath);

        // 4. Build contract name -> import path map
        const contractMap: Record<string, string> = {};
        for (let i = 0; i < contractImports.length; i++)
        {
            const imp = contractImports[i];
            contractMap[imp.name] = imp.importPath;
        }

        // 5. Map bind calls to contracts
        for (let i = 0; i < bindCalls.length; i++)
        {
            const bindCall = bindCalls[i];
            const importPath = contractMap[bindCall.contractName];

            if (importPath)
            {
                // Convert file path to URL path
                const urlPath = fileToUrlPath(filePath, routesDir, bindCall.path);

                mappings.push({
                    method: bindCall.method,
                    path: urlPath,
                    contractName: bindCall.contractName,
                    contractImportPath: importPath,
                    routeFile: filePath,
                    contractFile: resolveImportPath(importPath, filePath) || undefined
                });
            }
        }
    }
    catch (error)
    {
        console.warn(`Failed to parse route file: ${filePath}`, error);
    }

    return mappings;
}

/**
 * Recursively scan route files
 */
async function scanRouteFiles(dir: string, files: string[] = []): Promise<string[]>
{
    try
    {
        const entries = await readdir(dir);

        for (let i = 0; i < entries.length; i++)
        {
            const entry = entries[i];
            const fullPath = join(dir, entry);
            const fileStat = await stat(fullPath);

            if (fileStat.isDirectory())
            {
                await scanRouteFiles(fullPath, files);
            }
            else if (isValidRouteFile(entry))
            {
                files.push(fullPath);
            }
        }
    }
    catch (error)
    {
        // Directory doesn't exist or not readable
        // Return empty array
    }

    return files;
}

/**
 * Check if file is a valid route file
 */
function isValidRouteFile(fileName: string): boolean
{
    return (
        fileName.endsWith('.ts') &&
        !fileName.endsWith('.test.ts') &&
        !fileName.endsWith('.spec.ts') &&
        !fileName.endsWith('.d.ts')
    );
}

/**
 * Convert file path to URL path
 *
 * Examples:
 * - users/index.ts → /users
 * - users/[id].ts → /users/:id
 * - posts/[...slug].ts → /posts/*
 */
function fileToUrlPath(filePath: string, routesDir: string, explicitPath?: string): string
{
    // If explicit path is provided in bind call, use it
    if (explicitPath)
    {
        return explicitPath;
    }

    // Get relative path from routes directory
    const relativePath = relative(routesDir, filePath);

    // Remove .ts extension
    let path = relativePath.replace(/\.ts$/, '');

    // Split into segments
    const segments = path.split('/');

    // Remove 'index' if it's the last segment
    if (segments[segments.length - 1] === 'index')
    {
        segments.pop();
    }

    // Transform segments: [id] → :id, [...slug] → *
    const transformed: string[] = [];
    for (let i = 0; i < segments.length; i++)
    {
        const seg = segments[i];

        // Catch-all: [...slug] → *
        if (/^\[\.\.\.[\w-]+]$/.test(seg))
        {
            transformed.push('*');
        }
        // Dynamic: [id] → :id
        else if (/^\[[\w-]+]$/.test(seg))
        {
            transformed.push(':' + seg.slice(1, -1));
        }
        // Static: users → users
        else
        {
            transformed.push(seg);
        }
    }

    // Join and ensure leading slash
    const result = '/' + transformed.join('/');
    return result.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
}

/**
 * Group mappings by resource
 */
export function groupByResource(mappings: RouteContractMapping[]): Record<string, RouteContractMapping[]>
{
    const grouped: Record<string, RouteContractMapping[]> = {};

    for (let i = 0; i < mappings.length; i++)
    {
        const mapping = mappings[i];
        const resource = extractResourceName(mapping.path);

        if (!grouped[resource])
        {
            grouped[resource] = [];
        }

        grouped[resource].push(mapping);
    }

    return grouped;
}

/**
 * Extract resource name from path
 *
 * Examples:
 * - /users → users
 * - /users/:id → users
 * - /users/:id/posts → usersPosts
 */
function extractResourceName(path: string): string
{
    // Remove leading slash
    const segments = path.slice(1).split('/').filter(s => s && s !== '*');

    // Remove dynamic segments
    const staticSegments: string[] = [];
    for (let i = 0; i < segments.length; i++)
    {
        const seg = segments[i];
        if (!seg.startsWith(':'))
        {
            staticSegments.push(seg);
        }
    }

    // Join with camelCase
    if (staticSegments.length === 0)
    {
        return 'root';
    }
    if (staticSegments.length === 1)
    {
        return staticSegments[0];
    }

    // Convert to camelCase: users/posts → usersPosts
    const result: string[] = [staticSegments[0]];
    for (let i = 1; i < staticSegments.length; i++)
    {
        const seg = staticSegments[i];
        result.push(seg.charAt(0).toUpperCase() + seg.slice(1));
    }

    return result.join('');
}