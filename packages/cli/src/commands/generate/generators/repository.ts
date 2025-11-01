/**
 * Repository file generator
 */

import { join } from 'path';
import { writeFileSync } from 'fs';
import { toPascalCase, toKebabCase } from '../string-utils.js';
import { loadTemplate } from '../template-loader.js';

/**
 * Generate repository file
 */
export function generateRepository(fnDir: string, entityName: string): void
{
    const pascalName = toPascalCase(entityName);
    const repoName = `${entityName}Repository`;

    const content = loadTemplate('repository', {
        PASCAL_NAME: pascalName,
        ENTITY_NAME: entityName,
        REPO_NAME: repoName,
    });

    writeFileSync(
        join(fnDir, `src/server/repositories/${toKebabCase(entityName)}.repository.ts`),
        content
    );
}

/**
 * Generate repositories index file
 */
export function generateRepositoriesIndex(fnDir: string, entities: string[]): void
{
    const exports = entities
        .map((entity) => `export * from './${toKebabCase(entity)}.repository';`)
        .join('\n');

    writeFileSync(join(fnDir, 'src/server/repositories/index.ts'), exports + '\n');
}