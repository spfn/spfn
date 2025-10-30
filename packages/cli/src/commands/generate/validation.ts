/**
 * Validation helpers for function generation
 */

import { join } from 'path';
import { existsSync } from 'fs';
import { logger } from '../../utils/logger.js';

/**
 * Validate that we're in a monorepo root
 */
export function validateMonorepoRoot(cwd: string): void
{
    const packagesDir = join(cwd, 'packages');
    if (!existsSync(packagesDir))
    {
        logger.error('Not in a monorepo root. packages/ directory not found.');
        logger.info('This command should be run from the monorepo root directory.');
        process.exit(1);
    }
}

/**
 * Validate that function doesn't already exist
 */
export function validateFunctionNotExists(packagesDir: string, fnName: string): void
{
    const fnDir = join(packagesDir, fnName);
    if (existsSync(fnDir))
    {
        logger.error(`Function @spfn/${fnName} already exists at packages/${fnName}`);
        process.exit(1);
    }
}