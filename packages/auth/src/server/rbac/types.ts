/**
 * @spfn/auth - RBAC Type Definitions
 *
 * Type definitions for role and permission configuration
 */

export interface RoleConfig
{
    // Role identifier (e.g., 'admin', 'editor', 'content-creator')
    name: string;

    // Display name for UI
    displayName: string;

    // Role description
    description?: string;

    // Priority level (higher = more privileged)
    // Default: 10 for custom roles
    priority?: number;

    // System role flag (defined in code vs runtime created)
    // Default: false for custom roles
    isSystem?: boolean;

    // Built-in role flag (core package roles that cannot be deleted)
    // Internal use only - set by package
    isBuiltin?: boolean;
}

export interface PermissionConfig
{
    // Permission identifier (e.g., 'user:delete', 'post:publish')
    name: string;

    // Display name for UI
    displayName: string;

    // Permission description
    description?: string;

    // Category for grouping (e.g., 'user', 'post', 'admin')
    category?: string;

    // System permission flag
    // Default: false for custom permissions
    isSystem?: boolean;

    // Built-in permission flag (core package permissions)
    // Internal use only - set by package
    isBuiltin?: boolean;
}

export interface AuthInitOptions
{
    /**
     * Additional roles to create
     * Built-in roles (user, admin, superadmin) are automatically included
     */
    roles?: RoleConfig[];

    /**
     * Additional permissions to create
     * Built-in permissions are automatically included
     */
    permissions?: PermissionConfig[];

    /**
     * Role-Permission mappings
     * Built-in mappings are automatically included
     * You can extend built-in roles or define mappings for custom roles
     *
     * @example
     * ```typescript
     * {
     *   // Extend built-in admin role
     *   admin: ['project:create', 'project:delete'],
     *
     *   // Define custom role permissions
     *   'project-manager': ['project:create', 'task:assign'],
     * }
     * ```
     */
    rolePermissions?: Record<string, string[]>;

    /**
     * Default role name for new users
     * Must be a valid role name that exists after initialization
     * @default 'user'
     */
    defaultRole?: string;
}