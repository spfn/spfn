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
import { generateMainIndex, generateServerIndex, generateClientIndex, generateTypesFile } from './index-files.js';

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

    // Create directory structure (3-layer architecture)
    const dirs = [
        // Shared layer
        'src/lib/contracts',
        'src/lib/types',
        // Server layer
        'src/server/entities',
        'src/server/routes',
        'src/server/repositories',
        'src/server/helpers',
        'src/server/generators',
        // Client layer
        'src/client/hooks',
        'src/client/store',
        'src/client/components',
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
        writeFileSync(join(fnDir, 'src/server/entities/index.ts'), '// Export your entities here\n');
        writeFileSync(join(fnDir, 'src/server/repositories/index.ts'), '// Export your repositories here\n');
    }

    // Generate client module files
    writeFileSync(join(fnDir, 'src/client/hooks/index.ts'), '/**\n * Client Hooks\n */\n\n// TODO: Add hooks (e.g., useAuth, useData, etc.)\n');
    writeFileSync(join(fnDir, 'src/client/store/index.ts'), '/**\n * Client Store\n */\n\n// TODO: Add Zustand store if needed\n');
    writeFileSync(join(fnDir, 'src/client/components/index.ts'), '/**\n * Client Components\n */\n\n// TODO: Add React components\n');
    writeFileSync(join(fnDir, 'src/client/index.ts'), '/**\n * Client Module Entry\n */\n\nexport * from \'./hooks\';\nexport * from \'./store\';\nexport * from \'./components\';\n');

    // Generate lib module files
    writeFileSync(join(fnDir, 'src/lib/types/index.ts'), '/**\n * Shared Type Definitions\n */\n\n// Add your shared types here\n');
    writeFileSync(join(fnDir, 'src/lib/contracts/index.ts'), '/**\n * API Contracts\n */\n\n// Export your contracts here\n');

    // Generate main exports
    generateMainIndex(fnDir, fnName);
    generateServerIndex(fnDir);
    generateClientIndex(fnDir);
    generateTypesFile(fnDir, fnName);
}