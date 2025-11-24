/**
 * @spfn/auth - Invitation Service
 *
 * User invitation management for invite-only registration
 */

import crypto from 'crypto';
import { Invitation } from "../entities/invitations";
import {
    invitationsRepository,
    usersRepository,
    rolesRepository,
    keysRepository,
} from '../repositories';
import type { InvitationStatus, KeyAlgorithmType } from '../types';
import { hashPassword } from '../helpers';

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
    const { email, roleId, invitedBy, expiresInDays = 7, metadata } = params;

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email))
    {
        throw new Error('Invalid email format');
    }

    // Check if user already exists
    const existingUser = await usersRepository.findByEmail(email);

    if (existingUser)
    {
        throw new Error('User with this email already exists');
    }

    // Check if there's already a pending invitation for this email
    const existingInvitation = await invitationsRepository.findPendingByEmail(email);

    if (existingInvitation)
    {
        throw new Error('Pending invitation already exists for this email');
    }

    // Verify role exists
    const role = await rolesRepository.findById(roleId);

    if (!role)
    {
        throw new Error(`Role with id ${roleId} not found`);
    }

    // Verify inviter exists
    const inviter = await usersRepository.findById(invitedBy);

    if (!inviter)
    {
        throw new Error(`User with id ${invitedBy} not found`);
    }

    // Generate unique token
    const token = generateInvitationToken();
    const expiresAt = calculateExpiresAt(expiresInDays);

    // Create invitation
    const invitation = await invitationsRepository.create({
        email,
        token,
        roleId,
        invitedBy,
        status: 'pending',
        expiresAt,
        metadata: metadata || null,
    });

    console.log(`[Auth] ✅ Created invitation: ${email} as ${role.name} (expires: ${expiresAt.toISOString()})`);

    return invitation;
}

/**
 * Get invitation by token
 *
 * @param token - Invitation token (UUID)
 * @returns Invitation or null if not found
 */
export async function getInvitationByToken(token: string)
{
    return await invitationsRepository.findByToken(token);
}

/**
 * Get invitation with role and inviter details
 *
 * @param token - Invitation token
 * @returns Invitation with joined data or null
 */
export async function getInvitationWithDetails(token: string)
{
    return await invitationsRepository.findByTokenWithDetails(token);
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
    algorithm: KeyAlgorithmType;
}) {
    const { token, password, publicKey, keyId, fingerprint, algorithm } = params;

    // Validate invitation
    const validation = await validateInvitation(token);

    if (!validation.valid || !validation.invitation)
    {
        throw new Error(validation.error || 'Invalid invitation');
    }

    const invitation = validation.invitation;

    // Get role details
    const role = await rolesRepository.findById(invitation.roleId);

    if (!role)
    {
        throw new Error('Role not found');
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user
    const newUser = await usersRepository.create({
        email: invitation.email,
        passwordHash,
        roleId: invitation.roleId,
        emailVerifiedAt: new Date(), // Auto-verify invited users
        passwordChangeRequired: false,
        status: 'active',
    });

    // Create public key for asymmetric JWT
    await keysRepository.create({
        userId: newUser.id,
        keyId,
        publicKey,
        algorithm,
        fingerprint,
        isActive: true,
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
    });

    // Update invitation status
    await invitationsRepository.updateStatus(
        invitation.id,
        'accepted',
        new Date()
    );

    console.log(`[Auth] ✅ Invitation accepted: ${invitation.email} as ${role.name}`);

    return {
        userId: newUser.id,
        email: newUser.email!,
        role: role.name,
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
}) {
    return await invitationsRepository.list(params);
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
) {
    // Get invitation
    const invitation = await invitationsRepository.findById(id);

    if (!invitation)
    {
        throw new Error('Invitation not found');
    }

    if (invitation.status !== 'pending')
    {
        throw new Error(`Cannot cancel ${invitation.status} invitation`);
    }

    // Cancel invitation with metadata
    await invitationsRepository.cancel(id, cancelledBy, reason, invitation.metadata);

    console.log(`[Auth] ⚠️  Invitation cancelled: ${invitation.email} (reason: ${reason || 'none'})`);
}

/**
 * Delete invitation
 *
 * Permanently removes invitation record
 * Typically only for superadmin cleanup
 *
 * @param id - Invitation ID
 */
export async function deleteInvitation(id: number)
{
    await invitationsRepository.deleteById(id);

    console.log(`[Auth] 🗑️  Invitation deleted: ${id}`);
}

/**
 * Expire old invitations (cron job)
 *
 * Updates status of expired pending invitations
 *
 * @returns Number of invitations expired
 */
export async function expireOldInvitations()
{
    const count = await invitationsRepository.updateExpiredInvitations();

    if (count > 0)
    {
        console.log(`[Auth] ⏰ Expired ${count} old invitations`);
    }

    return count;
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
) {
    // Get invitation
    const invitation = await invitationsRepository.findById(id);

    if (!invitation)
    {
        throw new Error('Invitation not found');
    }

    // Can only resend pending or expired invitations
    if (!['pending', 'expired'].includes(invitation.status))
    {
        throw new Error(`Cannot resend ${invitation.status} invitation`);
    }

    // Update expiration and status
    const newExpiresAt = calculateExpiresAt(expiresInDays);

    const updated = await invitationsRepository.resend(id, newExpiresAt);

    if (!updated)
    {
        throw new Error('Failed to update invitation');
    }

    console.log(`[Auth] 📧 Invitation resent: ${invitation.email} (new expiry: ${newExpiresAt.toISOString()})`);

    return updated;
}