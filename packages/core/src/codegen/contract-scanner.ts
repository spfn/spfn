/**
 * Contract Scanner
 *
 * Scans server/contracts directory and extracts exported contracts
 */

import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import * as ts from 'typescript';
import { readFileSync } from 'fs';
import type { RouteContractMapping, HttpMethod } from './types.js';

/**
 * Scan routes directory for contract.ts files and extract contract exports
 *
 * @param routesDir - Path to server/routes directory
 * @returns Array of contract-to-route mappings
 */
export async function scanContracts(routesDir: string): Promise<RouteContractMapping[]>
{
    const contractFiles = await scanContractFiles(routesDir);
    const mappings: RouteContractMapping[] = [];

    for (let i = 0; i < contractFiles.length; i++)
    {
        const filePath = contractFiles[i];
        const exports = extractContractExports(filePath);

        // Calculate base path from file location: routes/posts/contract.ts → /posts
        const basePath = getBasePathFromFile(filePath, routesDir);

        for (let j = 0; j < exports.length; j++)
        {
            const contractExport = exports[j];

            // Combine base path with contract path: /posts + / → /posts
            const fullPath = combinePaths(basePath, contractExport.path);

            mappings.push({
                method: contractExport.method,
                path: fullPath,
                contractName: contractExport.name,
                contractImportPath: getImportPathFromRoutes(filePath, routesDir),
                routeFile: '', // Not needed anymore
                contractFile: filePath
            });
        }
    }

    return mappings;
}

/**
 * Recursively scan for contract.ts files in routes directory
 */
async function scanContractFiles(dir: string, files: string[] = []): Promise<string[]>
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
                await scanContractFiles(fullPath, files);
            }
            else if (entry === 'contract.ts')
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
 * Contract export information
 */
interface ContractExport
{
    name: string;
    method: HttpMethod;
    path: string;
}

/**
 * Extract contract exports from a TypeScript file
 *
 * Looks for exports with structure:
 * export const xxxContract = {
 *     method: 'GET',
 *     path: '/users',
 *     ...
 * }
 */
function extractContractExports(filePath: string): ContractExport[]
{
    const sourceCode = readFileSync(filePath, 'utf-8');
    const sourceFile = ts.createSourceFile(
        filePath,
        sourceCode,
        ts.ScriptTarget.Latest,
        true
    );

    const exports: ContractExport[] = [];

    function visit(node: ts.Node): void
    {
        // Look for: export const xxxContract = { ... }
        if (ts.isVariableStatement(node))
        {
            // Check if it has export modifier
            const hasExport = node.modifiers?.some(
                m => m.kind === ts.SyntaxKind.ExportKeyword
            );

            if (hasExport && node.declarationList.declarations.length > 0)
            {
                const declaration = node.declarationList.declarations[0];

                if (
                    ts.isVariableDeclaration(declaration) &&
                    ts.isIdentifier(declaration.name) &&
                    declaration.initializer &&
                    ts.isObjectLiteralExpression(declaration.initializer)
                )
                {
                    const name = declaration.name.text;

                    // Check if name looks like a contract
                    if (isContractName(name))
                    {
                        const contractData = extractContractData(declaration.initializer);

                        if (contractData.method && contractData.path)
                        {
                            exports.push({
                                name,
                                method: contractData.method,
                                path: contractData.path
                            });
                        }
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
 * Extract method and path from contract object literal
 */
function extractContractData(objectLiteral: ts.ObjectLiteralExpression): {
    method?: HttpMethod;
    path?: string;
}
{
    const result: { method?: HttpMethod; path?: string } = {};

    for (let i = 0; i < objectLiteral.properties.length; i++)
    {
        const prop = objectLiteral.properties[i];

        if (
            ts.isPropertyAssignment(prop) &&
            ts.isIdentifier(prop.name)
        )
        {
            const propName = prop.name.text;

            if (propName === 'method')
            {
                // Handle both 'GET' and 'GET' as const
                let value: string | undefined;
                if (ts.isStringLiteral(prop.initializer))
                {
                    value = prop.initializer.text;
                }
                else if (ts.isAsExpression(prop.initializer) && ts.isStringLiteral(prop.initializer.expression))
                {
                    value = prop.initializer.expression.text;
                }
                if (value) result.method = value as HttpMethod;
            }
            else if (propName === 'path')
            {
                // Handle both '/path' and '/path' as const
                let value: string | undefined;
                if (ts.isStringLiteral(prop.initializer))
                {
                    value = prop.initializer.text;
                }
                else if (ts.isAsExpression(prop.initializer) && ts.isStringLiteral(prop.initializer.expression))
                {
                    value = prop.initializer.expression.text;
                }
                if (value) result.path = value;
            }
        }
    }

    return result;
}

/**
 * Check if a name looks like a contract
 */
function isContractName(name: string): boolean
{
    return (
        name.indexOf('Contract') !== -1 ||
        name.indexOf('contract') !== -1 ||
        name.endsWith('Schema') ||
        name.endsWith('schema')
    );
}

/**
 * Get base URL path from contract file location
 *
 * @example
 * routes/posts/contract.ts → /posts
 * routes/users/[id]/contract.ts → /users/:id
 * routes/index/contract.ts → /
 */
function getBasePathFromFile(filePath: string, routesDir: string): string
{
    // Get relative path from routes dir
    let relativePath = filePath.replace(routesDir, '');

    // Remove leading slash
    if (relativePath.startsWith('/'))
    {
        relativePath = relativePath.slice(1);
    }

    // Remove /contract.ts
    relativePath = relativePath.replace('/contract.ts', '');

    // Handle index → /
    if (relativePath === 'index' || relativePath === '')
    {
        return '/';
    }

    // Split into segments
    const segments = relativePath.split('/');
    const transformed: string[] = [];

    for (let i = 0; i < segments.length; i++)
    {
        const seg = segments[i];

        // Skip 'index' segments (routes/index/contract.ts → /, routes/posts/index/contract.ts → /posts)
        if (seg === 'index')
        {
            continue;
        }

        // Dynamic parameter: [id] → :id
        if (seg.startsWith('[') && seg.endsWith(']'))
        {
            transformed.push(':' + seg.slice(1, -1));
        }
        // Static segment
        else
        {
            transformed.push(seg);
        }
    }

    // If no segments remain, return root
    if (transformed.length === 0)
    {
        return '/';
    }

    return '/' + transformed.join('/');
}

/**
 * Combine base path with contract path
 *
 * @example
 * combinePaths('/posts', '/') → /posts
 * combinePaths('/posts', '/:id') → /posts/:id
 * combinePaths('/', '/health') → /health
 */
function combinePaths(basePath: string, contractPath: string): string
{
    // Normalize paths
    basePath = basePath || '/';
    contractPath = contractPath || '/';

    // Remove trailing slash from base
    if (basePath.endsWith('/') && basePath !== '/')
    {
        basePath = basePath.slice(0, -1);
    }

    // If contract path is absolute, use it as is
    if (contractPath.startsWith('/') && contractPath !== '/')
    {
        // If base is /, just use contract path
        if (basePath === '/')
        {
            return contractPath;
        }
        // Otherwise combine: /posts + /sub → /posts/sub
        return basePath + contractPath;
    }

    // Contract path is / or relative
    if (contractPath === '/')
    {
        return basePath;
    }

    // Combine: /posts + id → /posts/id
    return basePath + '/' + contractPath;
}

/**
 * Get import path for contract file
 *
 * @example
 * routes/posts/contract.ts → @/server/routes/posts/contract
 * routes/users/[id]/contract.ts → @/server/routes/users/[id]/contract
 */
function getImportPathFromRoutes(filePath: string, routesDir: string): string
{
    // Get relative path from routes dir
    let relativePath = filePath.replace(routesDir, '');

    // Remove leading slash
    if (relativePath.startsWith('/'))
    {
        relativePath = relativePath.slice(1);
    }

    // Remove .ts extension
    if (relativePath.endsWith('.ts'))
    {
        relativePath = relativePath.slice(0, -3);
    }

    // Return as module path
    return '@/server/routes/' + relativePath;
}