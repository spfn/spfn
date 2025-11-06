/**
 * @spfn/auth - Invitation Service
 *
 * User invitation management for invite-only registration
 */

import { getDatabase } from '@spfn/core/db';
import { invitations, users, roles } from '@/server/entities';
import type { Invitation, InvitationStatus, InvitationWithDetails } from '@/server/entities/invitations';
import { eq, and, lt, desc, sql } from 'drizzle-orm';
import { hashPassword } from '@/server/helpers';
import crypto from 'crypto';

/**
 * Generate unique invitation token (UUID v4)
 */
function generateInvitationToken(): string
{
    return crypto.randomUUID();
}

/**
 * Calculate expiration date from now
 *
 * @param days - Number of days until expiration (default: 7)
 * @returns Expiration timestamp
 */
function calculateExpiresAt(days: number = 7): Date
{
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);
    return expiresAt;
}

/**
 * Create a new invitation
 *
 * @param params - Invitation parameters
 * @returns Created invitation
 * @throws Error if validation fails
 *
 * @example
 * ```typescript
 * const invitation = await createInvitation({
 *   email: 'newuser@example.com',
 *   roleId: 2n,
 *   invitedBy: 1n,
 *   expiresInDays: 7,
 *   metadata: { message: 'Welcome!' }
 * });
 * ```
 */
export async function createInvitation(params: {
    email: string;
    roleId: number;
    invitedBy: number;
    expiresInDays?: number;
    metadata?: Record<string, any>;
}): Promise<Invitation>
{
    const db = getDatabase();

    if (!db)
    {
        throw new Error('[Auth] Database not initialized');
    }

    const { email, roleId, invitedBy, expiresInDays = 7, metadata } = params;

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email))
    {
        throw new Error('Invalid email format');
    }

    // Check if user already exists
    const existingUser = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

    if (existingUser.length > 0)
    {
        throw new Error('User with this email already exists');
    }

    // Check if there's already a pending invitation for this email
    const existingInvitation = await db
        .select()
        .from(invitations)
        .where(
            and(
                eq(invitations.email, email),
                eq(invitations.status, 'pending')
            )
        )
        .limit(1);

    if (existingInvitation.length > 0)
    {
        throw new Error('Pending invitation already exists for this email');
    }

    // Verify role exists
    const role = await db
        .select()
        .from(roles)
        .where(eq(roles.id, roleId))
        .limit(1);

    if (role.length === 0)
    {
        throw new Error(`Role with id ${roleId} not found`);
    }

    // Verify inviter exists
    const inviter = await db
        .select()
        .from(users)
        .where(eq(users.id, invitedBy))
        .limit(1);

    if (inviter.length === 0)
    {
        throw new Error(`User with id ${invitedBy} not found`);
    }

    // Generate unique token
    const token = generateInvitationToken();
    const expiresAt = calculateExpiresAt(expiresInDays);

    // Create invitation
    const [invitation] = await db
        .insert(invitations)
        .values({
            email,
            token,
            roleId,
            invitedBy,
            status: 'pending',
            expiresAt,
            metadata: metadata || null,
        })
        .returning();

    console.log(`[Auth] ✅ Created invitation: ${email} as ${role[0].name} (expires: ${expiresAt.toISOString()})`);

    return invitation;
}

/**
 * Get invitation by token
 *
 * @param token - Invitation token (UUID)
 * @returns Invitation or null if not found
 */
export async function getInvitationByToken(token: string): Promise<Invitation | null>
{
    const db = getDatabase();

    if (!db)
    {
        throw new Error('[Auth] Database not initialized');
    }

    const result = await db
        .select()
        .from(invitations)
        .where(eq(invitations.token, token))
        .limit(1);

    return result[0] || null;
}

/**
 * Get invitation with role and inviter details
 *
 * @param token - Invitation token
 * @returns Invitation with joined data or null
 */
export async function getInvitationWithDetails(token: string): Promise<InvitationWithDetails | null>
{
    const db = getDatabase();

    if (!db)
    {
        throw new Error('[Auth] Database not initialized');
    }

    const result = await db
        .select({
            id: invitations.id,
            email: invitations.email,
            token: invitations.token,
            roleId: invitations.roleId,
            invitedBy: invitations.invitedBy,
            status: invitations.status,
            expiresAt: invitations.expiresAt,
            acceptedAt: invitations.acceptedAt,
            cancelledAt: invitations.cancelledAt,
            metadata: invitations.metadata,
            createdAt: invitations.createdAt,
            updatedAt: invitations.updatedAt,
            role: {
                id: roles.id,
                name: roles.name,
                displayName: roles.displayName,
            },
            inviter: {
                id: users.id,
                email: users.email,
            },
        })
        .from(invitations)
        .innerJoin(roles, eq(invitations.roleId, roles.id))
        .innerJoin(users, eq(invitations.invitedBy, users.id))
        .where(eq(invitations.token, token))
        .limit(1);

    return result[0] || null;
}

/**
 * Validate invitation
 *
 * Checks if invitation is valid for acceptance
 *
 * @param token - Invitation token
 * @returns Validation result
 */
export async function validateInvitation(token: string): Promise<{
    valid: boolean;
    invitation?: Invitation;
    error?: string;
}>
{
    const invitation = await getInvitationByToken(token);

    if (!invitation)
    {
        return { valid: false, error: 'Invitation not found' };
    }

    if (invitation.status === 'accepted')
    {
        return { valid: false, error: 'Invitation already accepted', invitation };
    }

    if (invitation.status === 'cancelled')
    {
        return { valid: false, error: 'Invitation was cancelled', invitation };
    }

    if (invitation.status === 'expired')
    {
        return { valid: false, error: 'Invitation has expired', invitation };
    }

    // Check if expired by time
    if (new Date() > new Date(invitation.expiresAt))
    {
        return { valid: false, error: 'Invitation has expired', invitation };
    }

    return { valid: true, invitation };
}

/**
 * Accept invitation and create user account
 *
 * @param params - Acceptance parameters
 * @returns Created user info
 * @throws Error if invitation is invalid or user creation fails
 *
 * @example
 * ```typescript
 * const user = await acceptInvitation({
 *   token: 'uuid-v4',
 *   password: 'SecurePass123!',
 *   publicKey: 'base64-der...',
 *   keyId: 'uuid-v4',
 *   fingerprint: 'sha256-hex',
 *   algorithm: 'ES256'
 * });
 * ```
 */
export async function acceptInvitation(params: {
    token: string;
    password: string;
    publicKey: string;
    keyId: string;
    fingerprint: string;
    algorithm: 'ES256' | 'RS256';
}): Promise<{
    userId: number;
    email: string;
    role: string;
}>
{
    const db = getDatabase();

    if (!db)
    {
        throw new Error('[Auth] Database not initialized');
    }

    const { token, password, publicKey, keyId, fingerprint, algorithm } = params;

    // Validate invitation
    const validation = await validateInvitation(token);

    if (!validation.valid || !validation.invitation)
    {
        throw new Error(validation.error || 'Invalid invitation');
    }

    const invitation = validation.invitation;

    // Get role details
    const role = await db
        .select()
        .from(roles)
        .where(eq(roles.id, invitation.roleId))
        .limit(1);

    if (role.length === 0)
    {
        throw new Error('Role not found');
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Use transaction to create user and update invitation atomically
    const result = await db.transaction(async (tx) =>
    {
        // Create user
        const [newUser] = await tx
            .insert(users)
            .values({
                email: invitation.email,
                passwordHash,
                roleId: invitation.roleId,
                emailVerifiedAt: new Date(), // Auto-verify invited users
                passwordChangeRequired: false,
                status: 'active',
            })
            .returning();

        // Create public key for asymmetric JWT
        const { userPublicKeys } = await import('@/server/entities');
        await tx
            .insert(userPublicKeys)
            .values({
                userId: newUser.id,
                keyId,
                publicKey,
                algorithm,
                fingerprint,
                isActive: true,
                expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
            });

        // Update invitation status
        await tx
            .update(invitations)
            .set({
                status: 'accepted',
                acceptedAt: new Date(),
                updatedAt: new Date(),
            })
            .where(eq(invitations.id, invitation.id));

        return { newUser, role: role[0] };
    });

    console.log(`[Auth] ✅ Invitation accepted: ${invitation.email} as ${result.role.name}`);

    return {
        userId: result.newUser.id,
        email: result.newUser.email!,
        role: result.role.name,
    };
}

/**
 * List invitations with filtering and pagination
 *
 * @param params - Query parameters
 * @returns Paginated invitations
 *
 * @example
 * ```typescript
 * const result = await listInvitations({
 *   status: 'pending',
 *   invitedBy: 1n,
 *   page: 1,
 *   limit: 20
 * });
 * ```
 */
export async function listInvitations(params: {
    status?: InvitationStatus;
    invitedBy?: number;
    page?: number;
    limit?: number;
}): Promise<{
    invitations: InvitationWithDetails[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}>
{
    const db = getDatabase();

    if (!db)
    {
        throw new Error('[Auth] Database not initialized');
    }

    const { status, invitedBy, page = 1, limit = 20 } = params;
    const offset = (page - 1) * limit;

    // Build where conditions
    const conditions = [];
    if (status)
    {
        conditions.push(eq(invitations.status, status));
    }
    if (invitedBy)
    {
        conditions.push(eq(invitations.invitedBy, invitedBy));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    const countResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(invitations)
        .where(whereClause);

    const total = Number(countResult[0]?.count || 0);

    // Get paginated results with joins
    const results = await db
        .select({
            id: invitations.id,
            email: invitations.email,
            token: invitations.token,
            roleId: invitations.roleId,
            invitedBy: invitations.invitedBy,
            status: invitations.status,
            expiresAt: invitations.expiresAt,
            acceptedAt: invitations.acceptedAt,
            cancelledAt: invitations.cancelledAt,
            metadata: invitations.metadata,
            createdAt: invitations.createdAt,
            updatedAt: invitations.updatedAt,
            role: {
                id: roles.id,
                name: roles.name,
                displayName: roles.displayName,
            },
            inviter: {
                id: users.id,
                email: users.email,
            },
        })
        .from(invitations)
        .innerJoin(roles, eq(invitations.roleId, roles.id))
        .innerJoin(users, eq(invitations.invitedBy, users.id))
        .where(whereClause)
        .orderBy(desc(invitations.createdAt))
        .limit(limit)
        .offset(offset);

    return {
        invitations: results,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
    };
}

/**
 * Cancel invitation
 *
 * Only pending invitations can be cancelled
 *
 * @param id - Invitation ID
 * @param cancelledBy - User ID who cancelled
 * @param reason - Optional cancellation reason
 * @throws Error if invitation cannot be cancelled
 */
export async function cancelInvitation(
    id: number,
    cancelledBy: number,
    reason?: string
): Promise<void>
{
    const db = getDatabase();

    if (!db)
    {
        throw new Error('[Auth] Database not initialized');
    }

    // Get invitation
    const invitation = await db
        .select()
        .from(invitations)
        .where(eq(invitations.id, id))
        .limit(1);

    if (invitation.length === 0)
    {
        throw new Error('Invitation not found');
    }

    if (invitation[0].status !== 'pending')
    {
        throw new Error(`Cannot cancel ${invitation[0].status} invitation`);
    }

    // Update status
    await db
        .update(invitations)
        .set({
            status: 'cancelled',
            cancelledAt: new Date(),
            updatedAt: new Date(),
            metadata: invitation[0].metadata
                ? { ...invitation[0].metadata, cancelReason: reason, cancelledBy }
                : { cancelReason: reason, cancelledBy },
        })
        .where(eq(invitations.id, id));

    console.log(`[Auth] ⚠️  Invitation cancelled: ${invitation[0].email} (reason: ${reason || 'none'})`);
}

/**
 * Delete invitation
 *
 * Permanently removes invitation record
 * Typically only for superadmin cleanup
 *
 * @param id - Invitation ID
 */
export async function deleteInvitation(id: number): Promise<void>
{
    const db = getDatabase();

    if (!db)
    {
        throw new Error('[Auth] Database not initialized');
    }

    await db
        .delete(invitations)
        .where(eq(invitations.id, id));

    console.log(`[Auth] 🗑️  Invitation deleted: ${id}`);
}

/**
 * Expire old invitations (cron job)
 *
 * Updates status of expired pending invitations
 *
 * @returns Number of invitations expired
 */
export async function expireOldInvitations(): Promise<number>
{
    const db = getDatabase();

    if (!db)
    {
        throw new Error('[Auth] Database not initialized');
    }

    const now = new Date();

    // Find expired pending invitations
    const expiredInvitations = await db
        .select()
        .from(invitations)
        .where(
            and(
                eq(invitations.status, 'pending'),
                lt(invitations.expiresAt, now)
            )
        );

    if (expiredInvitations.length === 0)
    {
        return 0;
    }

    // Update to expired status
    await db
        .update(invitations)
        .set({
            status: 'expired',
            updatedAt: now,
        })
        .where(
            and(
                eq(invitations.status, 'pending'),
                lt(invitations.expiresAt, now)
            )
        );

    console.log(`[Auth] ⏰ Expired ${expiredInvitations.length} old invitations`);

    return expiredInvitations.length;
}

/**
 * Resend invitation email
 *
 * Extends expiration and triggers email resend
 *
 * @param id - Invitation ID
 * @param expiresInDays - New expiration period (default: 7)
 * @returns Updated invitation
 * @throws Error if invitation cannot be resent
 */
export async function resendInvitation(
    id: number,
    expiresInDays: number = 7
): Promise<Invitation>
{
    const db = getDatabase();

    if (!db)
    {
        throw new Error('[Auth] Database not initialized');
    }

    // Get invitation
    const invitation = await db
        .select()
        .from(invitations)
        .where(eq(invitations.id, id))
        .limit(1);

    if (invitation.length === 0)
    {
        throw new Error('Invitation not found');
    }

    // Can only resend pending or expired invitations
    if (!['pending', 'expired'].includes(invitation[0].status))
    {
        throw new Error(`Cannot resend ${invitation[0].status} invitation`);
    }

    // Update expiration and status
    const newExpiresAt = calculateExpiresAt(expiresInDays);

    const [updated] = await db
        .update(invitations)
        .set({
            status: 'pending',
            expiresAt: newExpiresAt,
            updatedAt: new Date(),
        })
        .where(eq(invitations.id, id))
        .returning();

    console.log(`[Auth] 📧 Invitation resent: ${invitation[0].email} (new expiry: ${newExpiresAt.toISOString()})`);

    return updated;
}