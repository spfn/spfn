/**
 * Entity file generator
 */

import { join } from 'path';
import { writeFileSync } from 'fs';
import { toPascalCase, toKebabCase, toSnakeCase } from '../string-utils.js';
import { loadTemplate } from '../template-loader.js';

/**
 * Generate entity file
 */
export function generateEntity(fnDir: string, fnName: string, entityName: string): void
{
    const schemaName = `spfn_${toSnakeCase(fnName)}`;
    const tableName = toKebabCase(entityName);
    const pascalName = toPascalCase(entityName);

    const content = loadTemplate('entity', {
        PASCAL_NAME: pascalName,
        ENTITY_NAME: entityName,
        TABLE_NAME: tableName,
        SCHEMA_NAME: schemaName,
        FN_NAME: fnName,
    });

    writeFileSync(
        join(fnDir, `src/entities/${toKebabCase(entityName)}.ts`),
        content
    );
}

/**
 * Generate entities index file
 */
export function generateEntitiesIndex(fnDir: string, entities: string[]): void
{
    const exports = entities
        .map((entity) => `export * from './${toKebabCase(entity)}.js';`)
        .join('\n');

    writeFileSync(join(fnDir, 'src/entities/index.ts'), exports + '\n');
}