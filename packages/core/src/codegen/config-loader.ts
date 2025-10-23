/**
 * Codegen Configuration Loader
 *
 * Loads codegen configuration from .spfnrc.json or package.json
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { createJiti } from 'jiti';
import type { Generator } from './generator.js';
import { createContractGenerator, type ContractGeneratorConfig } from './generators/contract-generator.js';
import { logger } from '../logger';

const configLogger = logger.child('config');

export interface CodegenConfig
{
    generators?: Array<
        | { path: string }  // Custom generator via file path
        | ({ name: string; enabled?: boolean } & Record<string, any>)  // Package-based generator: "package:name" or built-in "name"
    >;
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
        generators: [
            { name: 'contract', enabled: true }
        ]
    };
}

/**
 * Load generator from package
 *
 * Supports format: "package:generator-name" or "@scope/package:generator-name"
 */
async function loadGeneratorFromPackage(
    packageName: string,
    generatorName: string,
    config: Record<string, any>
): Promise<Generator | null>
{
    try
    {
        // Try to load package/codegen/generators export
        const generatorsModule = await import(`${packageName}/codegen/generators`);

        // Look for generator by name in registry
        if (generatorsModule.generators?.[generatorName])
        {
            const createFn = generatorsModule.generators[generatorName];
            const generator = createFn(config);
            configLogger.info(`Loaded ${packageName}:${generatorName}`);
            return generator;
        }

        // Fallback: try conventional name (createXxxGenerator)
        const conventionalName = `create${capitalize(generatorName)}Generator`;
        if (generatorsModule[conventionalName])
        {
            const createFn = generatorsModule[conventionalName];
            const generator = createFn(config);
            configLogger.info(`Loaded ${packageName}:${generatorName} (via ${conventionalName})`);
            return generator;
        }

        configLogger.warn(
            `Generator "${generatorName}" not found in ${packageName}/generators. ` +
            `Expected: generators.${generatorName} or ${conventionalName}`
        );
        return null;
    }
    catch (error)
    {
        const err = error instanceof Error ? error : new Error(String(error));
        configLogger.warn(
            `Failed to load ${packageName}:${generatorName}. ` +
            `Make sure ${packageName} is installed. Error: ${err.message}`
        );
        return null;
    }
}

/**
 * Capitalize first letter
 */
function capitalize(str: string): string
{
    return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Create generator instances from configuration
 */
export async function createGeneratorsFromConfig(config: CodegenConfig, cwd: string): Promise<Generator[]>
{
    const generators: Generator[] = [];

    if (!config.generators || config.generators.length === 0)
    {
        return generators;
    }

    for (const generatorConfig of config.generators)
    {
        try
        {
            // Custom generator (via file path)
            if ('path' in generatorConfig)
            {
                const generatorPath = generatorConfig.path.startsWith('.')
                    ? join(cwd, generatorConfig.path)
                    : generatorConfig.path;

                configLogger.info(`Loading custom generator: ${generatorPath}`);

                let module: any;

                // Use jiti for .ts files, regular import for .js
                if (generatorPath.endsWith('.ts'))
                {
                    const jiti = createJiti(cwd, {
                        interopDefault: true
                    });
                    module = jiti(generatorPath);
                }
                else
                {
                    module = await import(generatorPath);
                }

                const createGenerator = module.default || module.createGenerator || module;

                if (typeof createGenerator === 'function')
                {
                    const generator = createGenerator();
                    generators.push(generator);
                    configLogger.info(`Custom generator loaded: ${generator.name}`);
                }
                else
                {
                    configLogger.warn(`Invalid generator at ${generatorPath}: expected function`);
                }
            }
            // Package-based generator: "package:name" or "@scope/package:name"
            else if ('name' in generatorConfig && generatorConfig.name.includes(':'))
            {
                if (generatorConfig.enabled !== false)
                {
                    const [packageName, generatorName] = generatorConfig.name.split(':');
                    const { enabled, name, ...generatorOptions } = generatorConfig;

                    const generator = await loadGeneratorFromPackage(
                        packageName,
                        generatorName,
                        generatorOptions
                    );

                    if (generator)
                    {
                        generators.push(generator);
                    }
                }
            }
            // Built-in generators (backward compatibility)
            else if ('name' in generatorConfig)
            {
                // Map old names to new format
                if (generatorConfig.name === 'contract')
                {
                    // Redirect to @spfn/core:contract
                    if (generatorConfig.enabled !== false)
                    {
                        const contractConfig: ContractGeneratorConfig = {
                            routesDir: generatorConfig.routesDir,
                            outputPath: generatorConfig.outputPath,
                            baseUrl: generatorConfig.baseUrl
                        };

                        generators.push(createContractGenerator(contractConfig));
                        configLogger.info('Contract generator enabled (legacy name)');
                    }
                }
                else
                {
                    configLogger.warn(
                        `Unknown generator "${generatorConfig.name}". ` +
                        `Use package:name format (e.g., "@spfn/core:contract")`
                    );
                }
            }
        }
        catch (error)
        {
            const err = error instanceof Error ? error : new Error(String(error));
            configLogger.error('Failed to load generator', err);
        }
    }

    return generators;
}