/**
 * Contract Watcher & Client Generator
 *
 * Watches contract files and regenerates client code
 */

import { join } from 'path';
import { scanContracts } from './contract-scanner.js';
import { generateClient } from './client-generator.js';
import type { GenerationStats } from './types.js';

export interface WatchGenerateOptions {
    /** Routes directory (default: src/server/routes) */
    routesDir?: string;

    /** Output path for generated client (default: src/lib/api/client.ts) */
    outputPath?: string;

    /** Base URL for API client */
    baseUrl?: string;

    /** Enable debug logging */
    debug?: boolean;
}

/**
 * Watch contracts and generate client code
 *
 * This file is meant to be run with tsx --watch
 */
export async function watchAndGenerate(options: WatchGenerateOptions = {}): Promise<void> {
    const cwd = process.cwd();
    const routesDir = options.routesDir ?? join(cwd, 'src', 'server', 'routes');
    const outputPath = options.outputPath ?? join(cwd, 'src', 'lib', 'api', 'client.ts');
    const debug = options.debug ?? false;

    if (debug) {
        console.log('📦 Contract Watcher Started');
        console.log(`   Watching: ${routesDir}`);
        console.log(`   Output: ${outputPath}\n`);
    }

    try {
        // Scan contracts
        const contracts = await scanContracts(routesDir);

        if (contracts.length === 0) {
            if (debug) {
                console.warn('⚠️  No contracts found\n');
            }
            return;
        }

        // Generate client
        const stats: GenerationStats = await generateClient(contracts, {
            routesDir,
            outputPath,
            baseUrl: options.baseUrl,
            includeTypes: true,
            includeJsDoc: true
        });

        // Log stats
        if (debug) {
            console.log('✅ Client generated');
            console.log(`   Endpoints: ${stats.methodsGenerated}`);
            console.log(`   Resources: ${stats.resourcesGenerated}`);
            console.log(`   Duration: ${stats.duration}ms\n`);
        }
    } catch (error) {
        console.error('❌ Generation failed:', error);
        throw error;
    }
}

// Auto-run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    watchAndGenerate({ debug: true });
}