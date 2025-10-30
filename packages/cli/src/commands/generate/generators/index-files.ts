/**
 * Index file generators
 */

import { join } from 'path';
import { writeFileSync } from 'fs';

/**
 * Generate main index.ts
 */
export function generateMainIndex(fnDir: string, fnName: string): void
{
    const content = `/**
 * @spfn/${fnName}
 *
 * Main export file
 */

// Re-export entities
export * from '@/entities/index.js';

// Re-export types
export * from '@/types.js';
`;

    writeFileSync(join(fnDir, 'src/index.ts'), content);
}

/**
 * Generate server.ts
 */
export function generateServerIndex(fnDir: string): void
{
    const content = `/**
 * Server-only exports
 *
 * This file is for server-side only code
 */

// Re-export repositories
export * from '@/repositories/index.js';
`;

    writeFileSync(join(fnDir, 'src/server.ts'), content);
}

/**
 * Generate types.ts
 */
export function generateTypesFile(fnDir: string, fnName: string): void
{
    const content = `/**
 * @spfn/${fnName} Types
 *
 * Shared type definitions
 */

// Add your shared types here
`;

    writeFileSync(join(fnDir, 'src/types.ts'), content);
}