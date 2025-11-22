/**
 * Router Metadata Generator
 *
 * Generates type-safe API client from define-route router with pre-extracted metadata.
 * This eliminates the need to import the actual router object on the client side.
 *
 * Features:
 * - Automatic scanning of router files
 * - Route metadata extraction (method, path)
 * - Pre-configured API client with configureApi()
 * - Works in Server Components without router import
 */

import { join } from 'path';
import { existsSync } from 'fs';
import type { Generator, GeneratorOptions, GeneratorTrigger } from '../../core/generator';
import { scanRouter } from './scanner';
import { generateApiClient } from './emitter';
import { logger } from '../../../logger';

const routerLogger = logger.child('@spfn/core:router-gen');

/** Default paths */
const DEFAULT_ROUTER_PATH = 'src/server/router.ts';
const DEFAULT_OUTPUT_PATH = 'src/server/router.metadata.ts';

export interface RouterGeneratorConfig
{
    /** Router file path (default: src/server/router.ts) */
    routerPath?: string;

    /** Output file path (default: src/server/router.metadata.ts) */
    outputPath?: string;

    /** Base URL for API client (default: '/api/actions') */
    baseUrl?: string;

    /** When to run this generator (default: ['watch', 'manual', 'build']) */
    runOn?: GeneratorTrigger[];
}

export function createRouterGenerator(config: RouterGeneratorConfig = {}): Generator
{
    const routerPath = config.routerPath ?? DEFAULT_ROUTER_PATH;
    const outputPath = config.outputPath ?? DEFAULT_OUTPUT_PATH;
    const baseUrl = config.baseUrl ?? '/api/actions';
    const runOn = config.runOn ?? ['watch', 'manual', 'build'];

    return {
        name: 'router',
        watchPatterns: [
            routerPath,
            'src/server/routes/**/*.ts',
        ],
        runOn,

        async generate(options: GeneratorOptions): Promise<void>
        {
            const cwd = options.cwd;
            const fullRouterPath = join(cwd, routerPath);
            const fullOutputPath = join(cwd, outputPath);

            // Log generator start with configuration
            routerLogger.info('Router generator started', {
                routerPath,
                outputPath,
                baseUrl,
                trigger: options.trigger?.type
            });

            try
            {
                // Check if router file exists
                if (!existsSync(fullRouterPath))
                {
                    routerLogger.warn(`No router file found at ${routerPath}`);
                    return;
                }

                // Scan router and extract metadata
                routerLogger.info('Scanning router...');
                const startTime = Date.now();
                const metadata = await scanRouter(cwd, options.debug);

                if (!metadata || Object.keys(metadata.routes).length === 0)
                {
                    routerLogger.warn('No routes found in router');
                    return;
                }

                const routeCount = Object.keys(metadata.routes).length;
                routerLogger.info(`Found ${routeCount} route(s), generating metadata...`);

                // Generate API client with metadata
                await generateApiClient({
                    metadata,
                    outputPath: fullOutputPath,
                    baseUrl,
                    routerImportPath: routerPath.replace(/\.ts$/, '').replace(/^src\//, '@/'),
                });

                const duration = Date.now() - startTime;
                routerLogger.info('✓ Router metadata generated', {
                    routes: routeCount,
                    duration: `${duration}ms`
                });
            }
            catch (error)
            {
                const err = error instanceof Error ? error : new Error(String(error));
                routerLogger.error('Generation failed', err);
                throw err;
            }
        }
    };
}