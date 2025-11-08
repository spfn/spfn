/**
 * @spfn/auth - RBAC Initialization Service
 *
 * Initialize roles, permissions, and their mappings
 */

import { getDatabase } from '@spfn/core/db';
import { roles, permissions, rolePermissions } from '@/server/entities';
import {
    BUILTIN_ROLES,
    BUILTIN_PERMISSIONS,
    BUILTIN_ROLE_PERMISSIONS,
} from '@/server/rbac';
import type { AuthInitOptions, RoleConfig, PermissionConfig } from '@/server/rbac';
import { eq, and, inArray } from 'drizzle-orm';

/**
 * Initialize auth package with RBAC system
 *
 * Creates built-in roles, permissions, and custom configurations
 *
 * @param options - Initialization options
 *
 * @example
 * ```typescript
 * // Minimal - only built-in roles (user, admin, superadmin)
 * await initializeAuth();
 *
 * // Custom roles and permissions
 * await initializeAuth({
 *   roles: [
 *     { name: 'project-manager', displayName: 'Project Manager', priority: 50 },
 *     { name: 'developer', displayName: 'Developer', priority: 30 },
 *   ],
 *   permissions: [
 *     { name: 'project:create', displayName: 'Create Project', category: 'project' },
 *     { name: 'task:assign', displayName: 'Assign Task', category: 'task' },
 *   ],
 *   rolePermissions: {
 *     'project-manager': ['project:create', 'task:assign'],
 *     'developer': ['task:complete'],
 *   },
 * });
 * ```
 */
export async function initializeAuth(options: AuthInitOptions = {}): Promise<void>
{
    const db = getDatabase();

    if (!db)
    {
        throw new Error('[Auth] Database not initialized. Call initDatabase() first.');
    }

    console.log('[Auth] 🔐 Initializing RBAC system...');

    // 1. Collect all roles (built-in + custom)
    const allRoles: RoleConfig[] = [
        ...Object.values(BUILTIN_ROLES),
        ...(options.roles || []),
    ];

    // 2. Create/update all roles
    for (const roleConfig of allRoles)
    {
        await upsertRole(roleConfig);
    }

    // 3. Collect all permissions (built-in + custom)
    const allPermissions: PermissionConfig[] = [
        ...Object.values(BUILTIN_PERMISSIONS),
        ...(options.permissions || []),
    ];

    // 4. Create/update all permissions
    for (const permConfig of allPermissions)
    {
        await upsertPermission(permConfig);
    }

    // 5. Collect all role-permission mappings (built-in + custom)
    const allMappings: Record<string, string[]> = { ...BUILTIN_ROLE_PERMISSIONS };

    // Merge custom mappings
    if (options.rolePermissions)
    {
        for (const [roleName, permNames] of Object.entries(options.rolePermissions))
        {
            if (allMappings[roleName])
            {
                // Merge with existing mappings (deduplicate)
                allMappings[roleName] = [
                    ...new Set([...allMappings[roleName], ...permNames]),
                ];
            }
            else
            {
                // New role mapping
                allMappings[roleName] = permNames;
            }
        }
    }

    // 6. Create all role-permission mappings
    for (const [roleName, permNames] of Object.entries(allMappings))
    {
        await assignPermissionsToRole(roleName, permNames);
    }

    console.log('[Auth] ✅ RBAC initialization complete');
    console.log(`[Auth] 📊 Roles: ${allRoles.length}, Permissions: ${allPermissions.length}`);
    console.log(`[Auth] 🔒 Built-in roles: user, admin, superadmin`);
}

/**
 * Create or update a role (idempotent)
 */
async function upsertRole(config: RoleConfig): Promise<void>
{
    const db = getDatabase()!;

    const existing = await db
        .select()
        .from(roles)
        .where(eq(roles.name, config.name))
        .limit(1);

    if (existing.length === 0)
    {
        // Create new role
        await db.insert(roles).values({
            name: config.name,
            displayName: config.displayName,
            description: config.description,
            priority: config.priority ?? 10,
            isSystem: config.isSystem ?? false,
            isBuiltin: config.isBuiltin ?? false,
        });

        console.log(`[Auth]   ✅ Created role: ${config.name}`);
    }
    else
    {
        // Update existing role (but preserve priority for built-in roles)
        const updateData: Record<string, any> = {
            displayName: config.displayName,
            description: config.description,
        };

        // Only update priority for non-builtin roles
        if (!existing[0].isBuiltin)
        {
            updateData.priority = config.priority ?? existing[0].priority;
        }

        await db
            .update(roles)
            .set(updateData)
            .where(eq(roles.id, existing[0].id));
    }
}

/**
 * Create or update a permission (idempotent)
 */
async function upsertPermission(config: PermissionConfig): Promise<void>
{
    const db = getDatabase()!;

    const existing = await db
        .select()
        .from(permissions)
        .where(eq(permissions.name, config.name))
        .limit(1);

    if (existing.length === 0)
    {
        // Create new permission
        await db.insert(permissions).values({
            name: config.name,
            displayName: config.displayName,
            description: config.description,
            category: config.category,
            isSystem: config.isSystem ?? false,
            isBuiltin: config.isBuiltin ?? false,
        });

        console.log(`[Auth]   ✅ Created permission: ${config.name}`);
    }
    else
    {
        // Update existing permission
        await db
            .update(permissions)
            .set({
                displayName: config.displayName,
                description: config.description,
                category: config.category,
            })
            .where(eq(permissions.id, existing[0].id));
    }
}

/**
 * Assign permissions to a role
 */
async function assignPermissionsToRole(roleName: string, permissionNames: string[]): Promise<void>
{
    const db = getDatabase()!;

    // Get role
    const [role] = await db
        .select()
        .from(roles)
        .where(eq(roles.name, roleName))
        .limit(1);

    if (!role)
    {
        console.warn(`[Auth]   ⚠️  Role not found: ${roleName}, skipping permission assignment`);
        return;
    }

    // Get permissions
    const perms = await db
        .select()
        .from(permissions)
        .where(inArray(permissions.name, permissionNames));

    if (perms.length === 0)
    {
        console.warn(`[Auth]   ⚠️  No permissions found for role: ${roleName}`);
        return;
    }

    // Create mappings (skip duplicates)
    for (const perm of perms)
    {
        const existing = await db
            .select()
            .from(rolePermissions)
            .where(
                and(
                    eq(rolePermissions.roleId, role.id),
                    eq(rolePermissions.permissionId, perm.id)
                )
            )
            .limit(1);

        if (existing.length === 0)
        {
            await db.insert(rolePermissions).values({
                roleId: role.id,
                permissionId: perm.id,
            });
        }
    }
}