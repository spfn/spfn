/**
 * @spfn/auth - Auth Base Schema
 *
 * Role and permission schemas for authorization
 */

import { Type, Static } from '@sinclair/typebox';

/**
 * Role Schema
 */
export const RoleSchema = Type.Object(
    {
        id: Type.Number({
            description: 'Role ID'
        }),
        name: Type.String({
            description: 'Role name (e.g., user, admin, superadmin)'
        }),
        displayName: Type.String({
            description: 'Display name for UI'
        }),
        priority: Type.Number({
            description: 'Role priority level'
        }),
    }
);

/**
 * Permission Schema
 */
export const PermissionSchema = Type.Object(
    {
        id: Type.Number({
            description: 'Permission ID'
        }),
        name: Type.String({
            description: 'Permission name'
        }),
        displayName: Type.String({
            description: 'Display name for UI'
        }),
        category: Type.Optional(Type.String({
            description: 'Permission category'
        })),
    }
);

export type Role = Static<typeof RoleSchema>;
export type Permission = Static<typeof PermissionSchema>;