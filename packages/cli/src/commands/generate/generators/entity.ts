/**
 * Entity file generator
 */

import { join } from 'path';
import { writeFileSync, existsSync } from 'fs';
import { toPascalCase, toKebabCase, toSnakeCase, toCamelCase } from '../string-utils.js';
import { loadTemplate } from '../template-loader.js';

/**
 * Generate schema file (once per module)
 */
export function generateSchema(fnDir: string, scope: string, fnName: string): void
{
    const schemaFilePath = join(fnDir, 'src/server/entities/schema.ts');

    // Skip if schema file already exists
    if (existsSync(schemaFilePath))
    {
        return;
    }

    const packageName = `${scope}/${fnName}`;
    const fnNamePascal = toPascalCase(fnName);
    const schemaVarName = `${toCamelCase(fnName)}Schema`;

    const content = loadTemplate('schema', {
        FN_NAME_PASCAL: fnNamePascal,
        PACKAGE_NAME: packageName,
        SCHEMA_VAR_NAME: schemaVarName,
    });

    writeFileSync(schemaFilePath, content);
}

/**
 * Generate entity file
 */
export function generateEntity(fnDir: string, scope: string, fnName: string, entityName: string): void
{
    const schemaName = `spfn_${toSnakeCase(fnName)}`;
    const tableName = toKebabCase(entityName);
    const pascalName = toPascalCase(entityName);
    const schemaVarName = `${toCamelCase(fnName)}Schema`;
    const schemaFileName = 'schema';

    const content = loadTemplate('entity', {
        PASCAL_NAME: pascalName,
        ENTITY_NAME: entityName,
        TABLE_NAME: tableName,
        SCHEMA_NAME: schemaName,
        FN_NAME: fnName,
        SCHEMA_VAR_NAME: schemaVarName,
        SCHEMA_FILE_NAME: schemaFileName,
    });

    writeFileSync(
        join(fnDir, `src/server/entities/${toKebabCase(entityName)}.ts`),
        content
    );
}

/**
 * Generate entities index file
 */
export function generateEntitiesIndex(fnDir: string, entities: string[]): void
{
    const schemaExport = `export * from './schema';`;
    const entityExports = entities
        .map((entity) => `export * from './${toKebabCase(entity)}';`)
        .join('\n');

    const content = [schemaExport, entityExports].filter(Boolean).join('\n');

    writeFileSync(join(fnDir, 'src/server/entities/index.ts'), content + '\n');
}