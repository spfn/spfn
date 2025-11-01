/**
 * Contract Generator
 *
 * Generates type-safe API client from contract definitions
 *
 * Features:
 * - Automatic scanning of contract files
 * - Type-safe client generation with InferContract
 * - Split output by resource for better code organization
 * - Incremental updates when single files change (smart regeneration)
 */

import { join } from 'path';
import { existsSync } from 'fs';
import type { Generator, GeneratorOptions, GeneratorTrigger } from '../../generator';
import { scanContracts } from '../../scanners/contract-scanner';
import { generateClient } from './client-generator';
import { logger } from '../../../logger';
import type { RouteContractMapping, ClientGenerationOptions } from '../../types';

const contractLogger = logger.child('contract-gen');

/** Default paths */
const DEFAULT_CONTRACTS_DIR = 'src/lib/contracts';
const DEFAULT_OUTPUT_PATH = 'src/lib/api';

export interface ContractGeneratorConfig
{
    /** Contracts directory (default: src/lib/contracts) */
    contractsDir?: string;

    /** Output directory (default: src/lib/api) */
    outputPath?: string;

    /** Base URL for API client */
    baseUrl?: string;

    /** When to run this generator (default: ['watch', 'manual', 'build']) */
    runOn?: GeneratorTrigger[];
}

/**
 * Cache for incremental updates
 */
interface ContractCache
{
    /** All scanned contracts */
    contracts: RouteContractMapping[];

    /** Timestamp of last scan */
    lastScan: number;
}

let contractCache: ContractCache | null = null;

/**
 * Check if a file change requires full regeneration
 *
 * We need full regen if:
 * - New file added
 * - File deleted
 * - Cache doesn't exist
 */
function needsFullRegeneration(
    event: 'add' | 'change' | 'unlink'
): boolean
{
    // New files or deletions always require full scan
    if (event === 'add' || event === 'unlink')
    {
        return true;
    }

    // No cache means first run
    if (!contractCache)
    {
        return true;
    }

    // For 'change' events, we can do smart regen
    // (only if the file still exports the same contracts)
    return false;
}

/**
 * Helper to create client generation options
 */
function createClientOptions(
    contractsDir: string,
    outputPath: string,
    baseUrl?: string
): ClientGenerationOptions
{
    return {
        routesDir: contractsDir,
        outputPath,
        baseUrl,
        includeTypes: true,
        includeJsDoc: true,
        splitByResource: true
    };
}

export function createContractGenerator(config: ContractGeneratorConfig = {}): Generator
{
    // Resolve paths once
    const contractsDir = config.contractsDir ?? DEFAULT_CONTRACTS_DIR;
    const outputPath = config.outputPath ?? DEFAULT_OUTPUT_PATH;
    const runOn = config.runOn ?? ['watch', 'manual', 'build'];  // Default excludes 'start'

    return {
        name: 'contract',
        watchPatterns: [
            `${contractsDir}/**/*.ts`,
        ],
        runOn,

        async generate(options: GeneratorOptions): Promise<void>
        {
            const cwd = options.cwd;
            const fullContractsDir = join(cwd, contractsDir);
            const fullOutputPath = join(cwd, outputPath);

            try
            {
                // Check if contracts directory exists
                if (!existsSync(fullContractsDir))
                {
                    if (options.debug)
                    {
                        contractLogger.warn(`No contracts directory found at ${contractsDir}`);
                    }
                    return;
                }

                // Check for incremental update opportunity
                const changedFile = options.trigger?.changedFile;
                if (changedFile && !needsFullRegeneration(changedFile.event))
                {
                    if (options.debug)
                    {
                        contractLogger.info('Attempting incremental update', {
                            file: changedFile.path,
                            event: changedFile.event
                        });
                    }

                    // Try incremental update
                    const success = await attemptIncrementalUpdate({
                        cwd,
                        contractsDir: fullContractsDir,
                        outputPath: fullOutputPath,
                        changedFilePath: changedFile.path,
                        baseUrl: config.baseUrl,
                        debug: options.debug
                    });

                    if (success)
                    {
                        if (options.debug)
                        {
                            contractLogger.info('Incremental update successful');
                        }
                        return;
                    }

                    // Fall through to full regeneration if incremental failed
                    if (options.debug)
                    {
                        contractLogger.info('Incremental update failed, doing full regen');
                    }
                }

                // Full regeneration
                const allContracts = await scanContracts(fullContractsDir);

                if (allContracts.length === 0)
                {
                    if (options.debug)
                    {
                        contractLogger.warn('No contracts found');
                    }
                    contractCache = null;
                    return;
                }

                // Generate client
                const clientOptions = createClientOptions(fullContractsDir, fullOutputPath, config.baseUrl);
                const stats = await generateClient(allContracts, clientOptions);

                // Update cache
                contractCache = {
                    contracts: allContracts,
                    lastScan: Date.now()
                };

                if (options.debug)
                {
                    contractLogger.info('Client generated', {
                        endpoints: stats.methodsGenerated,
                        resources: stats.resourcesGenerated,
                        duration: stats.duration,
                        mode: changedFile ? 'incremental-fallback' : 'full'
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

/**
 * Options for incremental update
 */
interface IncrementalUpdateOptions
{
    cwd: string;
    contractsDir: string;
    outputPath: string;
    changedFilePath: string;
    baseUrl?: string;
    debug?: boolean;
}

/**
 * Attempt incremental update for a single file change
 *
 * Strategy:
 * 1. Rescan the entire directory to get updated contracts
 * 2. Compare with cached contracts to find what changed
 * 3. Skip regeneration if no contract signatures changed (e.g., formatting only)
 * 4. Otherwise, do full client generation (contracts are interconnected)
 *
 * Returns true if successful, false if full regen is needed
 */
async function attemptIncrementalUpdate(options: IncrementalUpdateOptions): Promise<boolean>
{
    const { cwd, contractsDir, outputPath, changedFilePath, baseUrl, debug } = options;

    if (!contractCache)
    {
        return false;  // No cache, need full regen
    }

    try
    {
        const fullPath = join(cwd, changedFilePath);

        if (!existsSync(fullPath))
        {
            // File deleted during watch, need full regen
            return false;
        }

        // Rescan the entire directory to get updated contracts
        // (This is still faster than full client generation)
        const updatedContracts = await scanContracts(contractsDir);

        if (updatedContracts.length === 0)
        {
            contractCache = null;
            return false;
        }

        // Compare with cached contracts to find what changed
        const changedContracts = findChangedContracts(
            contractCache.contracts,
            updatedContracts,
            changedFilePath
        );

        if (changedContracts.size === 0)
        {
            if (debug)
            {
                contractLogger.info('No contract changes detected, skipping regeneration');
            }
            return true;  // No changes, skip regen
        }

        // Regenerate everything since contracts are interconnected
        // (A safer approach than trying to regenerate only affected resources)
        const clientOptions = createClientOptions(contractsDir, outputPath, baseUrl);
        const stats = await generateClient(updatedContracts, clientOptions);

        // Update cache
        contractCache = {
            contracts: updatedContracts,
            lastScan: Date.now()
        };

        if (debug)
        {
            contractLogger.info('Incremental update successful', {
                changedContracts: changedContracts.size,
                endpoints: stats.methodsGenerated,
                resources: stats.resourcesGenerated,
                duration: stats.duration
            });
        }

        return true;
    }
    catch (error)
    {
        if (debug)
        {
            const err = error instanceof Error ? error : new Error(String(error));
            contractLogger.warn('Incremental update failed', err);
        }
        return false;
    }
}

/**
 * Find contracts that changed in the given file
 */
function findChangedContracts(
    oldContracts: RouteContractMapping[],
    newContracts: RouteContractMapping[],
    changedFilePath: string
): Set<string>
{
    const changed = new Set<string>();

    // Find contracts from the changed file in both old and new
    const oldInFile = oldContracts.filter(c => c.contractFile?.includes(changedFilePath));
    const newInFile = newContracts.filter(c => c.contractFile?.includes(changedFilePath));

    // If contract count changed, mark all as changed
    if (oldInFile.length !== newInFile.length)
    {
        newInFile.forEach(c => changed.add(c.contractName));
        return changed;
    }

    // Compare contract signatures
    for (const newContract of newInFile)
    {
        const oldContract = oldInFile.find(c => c.contractName === newContract.contractName);

        if (!oldContract)
        {
            changed.add(newContract.contractName);
            continue;
        }

        // Check if contract signature changed
        if (
            oldContract.method !== newContract.method ||
            oldContract.path !== newContract.path ||
            oldContract.hasQuery !== newContract.hasQuery ||
            oldContract.hasBody !== newContract.hasBody ||
            oldContract.hasParams !== newContract.hasParams
        )
        {
            changed.add(newContract.contractName);
        }
    }

    return changed;
}