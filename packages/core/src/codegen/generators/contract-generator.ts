/**
 * Contract Generator
 *
 * Generates type-safe API client from contract definitions
 */

import { join } from 'path';
import { existsSync } from 'fs';
import type { Generator, GeneratorOptions } from '../generator.js';
import { scanContracts } from '../contract-scanner.js';
import { generateClient } from '../client-generator.js';
import { logger } from '../../logger';

const contractLogger = logger.child('contract-gen');

export interface ContractGeneratorConfig
{
    /** Routes directory (default: src/server/routes) */
    routesDir?: string;

    /** Output path (default: src/lib/api.ts) */
    outputPath?: string;

    /** Base URL for API client */
    baseUrl?: string;
}

export function createContractGenerator(config: ContractGeneratorConfig = {}): Generator
{
    return {
        name: 'contract',
        watchPatterns: [
            config.routesDir ?? 'src/server/routes/**/*.ts',
            'src/lib/contracts/**/*.ts',
        ],

        async generate(options: GeneratorOptions): Promise<void>
        {
            const cwd = options.cwd;
            const routesDir = config.routesDir ?? join(cwd, 'src', 'server', 'routes');
            const libContractsDir = join(cwd, 'src', 'lib', 'contracts');
            const outputPath = config.outputPath ?? join(cwd, 'src', 'lib', 'api.ts');

            try
            {
                // Scan contracts from multiple directories
                const contractDirs = [routesDir];

                // Add lib/contracts if it exists
                if (existsSync(libContractsDir))
                {
                    contractDirs.push(libContractsDir);
                }

                let allContracts: any[] = [];

                for (const dir of contractDirs)
                {
                    const contracts = await scanContracts(dir);
                    allContracts = allContracts.concat(contracts);
                }

                if (allContracts.length === 0)
                {
                    if (options.debug)
                    {
                        contractLogger.warn('No contracts found');
                    }
                    return;
                }

                // Generate client
                const stats = await generateClient(allContracts, {
                    routesDir,
                    outputPath,
                    baseUrl: config.baseUrl,
                    includeTypes: true,
                    includeJsDoc: true
                });

                if (options.debug)
                {
                    contractLogger.info('Client generated', {
                        endpoints: stats.methodsGenerated,
                        resources: stats.resourcesGenerated,
                        duration: stats.duration
                    });
                }
            }
            catch (error)
            {
                const err = error instanceof Error ? error : new Error(String(error));
                contractLogger.error('Generation failed', err);
                throw err;
            }
        }
    };
}