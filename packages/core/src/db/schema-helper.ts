/**
 * Database Schema Helper
 *
 * Provides utilities for creating isolated PostgreSQL schemas for SPFN functions
 */

import { pgSchema } from 'drizzle-orm/pg-core';

/**
 * Create a namespaced PostgreSQL schema for a function
 *
 * @param packageName - NPM package name (e.g., '@spfn/cms', 'spfn-auth')
 * @returns PostgreSQL schema object for creating tables
 *
 * @example
 * ```typescript
 * // @spfn/cms → spfn_cms schema
 * import { createFunctionSchema } from '@spfn/core/db';
 *
 * const schema = createFunctionSchema('@spfn/cms');
 *
 * export const labels = schema.table('labels', {
 *   id: id(),
 *   name: text('name').notNull(),
 * });
 * // Creates table: spfn_cms.labels
 * ```
 */
export function createFunctionSchema(packageName: string)
{
    const schemaName = packageNameToSchema(packageName);
    return pgSchema(schemaName);
}

/**
 * Convert package name to PostgreSQL schema name
 *
 * @param packageName - NPM package name
 * @returns Schema name in PostgreSQL format
 *
 * @example
 * ```typescript
 * packageNameToSchema('@spfn/cms')        // 'spfn_cms'
 * packageNameToSchema('@company/spfn-auth') // 'company_spfn_auth'
 * packageNameToSchema('spfn-storage')     // 'spfn_storage'
 * ```
 */
export function packageNameToSchema(packageName: string): string
{
    // Remove @ and replace / and - with _
    return packageName
        .replace('@', '')
        .replace('/', '_')
        .replace(/-/g, '_');
}

/**
 * Get recommended schema name for a package
 *
 * @param packageName - NPM package name
 * @returns Object with schema name and whether it's scoped
 *
 * @example
 * ```typescript
 * getSchemaInfo('@spfn/cms')
 * // { schemaName: 'spfn_cms', isScoped: true, scope: 'spfn' }
 *
 * getSchemaInfo('spfn-auth')
 * // { schemaName: 'spfn_auth', isScoped: false, scope: null }
 * ```
 */
export function getSchemaInfo(packageName: string)
{
    const isScoped = packageName.startsWith('@');
    const scope = isScoped ? packageName.split('/')[0].substring(1) : null;
    const schemaName = packageNameToSchema(packageName);

    return {
        schemaName,
        isScoped,
        scope,
    };
}