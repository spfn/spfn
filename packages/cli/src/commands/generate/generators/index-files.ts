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
 * Common Module (Types, Entities)
 * 공통 모듈 (타입, 엔티티)
 *
 * Import structure:
 * - @spfn/${fnName}         - Common (types, entities)
 * - @spfn/${fnName}/server  - Server-side (routes, repositories, helpers)
 * - @spfn/${fnName}/client  - Client-side (hooks, store, components)
 */

// ============================================================================
// Types
// ============================================================================

export * from '@/lib/types/index';

// ============================================================================
// Entities (for type reference)
// ============================================================================

export * from '@/server/entities/index';
`;

    writeFileSync(join(fnDir, 'src/index.ts'), content);
}

/**
 * Generate server.ts
 */
export function generateServerIndex(fnDir: string): void
{
    const content = `/**
 * @spfn/[name]/server
 *
 * Server-side Only Module
 * 서버 전용 모듈 (서버 컴포넌트 + 백엔드)
 *
 * Includes:
 * - Routes
 * - Repositories (DB access)
 * - Helpers
 *
 * @note This module should only be imported in server-side code
 */

// ============================================================================
// Routes
// ============================================================================

// TODO: Export routes here

// ============================================================================
// Repositories (DB access)
// ============================================================================

export * from '@/server/repositories/index';

// ============================================================================
// Helpers
// ============================================================================

// TODO: Export helpers here
`;

    writeFileSync(join(fnDir, 'src/server.ts'), content);
}

/**
 * Generate client.ts
 */
export function generateClientIndex(fnDir: string): void
{
    const content = `/**
 * @spfn/[name]/client
 *
 * Client Components Only
 * 클라이언트 컴포넌트 전용 (브라우저에서 실행)
 *
 * Includes:
 * - Hooks
 * - Store (Zustand)
 * - Components
 */

// ============================================================================
// Client-side Hooks
// ============================================================================

export * from './client/hooks';

// ============================================================================
// Client-side Store
// ============================================================================

export * from './client/store';

// ============================================================================
// Client-side Components
// ============================================================================

export * from './client/components';
`;

    writeFileSync(join(fnDir, 'src/client.ts'), content);
}

/**
 * Generate types.ts (deprecated, keeping for backwards compatibility)
 */
export function generateTypesFile(fnDir: string, fnName: string): void
{
    const content = `/**
 * @spfn/${fnName} Types
 *
 * @deprecated This file is kept for backwards compatibility.
 * Types are now in src/lib/types/index.ts
 */

export * from '@/lib/types/index';
`;

    writeFileSync(join(fnDir, 'src/types.ts'), content);
}