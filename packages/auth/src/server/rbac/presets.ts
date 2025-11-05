/**
 * @spfn/auth - Preset Roles and Permissions
 *
 * Optional preset roles and permissions for common use cases
 * Developers can choose to use these or define their own
 */

import type { RoleConfig, PermissionConfig } from './types';

/**
 * Preset roles (optional)
 * Common roles that developers can optionally include
 */
export const PRESET_ROLES: Record<string, RoleConfig> = {
    MODERATOR: {
        name: 'moderator',
        displayName: 'Moderator',
        description: 'Content moderation and community management',
        priority: 50,
        isSystem: true,
    },
    EDITOR: {
        name: 'editor',
        displayName: 'Editor',
        description: 'Content creation and editing',
        priority: 30,
        isSystem: true,
    },
    VIEWER: {
        name: 'viewer',
        displayName: 'Viewer',
        description: 'Read-only access to content',
        priority: 5,
        isSystem: true,
    },
} as const;

/**
 * Preset permissions (optional)
 * Common permissions for typical application features
 */
export const PRESET_PERMISSIONS: Record<string, PermissionConfig> = {
    // Content management
    CONTENT_READ: {
        name: 'content:read',
        displayName: 'Read Content',
        description: 'View all content including drafts',
        category: 'content',
        isSystem: true,
    },
    CONTENT_WRITE: {
        name: 'content:write',
        displayName: 'Write Content',
        description: 'Create and edit content',
        category: 'content',
        isSystem: true,
    },
    CONTENT_DELETE: {
        name: 'content:delete',
        displayName: 'Delete Content',
        description: 'Delete any content',
        category: 'content',
        isSystem: true,
    },
    CONTENT_PUBLISH: {
        name: 'content:publish',
        displayName: 'Publish Content',
        description: 'Publish content to make it public',
        category: 'content',
        isSystem: true,
    },

    // Moderation
    COMMENT_MODERATE: {
        name: 'comment:moderate',
        displayName: 'Moderate Comments',
        description: 'Review and delete inappropriate comments',
        category: 'moderation',
        isSystem: true,
    },

    // System
    SYSTEM_CONFIG: {
        name: 'system:config',
        displayName: 'System Configuration',
        description: 'Configure application settings',
        category: 'system',
        isSystem: true,
    },

    // Analytics
    ANALYTICS_VIEW: {
        name: 'analytics:view',
        displayName: 'View Analytics',
        description: 'Access analytics dashboard and reports',
        category: 'analytics',
        isSystem: true,
    },
} as const;

/**
 * Preset role-permission mappings
 * Recommended permissions for each preset role
 */
export const PRESET_ROLE_PERMISSIONS: Record<string, string[]> = {
    moderator: [
        'auth:self:manage',
        'user:read',
        'content:read',
        'content:write',
        'content:delete',
        'comment:moderate',
    ],
    editor: [
        'auth:self:manage',
        'content:read',
        'content:write',
        'content:publish',
    ],
    viewer: [
        'auth:self:manage',
        'content:read',
    ],
} as const;