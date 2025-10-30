/**
 * Contract file generator
 */

import { join } from 'path';
import { writeFileSync } from 'fs';
import { toPascalCase, toKebabCase } from '../string-utils.js';
import { loadTemplate } from '../template-loader.js';

/**
 * Generate contract file
 */
export function generateContract(fnDir: string, entityName: string): void
{
    const pascalName = toPascalCase(entityName);

    const content = loadTemplate('contract', {
        PASCAL_NAME: pascalName,
        ENTITY_NAME: entityName,
    });

    writeFileSync(
        join(fnDir, `src/contracts/${toKebabCase(entityName)}.ts`),
        content
    );
}