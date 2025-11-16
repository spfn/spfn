/**
 * @spfn/auth - Role Service
 *
 * Role management functions for runtime role creation and modification
 */

import {
    rolesRepository,
    permissionsRepository,
    rolePermissionsRepository,
} from '@/server/repositories';
import type { Role } from '@/server/entities/roles';

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
    // Check for duplicate name
    const existing = await rolesRepository.findByName(data.name);

    if (existing)
    {
        throw new Error(`Role with name '${data.name}' already exists`);
    }

    // Create role
    const newRole = await rolesRepository.create({
        name: data.name,
        displayName: data.displayName,
        description: data.description || null,
        priority: data.priority ?? 10,
        isSystem: false,  // Custom roles are never system roles
        isBuiltin: false,
        isActive: true,
    });

    // Assign permissions if provided
    if (data.permissionIds && data.permissionIds.length > 0)
    {
        const mappings = data.permissionIds.map(permId => ({
            roleId: newRole.id,
            permissionId: Number(permId),
        }));

        await rolePermissionsRepository.createMany(mappings);
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
    const roleIdNum = Number(roleId);

    // Get role
    const role = await rolesRepository.findById(roleIdNum);

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
    const updated = await rolesRepository.updateById(roleIdNum, data);

    if (!updated)
    {
        throw new Error('Failed to update role');
    }

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
    const roleIdNum = Number(roleId);

    // Get role
    const role = await rolesRepository.findById(roleIdNum);

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
    await rolesRepository.deleteById(roleIdNum);

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
    const roleIdNum = Number(roleId);
    const permissionIdNum = Number(permissionId);

    // Check if mapping already exists
    const existingMappings = await rolePermissionsRepository.findByRoleId(roleIdNum);
    const alreadyExists = existingMappings.some(m => m.permissionId === permissionIdNum);

    if (alreadyExists)
    {
        return; // Already exists
    }

    // Create mapping
    await rolePermissionsRepository.create({
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
    const roleIdNum = Number(roleId);
    const permissionIdNum = Number(permissionId);

    await rolePermissionsRepository.deleteByRoleIdAndPermissionId(roleIdNum, permissionIdNum);
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
    const roleIdNum = Number(roleId);
    const permissionIdNums = permissionIds.map(id => Number(id));

    await rolePermissionsRepository.setPermissionsForRole(roleIdNum, permissionIdNums);
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
    if (includeInactive)
    {
        return await rolesRepository.findAll();
    }

    return await rolesRepository.findActive();
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
    return await rolesRepository.findByName(name);
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
    const roleIdNum = Number(roleId);

    // Get role-permission mappings
    const mappings = await rolePermissionsRepository.findByRoleId(roleIdNum);

    if (mappings.length === 0)
    {
        return [];
    }

    // Get permissions by IDs
    const permissionIds = mappings.map(m => m.permissionId);
    const perms = await Promise.all(
        permissionIds.map(id => permissionsRepository.findById(id))
    );

    // Filter out nulls and return names
    return perms
        .filter((p): p is NonNullable<typeof p> => p !== null)
        .map(p => p.name);
}