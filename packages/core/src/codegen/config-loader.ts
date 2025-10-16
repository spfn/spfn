/**
 * Codegen Configuration Loader
 *
 * Loads codegen configuration from .spfnrc.json or package.json
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { Generator } from './generator.js';
import { createContractGenerator, type ContractGeneratorConfig } from './generators/contract-generator.js';
import { logger } from '../logger';

const configLogger = logger.child('config');

export interface CodegenConfig
{
    generators?: {
        contract?: ContractGeneratorConfig & { enabled?: boolean };
    };
}

/**
 * Load codegen configuration from .spfnrc.json or package.json
 */
export function loadCodegenConfig(cwd: string): CodegenConfig
{
    // 1. Check .spfnrc.json
    const rcPath = join(cwd, '.spfnrc.json');
    if (existsSync(rcPath))
    {
        try
        {
            const content = readFileSync(rcPath, 'utf-8');
            const config = JSON.parse(content);

            if (config.codegen)
            {
                configLogger.info('Loaded config from .spfnrc.json');
                return config.codegen as CodegenConfig;
            }
        }
        catch (error)
        {
            configLogger.warn('Failed to parse .spfnrc.json', error as Error);
        }
    }

    // 2. Check package.json
    const pkgPath = join(cwd, 'package.json');
    if (existsSync(pkgPath))
    {
        try
        {
            const content = readFileSync(pkgPath, 'utf-8');
            const pkg = JSON.parse(content);

            if (pkg.spfn?.codegen)
            {
                configLogger.info('Loaded config from package.json');
                return pkg.spfn.codegen as CodegenConfig;
            }
        }
        catch (error)
        {
            configLogger.warn('Failed to parse package.json', error as Error);
        }
    }

    // 3. Default configuration
    configLogger.info('Using default config');
    return {
        generators: {
            contract: { enabled: true }
        }
    };
}

/**
 * Create generator instances from configuration
 */
export function createGeneratorsFromConfig(config: CodegenConfig): Generator[]
{
    const generators: Generator[] = [];

    // Contract generator
    if (config.generators?.contract?.enabled !== false)
    {
        const contractConfig: ContractGeneratorConfig = {
            routesDir: config.generators?.contract?.routesDir,
            outputPath: config.generators?.contract?.outputPath,
            baseUrl: config.generators?.contract?.baseUrl
        };

        generators.push(createContractGenerator(contractConfig));
        configLogger.info('Contract generator enabled');
    }

    return generators;
}