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
 * Scan contracts directory and extract contract exports
 *
 * @param contractsDir - Path to server/contracts directory
 * @returns Array of contract-to-route mappings
 */
export async function scanContracts(contractsDir: string): Promise<RouteContractMapping[]>
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

            mappings.push({
                method: contractExport.method,
                path: contractExport.path,
                contractName: contractExport.name,
                contractImportPath: getImportPath(filePath, contractsDir),
                routeFile: '', // Not needed anymore
                contractFile: filePath
            });
        }
    }

    return mappings;
}

/**
 * Recursively scan for TypeScript files in contracts directory
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
            else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts'))
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

            if (propName === 'method' && ts.isStringLiteral(prop.initializer))
            {
                result.method = prop.initializer.text as HttpMethod;
            }
            else if (propName === 'path' && ts.isStringLiteral(prop.initializer))
            {
                result.path = prop.initializer.text;
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
 * Get import path relative to contracts directory
 *
 * @example
 * filePath: /path/to/server/contracts/users/create.ts
 * contractsDir: /path/to/server/contracts
 * returns: @/server/contracts/users/create
 */
function getImportPath(filePath: string, contractsDir: string): string
{
    // Get relative path from contracts dir
    let relativePath = filePath.replace(contractsDir, '');

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
    return '@/server/contracts/' + relativePath;
}