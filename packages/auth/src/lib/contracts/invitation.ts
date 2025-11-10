/**
 * @spfn/auth - Invitation API Contracts
 *
 * Type-safe API contracts for user invitation operations
 */

import { Type } from '@sinclair/typebox';
import { ApiResponseSchema, type RouteContract } from '@spfn/core/route/types';

// UUID v4 pattern
const UUID_PATTERN = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

// Email pattern
const EMAIL_PATTERN = '^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$';

// Base64 pattern (DER encoded keys)
const BASE64_PATTERN = '^[A-Za-z0-9+/]+=*$';

// SHA-256 fingerprint pattern (64 hex characters)
const FINGERPRINT_PATTERN = '^[a-f0-9]{64}$';

/**
 * GET /_auth/invitations/:token - Get invitation details (public)
 *
 * Retrieves invitation information for acceptance page
 */
export const getInvitationContract = {
    method: 'GET' as const,
    path: '/_auth/invitations/:token',
    params: Type.Object({
        token: Type.String({
            pattern: UUID_PATTERN,
            description: 'Invitation token (UUID v4)'
        }),
    }),
    response: ApiResponseSchema(
        Type.Object({
            email: Type.String({
                format: 'email',
                description: 'Email address being invited'
            }),
            role: Type.String({
                description: 'Role name (e.g., "admin", "user")'
            }),
            roleDisplayName: Type.String({
                description: 'Role display name (e.g., "Administrator")'
            }),
            invitedBy: Type.String({
                format: 'email',
                description: 'Email of user who sent invitation'
            }),
            expiresAt: Type.String({
                format: 'date-time',
                description: 'ISO 8601 expiration timestamp'
            }),
            metadata: Type.Optional(Type.Any({
                description: 'Custom metadata (welcome message, etc.)'
            })),
        })
    ),
} as const satisfies RouteContract;

/**
 * POST /_auth/invitations/accept - Accept invitation (public)
 *
 * Accepts invitation and creates user account with provided credentials
 */
export const acceptInvitationContract = {
    method: 'POST' as const,
    path: '/_auth/invitations/accept',
    body: Type.Object({
        token: Type.String({
            pattern: UUID_PATTERN,
            description: 'Invitation token'
        }),
        password: Type.String({
            minLength: 8,
            description: 'Account password (minimum 8 characters)'
        }),
        publicKey: Type.String({
            pattern: BASE64_PATTERN,
            description: 'Base64 DER encoded public key (SPKI format)'
        }),
        keyId: Type.String({
            pattern: UUID_PATTERN,
            description: 'Unique key identifier (UUID v4)'
        }),
        fingerprint: Type.String({
            pattern: FINGERPRINT_PATTERN,
            description: 'SHA-256 fingerprint of public key (64 hex chars)'
        }),
        algorithm: Type.Union([
            Type.Literal('ES256'),
            Type.Literal('RS256')
        ], {
            description: 'Asymmetric signing algorithm'
        }),
    }),
    response: ApiResponseSchema(
        Type.Object({
            userId: Type.Number({
                description: 'Created user ID'
            }),
            email: Type.String({
                format: 'email',
                description: 'User email address'
            }),
            role: Type.String({
                description: 'Assigned role name'
            }),
        })
    ),
} as const satisfies RouteContract;

/**
 * POST /_auth/invitations - Create new invitation (admin)
 *
 * Creates and sends invitation to new user
 * Requires: admin role or user:invite permission
 */
export const createInvitationContract = {
    method: 'POST' as const,
    path: '/_auth/invitations',
    body: Type.Object({
        email: Type.String({
            pattern: EMAIL_PATTERN,
            description: 'Email address to invite'
        }),
        roleId: Type.Number({
            description: 'Role ID to assign'
        }),
        expiresInDays: Type.Optional(Type.Number({
            minimum: 1,
            maximum: 30,
            description: 'Days until invitation expires (default: 7)'
        })),
        metadata: Type.Optional(Type.Any({
            description: 'Custom metadata (welcome message, department, etc.)'
        })),
    }),
    response: ApiResponseSchema(
        Type.Object({
            id: Type.Number(),
            email: Type.String({ format: 'email' }),
            token: Type.String({
                description: 'Invitation token (send via email)'
            }),
            roleId: Type.Number(),
            expiresAt: Type.String({
                format: 'date-time',
                description: 'ISO 8601 expiration timestamp'
            }),
            invitationUrl: Type.String({
                description: 'Full invitation URL for email'
            }),
        })
    ),
} as const satisfies RouteContract;

/**
 * GET /_auth/invitations - List invitations (admin)
 *
 * Retrieves paginated list of invitations with filtering
 * Requires: admin role
 */
export const listInvitationsContract = {
    method: 'GET' as const,
    path: '/_auth/invitations',
    query: Type.Object({
        status: Type.Optional(Type.Union([
            Type.Literal('pending'),
            Type.Literal('accepted'),
            Type.Literal('expired'),
            Type.Literal('cancelled'),
        ], {
            description: 'Filter by status'
        })),
        page: Type.Optional(Type.Number({
            minimum: 1,
            description: 'Page number (default: 1)'
        })),
        limit: Type.Optional(Type.Number({
            minimum: 1,
            maximum: 100,
            description: 'Items per page (default: 20)'
        })),
    }),
    response: ApiResponseSchema(
        Type.Object({
            invitations: Type.Array(Type.Object({
                id: Type.Number(),
                email: Type.String({ format: 'email' }),
                status: Type.String(),
                role: Type.Object({
                    id: Type.Number(),
                    name: Type.String(),
                    displayName: Type.String(),
                }),
                inviter: Type.Object({
                    id: Type.Number(),
                    email: Type.String({ format: 'email' }),
                }),
                createdAt: Type.String({ format: 'date-time' }),
                expiresAt: Type.String({ format: 'date-time' }),
                acceptedAt: Type.Optional(Type.String({ format: 'date-time' })),
                cancelledAt: Type.Optional(Type.String({ format: 'date-time' })),
            })),
            total: Type.Number({ description: 'Total invitation count' }),
            page: Type.Number({ description: 'Current page' }),
            limit: Type.Number({ description: 'Items per page' }),
            totalPages: Type.Number({ description: 'Total page count' }),
        })
    ),
} as const satisfies RouteContract;

/**
 * POST /_auth/invitations/cancel - Cancel invitation (admin)
 *
 * Cancels pending invitation
 * Requires: admin role or invitation owner
 */
export const cancelInvitationContract = {
    method: 'POST' as const,
    path: '/_auth/invitations/cancel',
    body: Type.Object({
        id: Type.Number({
            description: 'Invitation ID'
        }),
        reason: Type.Optional(Type.String({
            description: 'Cancellation reason'
        })),
    }),
    response: ApiResponseSchema(
        Type.Object({
            success: Type.Boolean(),
            cancelledAt: Type.String({
                format: 'date-time',
                description: 'Cancellation timestamp'
            }),
        })
    ),
} as const satisfies RouteContract;

/**
 * POST /_auth/invitations/resend - Resend invitation (admin)
 *
 * Resends invitation email and extends expiration
 * Requires: admin role
 */
export const resendInvitationContract = {
    method: 'POST' as const,
    path: '/_auth/invitations/resend',
    body: Type.Object({
        id: Type.Number({
            description: 'Invitation ID'
        }),
        expiresInDays: Type.Optional(Type.Number({
            minimum: 1,
            maximum: 30,
            description: 'New expiration period (default: 7)'
        })),
    }),
    response: ApiResponseSchema(
        Type.Object({
            success: Type.Boolean(),
            expiresAt: Type.String({
                format: 'date-time',
                description: 'New expiration timestamp'
            }),
        })
    ),
} as const satisfies RouteContract;

/**
 * DELETE /_auth/invitations/delete - Delete invitation (superadmin)
 *
 * Permanently deletes invitation record
 * Requires: superadmin role
 */
export const deleteInvitationContract = {
    method: 'POST' as const,
    path: '/_auth/invitations/delete',
    body: Type.Object({
        id: Type.Number({
            description: 'Invitation ID'
        }),
    }),
    response: ApiResponseSchema(
        Type.Object({
            success: Type.Boolean(),
        })
    ),
} as const satisfies RouteContract;