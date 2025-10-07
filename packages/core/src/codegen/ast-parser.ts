/**
 * AST Parser for Contract Detection
 *
 * Uses TypeScript Compiler API to parse route files and extract contract information
 */

import * as ts from 'typescript';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import type { ContractImport, BindCall, HttpMethod } from './types.js';

/**
 * Parse a TypeScript file and extract contract imports
 */
export function extractContractImports(filePath: string): ContractImport[]
{
    const sourceCode = readFileSync(filePath, 'utf-8');
    const sourceFile = ts.createSourceFile(
        filePath,
        sourceCode,
        ts.ScriptTarget.Latest,
        true
    );

    const imports: ContractImport[] = [];

    function visit(node: ts.Node): void
    {
        // Handle: import { getUserContract } from '@/contracts/users'
        if (ts.isImportDeclaration(node))
        {
            const importClause = node.importClause;
            const moduleSpecifier = node.moduleSpecifier;

            if (importClause && ts.isStringLiteral(moduleSpecifier))
            {
                const importPath = moduleSpecifier.text;

                // Named imports: import { a, b } from '...'
                if (importClause.namedBindings && ts.isNamedImports(importClause.namedBindings))
                {
                    const elements = importClause.namedBindings.elements;
                    for (let i = 0; i < elements.length; i++)
                    {
                        const element = elements[i];
                        imports.push({
                            name: element.name.text,
                            importPath: importPath,
                            isDefault: false
                        });
                    }
                }

                // Default import: import Contract from '...'
                if (importClause.name)
                {
                    imports.push({
                        name: importClause.name.text,
                        importPath: importPath,
                        isDefault: true
                    });
                }
            }
        }

        ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return imports;
}

/**
 * Extract bind() calls from route file
 */
export function extractBindCalls(filePath: string): BindCall[]
{
    const sourceCode = readFileSync(filePath, 'utf-8');
    const sourceFile = ts.createSourceFile(
        filePath,
        sourceCode,
        ts.ScriptTarget.Latest,
        true
    );

    const bindCalls: BindCall[] = [];
    const httpMethods: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

    function visit(node: ts.Node): void
    {
        // Look for: app.get('/', bind(contract, handler))
        if (ts.isCallExpression(node))
        {
            const expression = node.expression;

            // Check if it's app.METHOD() call
            if (
                ts.isPropertyAccessExpression(expression) &&
                ts.isIdentifier(expression.expression) &&
                expression.expression.text === 'app'
            )
            {
                const methodName = expression.name.text.toUpperCase() as HttpMethod;

                if (httpMethods.indexOf(methodName) !== -1)
                {
                    // Get the first argument (path)
                    const pathArg = node.arguments[0];
                    let path: string | undefined = undefined;

                    if (pathArg && ts.isStringLiteral(pathArg))
                    {
                        path = pathArg.text;
                    }

                    // Get the second argument (should be bind() call)
                    const handlerArg = node.arguments[1];

                    if (handlerArg && ts.isCallExpression(handlerArg))
                    {
                        const bindExpr = handlerArg.expression;

                        // Check if it's bind() function
                        if (ts.isIdentifier(bindExpr) && bindExpr.text === 'bind')
                        {
                            // Get the first argument of bind() (contract)
                            const contractArg = handlerArg.arguments[0];

                            if (contractArg && ts.isIdentifier(contractArg))
                            {
                                bindCalls.push({
                                    method: methodName,
                                    contractName: contractArg.text,
                                    path: path
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
    return bindCalls;
}

/**
 * Resolve import path to absolute file path
 */
export function resolveImportPath(
    importPath: string,
    fromFile: string
): string | null
{
    // Handle relative imports
    if (importPath.startsWith('.'))
    {
        const dir = dirname(fromFile);
        const resolved = resolve(dir, importPath);

        // Try with .ts extension
        try
        {
            return resolved.endsWith('.ts') ? resolved : resolved + '.ts';
        }
        catch (e)
        {
            return null;
        }
    }

    // Handle path aliases (@/, ~/, etc.)
    // Note: This is a simplified implementation
    // For production, should read tsconfig.json paths
    if (importPath.startsWith('@/'))
    {
        const rootDir = process.cwd();
        const relativePath = importPath.slice(2);
        return resolve(rootDir, 'src', relativePath + '.ts');
    }

    return null;
}

/**
 * Check if a contract name matches common naming patterns
 */
export function isLikelyContract(name: string): boolean
{
    return (
        name.indexOf('Contract') !== -1 ||
        name.indexOf('contract') !== -1 ||
        name.endsWith('Schema') ||
        name.endsWith('schema')
    );
}

/**
 * Filter contracts from all imports
 */
export function filterContractImports(imports: ContractImport[]): ContractImport[]
{
    const result: ContractImport[] = [];
    for (let i = 0; i < imports.length; i++)
    {
        if (isLikelyContract(imports[i].name))
        {
            result.push(imports[i]);
        }
    }
    return result;
}