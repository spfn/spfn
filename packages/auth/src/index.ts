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

// Export all entities
export {
    users,
    userPublicKeys,
    verificationCodes,
    userSocialAccounts,
    roles,
    permissions,
    rolePermissions,
    userPermissions,
} from '@/server/entities/index';

// Export entity types with aliases to avoid conflicts
export type {
    User,
    NewUser,
    UserStatus,
    UserWithVerification,
    UserPublicKey,
    NewUserPublicKey,
    VerificationCode,
    NewVerificationCode,
    UserSocialAccount,
    NewUserSocialAccount,
    Role,
    NewRole,
    RoleEntity,
    NewRoleEntity,
    PermissionEntity,
    NewPermissionEntity,
    RolePermission,
    NewRolePermission,
    UserPermission,
    NewUserPermission,
} from '@/server/entities/index';