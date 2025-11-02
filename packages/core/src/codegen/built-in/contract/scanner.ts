/**
 * Contract Scanner
 *
 * Scans server/contracts directory and extracts exported contracts
 */

import { readFileSync } from 'fs';
import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import * as ts from 'typescript';
import type { HttpMethod, RouteContractMapping } from '../../core/types';

/**
 * Scan for contract files and extract contract exports
 *
 * All contracts must use absolute paths (e.g., path: '/teams/:id')
 *
 * @param contractsDir - Path to lib/contracts/ directory
 * @param packagePrefix - Optional package prefix to apply to all contract paths
 * @returns Array of contract-to-route mappings
 */
export async function scanContracts(contractsDir: string, packagePrefix?: string): Promise<RouteContractMapping[]>
{
    const contractFiles = await scanContractFiles(contractsDir);
    const mappings: RouteContractMapping[] = [];

    for (let i = 0; i < contractFiles.length; i++)
    {
        const filePath = contractFiles[i];
        const exports = extractContractExports(filePath);

        for (let j = 0; j < exports.length; j++)
        {
            const contractExport = exports[j];

            // All contracts must use absolute paths
            if (!contractExport.path.startsWith('/'))
            {
                throw new Error(
                    `Contract '${contractExport.name}' in ${filePath} must use absolute path. ` +
                    `Found: '${contractExport.path}'. Use '/your-path' instead.`
                );
            }

            if(packagePrefix && !contractExport.path.startsWith(packagePrefix))
            {
                throw new Error(
                    `Contract '${contractExport.name}' in ${filePath} must include package prefix. ` +
                    `Expected path to start with '${packagePrefix}', but found: '${contractExport.path}'. ` +
                    `Example: path: '${packagePrefix}/${contractExport.path}'`
                );
            }

            // Apply package prefix if exists
            mappings.push({
                method: contractExport.method,
                path: contractExport.path,
                contractName: contractExport.name,
                contractImportPath: getImportPath(filePath),
                routeFile: '',
                contractFile: filePath,
                hasQuery: contractExport.hasQuery,
                hasBody: contractExport.hasBody,
                hasParams: contractExport.hasParams
            });
        }
    }

    return mappings;
}

/**
 * Recursively scan for contract files in lib/contracts/
 *
 * Scans for all .ts, .js, .mjs files (excluding test and declaration files)
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
            else
            {
                // Scan all .ts, .js, .mjs files (excluding test and declaration files)
                if (
                    (entry.endsWith('.ts') || entry.endsWith('.js') || entry.endsWith('.mjs')) &&
                    !entry.endsWith('.d.ts') &&
                    !entry.endsWith('.test.ts') &&
                    !entry.endsWith('.test.js') &&
                    !entry.endsWith('.test.mjs')
                )
                {
                    files.push(fullPath);
                }
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
    hasQuery?: boolean;
    hasBody?: boolean;
    hasParams?: boolean;
}

/**
 * Extract contract exports from a TypeScript file
 *
 * Multi-layer detection:
 * 1. satisfies RouteContract (most explicit)
 * 2. Contract name pattern + method/path properties (fallback)
 *
 * @example
 * // Layer 1: satisfies RouteContract
 * export const myContract = { ... } satisfies RouteContract;
 *
 * // Layer 2: Name pattern + validation
 * export const myContract = { method: 'GET', path: '/api' };
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
                    declaration.initializer
                )
                {
                    const name = declaration.name.text;

                    // Layer 1: Check for satisfies RouteContract
                    const hasSatisfiesRouteContract = checkSatisfiesRouteContract(declaration.initializer);

                    if (hasSatisfiesRouteContract)
                    {
                        const objectLiteral = extractObjectLiteral(declaration.initializer);

                        if (objectLiteral)
                        {
                            const contractData = extractContractData(objectLiteral);

                            if (contractData.method && contractData.path)
                            {
                                exports.push({
                                    name,
                                    method: contractData.method,
                                    path: contractData.path,
                                    hasQuery: contractData.hasQuery,
                                    hasBody: contractData.hasBody,
                                    hasParams: contractData.hasParams
                                });
                            }
                        }
                        return; // Found via satisfies, skip fallback
                    }

                    // Layer 2: Fallback to name pattern check
                    if (isContractName(name))
                    {
                        const objectLiteral = extractObjectLiteral(declaration.initializer);

                        if (objectLiteral)
                        {
                            const contractData = extractContractData(objectLiteral);

                            // Require both method and path for fallback detection
                            if (contractData.method && contractData.path)
                            {
                                exports.push({
                                    name,
                                    method: contractData.method,
                                    path: contractData.path,
                                    hasQuery: contractData.hasQuery,
                                    hasBody: contractData.hasBody,
                                    hasParams: contractData.hasParams
                                });
                            }
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
 * Check if declaration uses 'satisfies RouteContract'
 */
function checkSatisfiesRouteContract(initializer: ts.Expression): boolean
{
    if (!ts.isSatisfiesExpression(initializer))
    {
        return false;
    }

    const typeNode = initializer.type;

    // Check for RouteContract type reference
    if (ts.isTypeReferenceNode(typeNode) &&
        ts.isIdentifier(typeNode.typeName))
    {
        return typeNode.typeName.text === 'RouteContract';
    }

    return false;
}

/**
 * Extract object literal from various expression forms
 */
function extractObjectLiteral(initializer: ts.Expression): ts.ObjectLiteralExpression | undefined
{
    // Direct object literal: { ... }
    if (ts.isObjectLiteralExpression(initializer))
    {
        return initializer;
    }

    // satisfies expression: { ... } satisfies RouteContract
    if (ts.isSatisfiesExpression(initializer))
    {
        return extractObjectLiteral(initializer.expression);
    }

    // as expression: { ... } as const
    if (ts.isAsExpression(initializer))
    {
        return extractObjectLiteral(initializer.expression);
    }

    return undefined;
}

/**
 * Extract method, path, and parameter info from contract object literal
 */
function extractContractData(objectLiteral: ts.ObjectLiteralExpression): {
    method?: HttpMethod;
    path?: string;
    hasQuery?: boolean;
    hasBody?: boolean;
    hasParams?: boolean;
}
{
    const result: {
        method?: HttpMethod;
        path?: string;
        hasQuery?: boolean;
        hasBody?: boolean;
        hasParams?: boolean;
    } = {};

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
            else if (propName === 'query')
            {
                // Has query property
                result.hasQuery = true;
            }
            else if (propName === 'body')
            {
                // Has body property
                result.hasBody = true;
            }
            else if (propName === 'params')
            {
                // Has params property
                result.hasParams = true;
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
 * Get import path for contract file
 *
 * @example
 * /path/to/src/lib/contracts/teams.ts → @/lib/contracts/teams
 */
function getImportPath(filePath: string): string
{
    // Try to find src/ directory
    const srcIndex = filePath.indexOf('/src/');

    if (srcIndex === -1)
    {
        throw new Error(`Cannot determine import path for ${filePath}: /src/ directory not found`);
    }

    // Get path from src/ onwards (+5 to skip '/src/')
    // Remove file extension (.ts, .js, .mjs)
    let cleanPath = filePath.substring(srcIndex + 5);
    if (cleanPath.endsWith('.ts'))
    {
        cleanPath = cleanPath.slice(0, -3);
    }
    else if (cleanPath.endsWith('.js'))
    {
        cleanPath = cleanPath.slice(0, -3);
    }
    else if (cleanPath.endsWith('.mjs'))
    {
        cleanPath = cleanPath.slice(0, -4);
    }

    // Return as module path with @ prefix
    return '@/' + cleanPath;
}