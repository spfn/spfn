/**
 * @spfn/auth - RBAC Initialization Service
 *
 * Initialize roles, permissions, and their mappings
 */

import {
    rolesRepository,
    permissionsRepository,
    rolePermissionsRepository,
} from '../repositories';
import {
    BUILTIN_ROLES,
    BUILTIN_PERMISSIONS,
    BUILTIN_ROLE_PERMISSIONS,
} from '../rbac';
import type { AuthInitOptions, RoleConfig, PermissionConfig } from '../rbac';
import { configureAuth } from '../lib/config';
import { authLogger } from '../logger';

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
    authLogger.service.info('🔐 Initializing RBAC system...');

    // Configure global auth settings
    if (options.sessionTtl !== undefined)
    {
        configureAuth({
            sessionTtl: options.sessionTtl,
        });
        authLogger.service.info(`⏱️  Session TTL: ${options.sessionTtl}`);
    }

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

    authLogger.service.info('✅ RBAC initialization complete');
    authLogger.service.info(`📊 Roles: ${allRoles.length}, Permissions: ${allPermissions.length}`);
    authLogger.service.info('🔒 Built-in roles: user, admin, superadmin');
}

/**
 * Create or update a role (idempotent)
 */
async function upsertRole(config: RoleConfig): Promise<void>
{
    const existing = await rolesRepository.findByName(config.name);

    if (!existing)
    {
        // Create new role
        await rolesRepository.create({
            name: config.name,
            displayName: config.displayName,
            description: config.description || null,
            priority: config.priority ?? 10,
            isSystem: config.isSystem ?? false,
            isBuiltin: config.isBuiltin ?? false,
            isActive: true,
        });

        authLogger.service.info(`  ✅ Created role: ${config.name}`);
    }
    else
    {
        // Update existing role (but preserve priority for built-in roles)
        const updateData: any = {
            displayName: config.displayName,
            description: config.description || null,
        };

        // Only update priority for non-builtin roles
        if (!existing.isBuiltin)
        {
            updateData.priority = config.priority ?? existing.priority;
        }

        await rolesRepository.updateById(existing.id, updateData);
    }
}

/**
 * Create or update a permission (idempotent)
 */
async function upsertPermission(config: PermissionConfig): Promise<void>
{
    const existing = await permissionsRepository.findByName(config.name);

    if (!existing)
    {
        // Create new permission
        await permissionsRepository.create({
            name: config.name,
            displayName: config.displayName,
            description: config.description || null,
            category: config.category || null,
            isSystem: config.isSystem ?? false,
            isBuiltin: config.isBuiltin ?? false,
            isActive: true,
            metadata: null,
        });

        authLogger.service.info(`  ✅ Created permission: ${config.name}`);
    }
    else
    {
        // Update existing permission
        await permissionsRepository.updateById(existing.id, {
            displayName: config.displayName,
            description: config.description || null,
            category: config.category || null,
        });
    }
}

/**
 * Assign permissions to a role
 */
async function assignPermissionsToRole(roleName: string, permissionNames: string[]): Promise<void>
{
    // Get role
    const role = await rolesRepository.findByName(roleName);

    if (!role)
    {
        authLogger.service.warn(`  ⚠️  Role not found: ${roleName}, skipping permission assignment`);
        return;
    }

    // Get permissions
    const perms = await permissionsRepository.findByNames(permissionNames);

    if (perms.length === 0)
    {
        authLogger.service.warn(`  ⚠️  No permissions found for role: ${roleName}`);
        return;
    }

    // Get existing mappings to avoid duplicates
    const existingMappings = await rolePermissionsRepository.findByRoleId(role.id);
    const existingPermIds = new Set(existingMappings.map(m => m.permissionId));

    // Create new mappings (skip duplicates)
    const newMappings = perms
        .filter(perm => !existingPermIds.has(perm.id))
        .map(perm => ({
            roleId: role.id,
            permissionId: perm.id,
        }));

    if (newMappings.length > 0)
    {
        await rolePermissionsRepository.createMany(newMappings);
    }
}