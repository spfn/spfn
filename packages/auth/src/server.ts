/**
 * @spfn/auth/server
 *
 * Server-side Only Module
 * 서버 전용 모듈 (서버 컴포넌트 + 백엔드)
 *
 * Includes:
 * - Routes (auth endpoints)
 * - Repositories (user, verification-code)
 * - Helpers (jwt, password)
 * - Middleware (authenticate, requirePermissions, requireRole)
 * - Services (auth, verification, key, user, rbac, permission, role)
 * - RBAC (roles, permissions, types)
 * - Setup functions
 *
 * @note This module should only be imported in server-side code
 */

// ============================================================================
// Routes
// ============================================================================

// ============================================================================
// Services (Business Logic)
// ============================================================================

export * from './server/services/index';

// ============================================================================
// Repositories (DB access)
// ============================================================================

export * from './server/repositories/index';

// ============================================================================
// Helpers (JWT, Password)
// ============================================================================

export * from './server/helpers/index';

// ============================================================================
// Middleware
// ============================================================================

export * from './server/middleware/index';

// ============================================================================
// Setup Functions
// ============================================================================

export { ensureAdminExists } from './server/setup';

// ============================================================================
// SPFN Plugin (Auto-discovered by @spfn/core)
// ============================================================================

export { spfnPlugin } from './plugin.js';