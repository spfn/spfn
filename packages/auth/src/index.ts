/**
 * @spfn/auth
 *
 * Common Module (Types, Entities)
 * 공통 모듈 (타입, 엔티티)
 *
 * Import structure:
 * - @spfn/auth         - Common (types, entities)
 * - @spfn/auth/server  - Server-side (routes, repositories, helpers, middleware)
 * - @spfn/auth/client  - Client-side (hooks, store, components)
 */

// ============================================================================
// Types
// ============================================================================

export * from '@/lib/types/index';

// ============================================================================
// Entities (for type reference)
// ============================================================================

export * from '@/server/entities/index';