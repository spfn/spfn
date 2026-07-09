/**
 * @spfn/auth - Account Deletion Service
 *
 * Request / cancel (recovery) / purge for the account deletion lifecycle.
 *
 * Lifecycle:
 *   active --request(reauth)--> pending_deletion --grace expires(cron)--> deleted (anonymize) | row removed (hard-delete)
 *     ^                              |
 *     +-------cancel(reauth)---------+          immediate = grace period of 0, same pipeline
 */

import { ValidationError, NotFoundError } from '@spfn/core/errors';
import { runInTransaction } from '@spfn/core/db';
import { sendEmail } from '@spfn/notification/server';

import {
    InvalidCredentialsError,
    InvalidVerificationTokenError,
    VerificationTokenPurposeMismatchError,
    VerificationTokenTargetMismatchError,
    DeletionAlreadyRequestedError,
    DeletionNotRequestedError,
    ImmediateDeletionNotAllowedError,
} from '@spfn/auth/errors';

import {
    usersRepository,
    keysRepository,
    socialAccountsRepository,
    userProfilesRepository,
    verificationCodesRepository,
    accountDeletionRequestsRepository,
} from '../repositories';
import type { User } from '../entities/users';
import type { AccountDeletionRequest } from '../entities/account-deletion-requests';
import type { AccountDeletionRequestedBy, PurgeStrategy } from '../types';
import { verifyPassword } from '../helpers';
import { validateVerificationToken } from './verification.service';
import { getDeletionConfig } from '../lib/deletion-config';
import { authLogger } from '../logger';
import {
    authDeletionRequestedEvent,
    authDeletionCancelledEvent,
    authDeletionCompletedEvent,
} from '../events';

// ============================================================================
// Shared lookup (login / OAuth / authenticate gates)
// ============================================================================

export interface PendingDeletionInfo
{
    purgeScheduledAt: Date;
}

/**
 * Look up the pending deletion request's `purgeScheduledAt` for a `pending_deletion`
 * user, so login/OAuth/authenticate can surface it on `AccountPendingDeletionError`.
 * Returns null if there is no pending row (shouldn't normally happen for a user in
 * that status, but the caller falls back to an error without the date).
 */
export async function getPendingDeletionInfo(userId: number): Promise<PendingDeletionInfo | null>
{
    const request = await accountDeletionRequestsRepository.findPendingByUserId(userId);

    return request ? { purgeScheduledAt: request.purgeScheduledAt } : null;
}

// ============================================================================
// Re-authentication gate
// ============================================================================

interface ReauthParams
{
    password?: string;
    verificationToken?: string;
}

/**
 * Step-up re-auth for a destructive action: password holders confirm with their
 * password, OAuth-only/passwordless users confirm with a fresh verification code
 * (purpose 'account_deletion'). Shared by request (self-service) and cancel.
 */
async function verifyReauthCredential(user: User, params: ReauthParams): Promise<void>
{
    if (user.passwordHash)
    {
        if (!params.password)
        {
            throw new ValidationError({ message: 'Password is required to confirm this action' });
        }

        const valid = await verifyPassword(params.password, user.passwordHash);
        if (!valid)
        {
            throw new InvalidCredentialsError({ message: 'Incorrect password' });
        }

        return;
    }

    if (!params.verificationToken)
    {
        throw new ValidationError({ message: 'A verification code is required to confirm this action' });
    }

    const payload = validateVerificationToken(params.verificationToken);
    if (!payload)
    {
        throw new InvalidVerificationTokenError();
    }

    if (payload.purpose !== 'account_deletion')
    {
        throw new VerificationTokenPurposeMismatchError({ expected: 'account_deletion', actual: payload.purpose });
    }

    const target = user.email ?? user.phone;
    if (!target || payload.target !== target)
    {
        throw new VerificationTokenTargetMismatchError();
    }
}

// ============================================================================
// Notifications (best-effort — never blocks the lifecycle transition)
// ============================================================================

async function sendDeletionEmail(
    to: string,
    subject: string,
    text: string,
): Promise<void>
{
    const result = await sendEmail({ to, subject, text });

    if (!result.success)
    {
        authLogger.email.error('Failed to send account deletion email', { to, subject, error: result.error });
    }
}

async function notifyDeletionRequested(user: User, purgeScheduledAt: Date): Promise<void>
{
    if (!getDeletionConfig().sendNotifications || !user.email)
    {
        return;
    }

    await sendDeletionEmail(
        user.email,
        'Account deletion requested',
        `We received a request to delete your account. It is scheduled for permanent deletion on `
        + `${purgeScheduledAt.toISOString()}. If this wasn't you, sign in before that date to cancel it.`,
    );
}

async function notifyDeletionCancelled(user: User): Promise<void>
{
    if (!getDeletionConfig().sendNotifications || !user.email)
    {
        return;
    }

    await sendDeletionEmail(
        user.email,
        'Account deletion cancelled',
        'Your account deletion request was cancelled and your account is active again.',
    );
}

async function notifyPurgeFinal(email: string): Promise<void>
{
    if (!getDeletionConfig().sendNotifications)
    {
        return;
    }

    await sendDeletionEmail(
        email,
        'Your account has been deleted',
        'Your account and associated data have now been permanently deleted, as requested.',
    );
}

// ============================================================================
// Request
// ============================================================================

export interface RequestAccountDeletionParams
{
    /** Who initiated this — 'self' requires re-auth via password/verificationToken; 'admin' does not. */
    requestedBy: AccountDeletionRequestedBy;
    password?: string;
    verificationToken?: string;
    reason?: string;
    /** Skip the grace period and purge inline. Self-service requires `deletion.allowSelfImmediate`. */
    immediate?: boolean;
}

export interface RequestAccountDeletionResult
{
    requestId: number;
    purgeScheduledAt: Date;
}

function addDays(date: Date, days: number): Date
{
    const result = new Date(date);
    result.setDate(result.getDate() + days);

    return result;
}

/**
 * Request account deletion (self-service re-auth gate, or trusted admin/DSR call).
 *
 * Sets status -> 'pending_deletion', records the request, revokes every active
 * session key, and emits `auth.deletion.requested`. With a zero grace period
 * (explicit `immediate: true`, gated for self-service by `allowSelfImmediate`),
 * purges inline instead of waiting for the cron sweep.
 */
export async function requestAccountDeletionService(
    userId: number,
    params: RequestAccountDeletionParams,
): Promise<RequestAccountDeletionResult>
{
    const { requestedBy, password, verificationToken, reason, immediate } = params;

    const user = await usersRepository.findById(userId);
    if (!user)
    {
        throw new NotFoundError({ message: 'User not found', resource: 'User' });
    }

    if (user.status === 'pending_deletion' || user.status === 'deleted')
    {
        throw new DeletionAlreadyRequestedError();
    }

    if (requestedBy === 'self')
    {
        await verifyReauthCredential(user, { password, verificationToken });
    }

    const config = getDeletionConfig();
    const wantsImmediate = immediate === true;

    if (wantsImmediate && requestedBy === 'self' && !config.allowSelfImmediate)
    {
        throw new ImmediateDeletionNotAllowedError();
    }

    const gracePeriodDays = wantsImmediate ? 0 : config.gracePeriodDays;
    const requestedAt = new Date();
    const purgeScheduledAt = addDays(requestedAt, gracePeriodDays);

    await usersRepository.updateById(user.id, { status: 'pending_deletion' });

    const request = await accountDeletionRequestsRepository.create({
        userId: user.id,
        userPublicId: user.publicId,
        requestedAt,
        purgeScheduledAt,
        status: 'pending',
        requestedBy,
        reason: reason ?? null,
    });

    await keysRepository.revokeAllActiveByUserId(user.id, 'Account deletion requested');

    await authDeletionRequestedEvent.emit({
        userId: String(user.id),
        userPublicId: user.publicId,
        purgeScheduledAt: purgeScheduledAt.toISOString(),
        requestedBy,
    });

    await notifyDeletionRequested(user, purgeScheduledAt);

    if (gracePeriodDays === 0)
    {
        await purgePendingRequest(request);
    }

    return { requestId: request.id, purgeScheduledAt };
}

// ============================================================================
// Cancel (recovery)
// ============================================================================

export interface CancelAccountDeletionParams
{
    email?: string;
    phone?: string;
    password?: string;
    verificationToken?: string;
}

export interface CancelAccountDeletionResult
{
    userId: string;
}

/**
 * Cancel a pending deletion (recovery). All sessions were revoked at request
 * time, so this is credential-based (no Bearer token) rather than auth-context-based.
 */
export async function cancelAccountDeletionService(
    params: CancelAccountDeletionParams,
): Promise<CancelAccountDeletionResult>
{
    const { email, phone, password, verificationToken } = params;

    if (!email && !phone)
    {
        throw new ValidationError({ message: 'Either email or phone must be provided' });
    }

    const user = await usersRepository.findByEmailOrPhone(email, phone);
    if (!user)
    {
        throw new InvalidCredentialsError();
    }

    if (user.status !== 'pending_deletion')
    {
        throw new DeletionNotRequestedError();
    }

    await verifyReauthCredential(user, { password, verificationToken });

    await usersRepository.updateById(user.id, { status: 'active' });

    const pendingRequest = await accountDeletionRequestsRepository.findPendingByUserId(user.id);
    if (pendingRequest)
    {
        await accountDeletionRequestsRepository.markCancelled(pendingRequest.id);
    }

    await authDeletionCancelledEvent.emit({
        userId: String(user.id),
        userPublicId: user.publicId,
    });

    await notifyDeletionCancelled(user);

    return { userId: String(user.id) };
}

// ============================================================================
// Purge
// ============================================================================

export interface PurgeUserResult
{
    outcome: 'purged' | 'skipped' | 'not-found';
}

/**
 * Anonymize a user in place: scrub PII, drop child rows that would otherwise
 * block re-registration (social accounts, public keys), keep the row for referential
 * integrity/audit. `status` -> 'deleted', `deletedAt`/`deletedBy` set (softDelete()).
 */
async function anonymizeUser(user: User): Promise<void>
{
    await usersRepository.updateById(user.id, {
        email: `deleted-${user.publicId}@deleted.invalid`,
        phone: null,
        username: null,
        passwordHash: null,
        status: 'deleted',
        deletedAt: new Date(),
        deletedBy: 'system:auth.deletion.purge',
    });

    await socialAccountsRepository.deleteAllByUserId(user.id);
    await keysRepository.deleteAllByUserId(user.id);
    await userProfilesRepository.updateByUserId(user.id, {
        displayName: null,
        firstName: null,
        lastName: null,
        avatarUrl: null,
        bio: null,
        dateOfBirth: null,
        gender: null,
        website: null,
        location: null,
        company: null,
        jobTitle: null,
        metadata: null,
    });
}

/**
 * Purge a single user for a given (already fetched) request row. Shared by the
 * immediate inline path, the standalone admin/DSR entry point, and the cron sweep.
 */
async function purgePendingRequest(request: AccountDeletionRequest): Promise<PurgeUserResult>
{
    if (request.userId === null)
    {
        // Already orphaned (e.g. user row removed through another path) — close out
        // the audit row so it stops showing up in the due-for-purge sweep.
        await accountDeletionRequestsRepository.markCompleted(request.id, 'hard-delete');

        return { outcome: 'not-found' };
    }

    const user = await usersRepository.findById(request.userId);
    if (!user)
    {
        await accountDeletionRequestsRepository.markCompleted(request.id, 'hard-delete');

        return { outcome: 'not-found' };
    }

    const config = getDeletionConfig();

    if (config.onBeforePurge)
    {
        try
        {
            await config.onBeforePurge({
                id: user.id,
                publicId: user.publicId,
                email: user.email,
                phone: user.phone,
            });
        }
        catch (error)
        {
            authLogger.service.warn('[account-deletion] onBeforePurge threw — skipping this sweep, will retry', {
                userId: user.id,
                error: error instanceof Error ? error.message : String(error),
            });

            return { outcome: 'skipped' };
        }
    }

    // Send the final notice before the address is wiped (anonymize) — best effort,
    // does not block the purge itself.
    if (user.email)
    {
        await notifyPurgeFinal(user.email);
    }

    const originalEmail = user.email;
    const originalPhone = user.phone;
    const purgeStrategy: PurgeStrategy = config.purgeStrategy;

    await runInTransaction(async () =>
    {
        if (purgeStrategy === 'hard-delete')
        {
            await usersRepository.deleteById(user.id);
        }
        else
        {
            await anonymizeUser(user);
        }

        // verificationCodes has no userId FK (target-keyed) — clean up regardless
        // of strategy so leftover codes don't linger for a reused email/phone.
        if (originalEmail)
        {
            await verificationCodesRepository.deleteByTarget(originalEmail);
        }
        if (originalPhone)
        {
            await verificationCodesRepository.deleteByTarget(originalPhone);
        }

        await accountDeletionRequestsRepository.markCompleted(request.id, purgeStrategy);
    });

    await authDeletionCompletedEvent.emit({
        userPublicId: user.publicId,
        purgeStrategy,
    });

    return { outcome: 'purged' };
}

/**
 * Purge a user's pending deletion request immediately, ignoring `purgeScheduledAt`.
 * Admin/GDPR-response entry point — the route (if any) belongs to the app.
 *
 * @throws DeletionNotRequestedError if the user has no pending request
 */
export async function purgeUserService(userId: number): Promise<PurgeUserResult>
{
    const request = await accountDeletionRequestsRepository.findPendingByUserId(userId);
    if (!request)
    {
        throw new DeletionNotRequestedError();
    }

    return purgePendingRequest(request);
}

export interface SweepDuePurgesResult
{
    processed: number;
    purged: number;
    skipped: number;
}

/**
 * Sweep every request whose grace period has elapsed and purge it. Called by the
 * `auth.deletion.purge` cron job. One user's failure (thrown error, not just an
 * `onBeforePurge` skip) is logged and does not stop the rest of the sweep — it
 * stays `pending` and is retried on the next tick.
 */
export async function sweepDuePurges(now: Date = new Date()): Promise<SweepDuePurgesResult>
{
    const dueRequests = await accountDeletionRequestsRepository.findDueForPurge(now);

    let purged = 0;
    let skipped = 0;

    for (const request of dueRequests)
    {
        try
        {
            const result = await purgePendingRequest(request);
            if (result.outcome === 'purged')
            {
                purged++;
            }
            else
            {
                skipped++;
            }
        }
        catch (error)
        {
            skipped++;
            authLogger.service.error('[account-deletion] purge failed, will retry next sweep', {
                requestId: request.id,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    return { processed: dueRequests.length, purged, skipped };
}
