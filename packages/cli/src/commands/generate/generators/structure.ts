/**
 * Function structure generator (orchestrator)
 */

import { join } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import {
    generatePackageJson,
    generateTsConfig,
    generateTsupConfig,
    generateDrizzleConfig,
    generateInitMigration,
    generateReadme,
} from './config.js';
import { generateEntity, generateEntitiesIndex } from './entity.js';
import { generateRepository, generateRepositoriesIndex } from './repository.js';
import { generateRoute } from './route.js';
import { generateContract } from './contract.js';
import { generateMainIndex, generateServerIndex, generateTypesFile } from './index-files.js';

export interface GenerateFunctionStructureOptions
{
    fnDir: string;
    fnName: string;
    description: string;
    entities: string[];
    enableCache: boolean;
    enableRoutes: boolean;
}

/**
 * Generate complete function directory structure and files
 */
export async function generateFunctionStructure(options: GenerateFunctionStructureOptions): Promise<void>
{
    const { fnDir, fnName, description, entities, enableRoutes } = options;

    // Create directory structure
    const dirs = [
        'src/entities',
        'src/routes',
        'src/contracts',
        'src/repositories',
        'src/generators',
        'src/helpers',
    ];

    dirs.forEach((dir) => mkdirSync(join(fnDir, dir), { recursive: true }));

    // Generate base configuration files
    generatePackageJson(fnDir, fnName, description);
    generateTsConfig(fnDir);
    generateTsupConfig(fnDir);
    generateDrizzleConfig(fnDir, fnName);
    generateInitMigration(fnDir, fnName);
    generateReadme(fnDir, fnName, description);

    // Generate entity-related files
    if (entities.length > 0)
    {
        for (const entity of entities)
        {
            generateEntity(fnDir, fnName, entity);
            generateRepository(fnDir, entity);

            if (enableRoutes)
            {
                generateRoute(fnDir, entity);
                generateContract(fnDir, entity);
            }
        }

        generateEntitiesIndex(fnDir, entities);
        generateRepositoriesIndex(fnDir, entities);
    }
    else
    {
        // Empty index files
        writeFileSync(join(fnDir, 'src/entities/index.ts'), '// Export your entities here\n');
        writeFileSync(join(fnDir, 'src/repositories/index.ts'), '// Export your repositories here\n');
    }

    // Generate main exports
    generateMainIndex(fnDir, fnName);
    generateServerIndex(fnDir);
    generateTypesFile(fnDir, fnName);
}