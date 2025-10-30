/**
 * Route file generator
 */

import { join } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import { toPascalCase, toKebabCase } from '../string-utils.js';
import { loadTemplate } from '../template-loader.js';

/**
 * Generate route file
 */
export function generateRoute(fnDir: string, entityName: string): void
{
    const pascalName = toPascalCase(entityName);
    const repoName = `${entityName}Repository`;
    const kebabName = toKebabCase(entityName);

    const content = loadTemplate('route', {
        PASCAL_NAME: pascalName,
        ENTITY_NAME: entityName,
        REPO_NAME: repoName,
        KEBAB_NAME: kebabName,
    });

    const routeDir = join(fnDir, `src/routes/${kebabName}`);
    mkdirSync(routeDir, { recursive: true });
    writeFileSync(join(routeDir, 'index.ts'), content);
}