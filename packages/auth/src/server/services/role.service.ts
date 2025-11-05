/**
 * @spfn/auth - Role Service
 *
 * Role management functions for runtime role creation and modification
 */

import { getDatabase } from '@spfn/core/db';
import { roles, permissions, rolePermissions } from '@/server/entities';
import type { Role } from '@/server/entities/roles';
import { eq, and } from 'drizzle-orm';

/**
 * Create a new custom role
 *
 * @param data - Role configuration
 * @returns Created role
 * @throws Error if role name already exists
 *
 * @example
 * ```typescript
 * const role = await createRole({
 *   name: 'content-creator',
 *   displayName: 'Content Creator',
 *   description: 'Can create and publish content',
 *   priority: 20,
 *   permissionIds: [1n, 2n, 3n],
 * });
 * ```
 */
export async function createRole(data: {
    name: string;
    displayName: string;
    description?: string;
    priority?: number;
    permissionIds?: number[];
}): Promise<Role>
{
    const db = getDatabase();

    if (!db)
    {
        throw new Error('[Auth] Database not initialized');
    }

    // Check for duplicate name
    const existing = await db
        .select()
        .from(roles)
        .where(eq(roles.name, data.name))
        .limit(1);

    if (existing.length > 0)
    {
        throw new Error(`Role with name '${data.name}' already exists`);
    }

    // Create role
    const [newRole] = await db
        .insert(roles)
        .values({
            name: data.name,
            displayName: data.displayName,
            description: data.description,
            priority: data.priority ?? 10,
            isSystem: false,  // Custom roles are never system roles
            isBuiltin: false,
        })
        .returning();

    // Assign permissions if provided
    if (data.permissionIds && data.permissionIds.length > 0)
    {
        const mappings = data.permissionIds.map(permId => ({
            roleId: newRole.id,
            permissionId: Number(permId),
        }));

        await db.insert(rolePermissions).values(mappings);
    }

    console.log(`[Auth] ✅ Created custom role: ${data.name}`);

    return newRole;
}

/**
 * Update an existing role
 *
 * @param roleId - Role ID
 * @param data - Update data
 * @returns Updated role
 * @throws Error if role is built-in (cannot modify)
 *
 * @example
 * ```typescript
 * await updateRole(1n, {
 *   displayName: 'Senior Content Creator',
 *   priority: 25,
 * });
 * ```
 */
export async function updateRole(
    roleId: number,
    data: {
        displayName?: string;
        description?: string;
        priority?: number;
        isActive?: boolean;
    }
): Promise<Role>
{
    const db = getDatabase();

    if (!db)
    {
        throw new Error('[Auth] Database not initialized');
    }

    const roleIdNum = Number(roleId);

    // Get role
    const [role] = await db
        .select()
        .from(roles)
        .where(eq(roles.id, roleIdNum))
        .limit(1);

    if (!role)
    {
        throw new Error('Role not found');
    }

    // Cannot modify built-in role priority
    if (role.isBuiltin && data.priority !== undefined)
    {
        throw new Error('Cannot modify priority of built-in roles');
    }

    // Update role
    const [updated] = await db
        .update(roles)
        .set(data)
        .where(eq(roles.id, roleIdNum))
        .returning();

    return updated;
}

/**
 * Delete a role
 *
 * @param roleId - Role ID
 * @throws Error if role is built-in or system role
 *
 * @example
 * ```typescript
 * await deleteRole(5n);  // Delete custom role
 * ```
 */
export async function deleteRole(roleId: number): Promise<void>
{
    const db = getDatabase();

    if (!db)
    {
        throw new Error('[Auth] Database not initialized');
    }

    const roleIdNum = Number(roleId);

    // Get role
    const [role] = await db
        .select()
        .from(roles)
        .where(eq(roles.id, roleIdNum))
        .limit(1);

    if (!role)
    {
        throw new Error('Role not found');
    }

    // Cannot delete built-in roles
    if (role.isBuiltin)
    {
        throw new Error(`Cannot delete built-in role: ${role.name}`);
    }

    // Cannot delete system roles (optional protection)
    if (role.isSystem)
    {
        throw new Error(`Cannot delete system role: ${role.name}. Deactivate it instead.`);
    }

    // Delete role (cascade will remove role_permissions)
    await db.delete(roles).where(eq(roles.id, roleIdNum));

    console.log(`[Auth] 🗑️  Deleted role: ${role.name}`);
}

/**
 * Add permission to role
 *
 * @param roleId - Role ID
 * @param permissionId - Permission ID
 *
 * @example
 * ```typescript
 * await addPermissionToRole(1n, 5n);
 * ```
 */
export async function addPermissionToRole(roleId: number, permissionId: number): Promise<void>
{
    const db = getDatabase();

    if (!db)
    {
        throw new Error('[Auth] Database not initialized');
    }

    const roleIdNum = Number(roleId);
    const permissionIdNum = Number(permissionId);

    // Check if mapping already exists
    const existing = await db
        .select()
        .from(rolePermissions)
        .where(
            and(
                eq(rolePermissions.roleId, roleIdNum),
                eq(rolePermissions.permissionId, permissionIdNum)
            )
        )
        .limit(1);

    if (existing.length > 0)
    {
        return; // Already exists
    }

    // Create mapping
    await db.insert(rolePermissions).values({
        roleId: roleIdNum,
        permissionId: permissionIdNum,
    });
}

/**
 * Remove permission from role
 *
 * @param roleId - Role ID
 * @param permissionId - Permission ID
 *
 * @example
 * ```typescript
 * await removePermissionFromRole(1n, 5n);
 * ```
 */
export async function removePermissionFromRole(roleId: number, permissionId: number): Promise<void>
{
    const db = getDatabase();

    if (!db)
    {
        throw new Error('[Auth] Database not initialized');
    }

    const roleIdNum = Number(roleId);
    const permissionIdNum = Number(permissionId);

    await db
        .delete(rolePermissions)
        .where(
            and(
                eq(rolePermissions.roleId, roleIdNum),
                eq(rolePermissions.permissionId, permissionIdNum)
            )
        );
}

/**
 * Set permissions for a role (replaces all existing permissions)
 *
 * @param roleId - Role ID
 * @param permissionIds - Array of permission IDs
 *
 * @example
 * ```typescript
 * await setRolePermissions(1n, [1n, 2n, 3n]);
 * ```
 */
export async function setRolePermissions(roleId: number, permissionIds: number[]): Promise<void>
{
    const db = getDatabase();

    if (!db)
    {
        throw new Error('[Auth] Database not initialized');
    }

    const roleIdNum = Number(roleId);

    // Delete existing mappings
    await db.delete(rolePermissions).where(eq(rolePermissions.roleId, roleIdNum));

    // Create new mappings
    if (permissionIds.length > 0)
    {
        const mappings = permissionIds.map(permId => ({
            roleId: roleIdNum,
            permissionId: Number(permId),
        }));

        await db.insert(rolePermissions).values(mappings);
    }
}

/**
 * Get all roles
 *
 * @param includeInactive - Include inactive roles
 * @returns Array of roles
 *
 * @example
 * ```typescript
 * const roles = await getAllRoles();
 * ```
 */
export async function getAllRoles(includeInactive = false): Promise<Role[]>
{
    const db = getDatabase();

    if (!db)
    {
        throw new Error('[Auth] Database not initialized');
    }

    const query = db.select().from(roles);

    if (!includeInactive)
    {
        return query.where(eq(roles.isActive, true));
    }

    return query;
}

/**
 * Get role by name
 *
 * @param name - Role name
 * @returns Role or null
 *
 * @example
 * ```typescript
 * const role = await getRoleByName('admin');
 * ```
 */
export async function getRoleByName(name: string): Promise<Role | null>
{
    const db = getDatabase();

    if (!db)
    {
        throw new Error('[Auth] Database not initialized');
    }

    const [role] = await db
        .select()
        .from(roles)
        .where(eq(roles.name, name))
        .limit(1);

    return role || null;
}

/**
 * Get role permissions
 *
 * @param roleId - Role ID
 * @returns Array of permission names
 *
 * @example
 * ```typescript
 * const perms = await getRolePermissions(1n);
 * // ['user:read', 'user:write']
 * ```
 */
export async function getRolePermissions(roleId: number): Promise<string[]>
{
    const db = getDatabase();

    if (!db)
    {
        throw new Error('[Auth] Database not initialized');
    }

    const roleIdNum = Number(roleId);

    const perms = await db
        .select({ name: permissions.name })
        .from(rolePermissions)
        .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
        .where(eq(rolePermissions.roleId, roleIdNum));

    return perms.map(p => p.name);
}