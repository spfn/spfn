/**
 * @spfn/auth - Invitation Routes
 *
 * Thin route handlers for user invitation management
 */

import { createApp } from '@spfn/core/route';
import {
    getInvitationContract,
    acceptInvitationContract,
    createInvitationContract,
    listInvitationsContract,
    cancelInvitationContract,
    resendInvitationContract,
    deleteInvitationContract,
} from '@/lib/contracts';
import { authenticate } from '@/server/middleware';
import { getAuth } from '@/server/helpers';
import {
    getInvitationWithDetails,
    validateInvitation,
    acceptInvitation,
    createInvitation,
    listInvitations,
    cancelInvitation,
    resendInvitation,
    deleteInvitation,
} from '@/server/services';

const app = createApp();

// ==========================================
// Public Routes (No Authentication Required)
// ==========================================

/**
 * GET /_auth/invitations/:token
 * Get invitation details for acceptance page
 */
app.bind(getInvitationContract, async (c) =>
{
    const params = await c.data();
    const token = params.token as string;

    const validation = await validateInvitation(token);

    if (!validation.valid || !validation.invitation)
    {
        throw new Error(validation.error || 'Invalid invitation');
    }

    // Get full details with role and inviter info
    const invitation = await getInvitationWithDetails(token);

    if (!invitation)
    {
        throw new Error('Invitation not found');
    }

    return c.success({
        email: invitation.email,
        role: invitation.role.name,
        roleDisplayName: invitation.role.displayName,
        invitedBy: invitation.inviter.email || 'Unknown',
        expiresAt: invitation.expiresAt.toISOString(),
        metadata: invitation.metadata || undefined,
    });
});

/**
 * POST /_auth/invitations/accept
 * Accept invitation and create user account
 */
app.bind(acceptInvitationContract, async (c) =>
{
    const body = await c.data();

    const result = await acceptInvitation({
        token: body.token,
        password: body.password,
        publicKey: body.publicKey,
        keyId: body.keyId,
        fingerprint: body.fingerprint,
        algorithm: body.algorithm,
    });

    return c.success(result);
});

// ==========================================
// Protected Routes (Admin Only)
// ==========================================

/**
 * POST /_auth/invitations
 * Create new invitation (requires admin)
 */
app.bind(createInvitationContract, [authenticate], async (c) =>
{
    const body = await c.data();
    const { userId } = getAuth(c);

    const invitation = await createInvitation({
        email: body.email,
        roleId: body.roleId,
        invitedBy: Number(userId),
        expiresInDays: body.expiresInDays,
        metadata: body.metadata,
    });

    // Build invitation URL (use environment variable or default)
    const baseUrl = process.env.SPFN_API_URL || 'http://localhost:8790';
    const invitationUrl = `${baseUrl}/auth/invite/${invitation.token}`;

    return c.success({
        id: invitation.id,
        email: invitation.email,
        token: invitation.token,
        roleId: invitation.roleId,
        expiresAt: invitation.expiresAt.toISOString(),
        invitationUrl,
    });
});

/**
 * GET /_auth/invitations
 * List invitations with filtering (requires admin)
 */
app.bind(listInvitationsContract, [authenticate], async (c) =>
{
    const query = await c.data();

    const result = await listInvitations({
        status: query.status as any,
        page: query.page ? Number(query.page) : undefined,
        limit: query.limit ? Number(query.limit) : undefined,
    });

    // Format dates to ISO strings
    const formattedInvitations = result.invitations.map(inv => ({
        ...inv,
        createdAt: inv.createdAt.toISOString(),
        expiresAt: inv.expiresAt.toISOString(),
        acceptedAt: inv.acceptedAt ? inv.acceptedAt.toISOString() : undefined,
        cancelledAt: inv.cancelledAt ? inv.cancelledAt.toISOString() : undefined,
    }));

    return c.success({
        ...result,
        invitations: formattedInvitations,
    });
});

/**
 * POST /_auth/invitations/cancel
 * Cancel invitation (requires admin or invitation owner)
 */
app.bind(cancelInvitationContract, [authenticate], async (c) =>
{
    const data = await c.data();
    const { userId } = getAuth(c);

    await cancelInvitation(
        data.id,
        Number(userId),
        data.reason
    );

    return c.success({
        success: true,
        cancelledAt: new Date().toISOString(),
    });
});

/**
 * POST /_auth/invitations/resend
 * Resend invitation email (requires admin)
 */
app.bind(resendInvitationContract, [authenticate], async (c) =>
{
    const data = await c.data();

    const updated = await resendInvitation(
        data.id,
        data.expiresInDays
    );

    return c.success({
        success: true,
        expiresAt: updated.expiresAt.toISOString(),
    });
});

/**
 * POST /_auth/invitations/delete
 * Delete invitation (requires superadmin)
 */
app.bind(deleteInvitationContract, [authenticate], async (c) =>
{
    const data = await c.data();

    await deleteInvitation(data.id);

    return c.success({
        success: true,
    });
});

export default app;