/**
 * oauth.service.ts — assertActiveForOAuthSession (issue #9 OAuth gap fix)
 *
 * createOrLinkUser() never checked account status before a session (public key)
 * was registered — a suspended/inactive/pending_deletion user could still log in
 * via OAuth. Worse, the far more common "already-linked social account" branch in
 * oauthCallbackService/oauth-native's persistNativeLogin doesn't even call
 * createOrLinkUser, so patching only that function wouldn't have closed the gap.
 * The fix adds one check — assertActiveForOAuthSession — at the single point both
 * branches of both flows converge (right before registerPublicKeyService).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { usersRepository, getPendingDeletionInfo } = vi.hoisted(() => ({
    usersRepository: { findById: vi.fn() },
    getPendingDeletionInfo: vi.fn(),
}));

vi.mock('../../server/repositories', () => ({ usersRepository }));
vi.mock('../../server/services/account-deletion.service', () => ({ getPendingDeletionInfo }));

import { assertActiveForOAuthSession } from '../../server/services/oauth.service';
// Imported via the package specifier (matching how oauth.service.ts imports them) —
// a relative-path import would resolve a second module instance and `instanceof`
// would fail even for the "same" class.
import { AccountDisabledError, AccountPendingDeletionError } from '@spfn/auth/errors';

describe('assertActiveForOAuthSession', () =>
{
    beforeEach(() => vi.clearAllMocks());

    it('allows an active user through', async () =>
    {
        usersRepository.findById.mockResolvedValue({ id: 1, status: 'active' });

        await expect(assertActiveForOAuthSession(1)).resolves.toBeUndefined();
    });

    it('blocks a suspended user with AccountDisabledError', async () =>
    {
        usersRepository.findById.mockResolvedValue({ id: 2, status: 'suspended' });

        await expect(assertActiveForOAuthSession(2)).rejects.toBeInstanceOf(AccountDisabledError);
    });

    it('blocks a pending_deletion user with AccountPendingDeletionError, carrying purgeScheduledAt', async () =>
    {
        usersRepository.findById.mockResolvedValue({ id: 3, status: 'pending_deletion' });
        const purgeScheduledAt = new Date('2030-01-01T00:00:00.000Z');
        getPendingDeletionInfo.mockResolvedValue({ purgeScheduledAt });

        const error = await assertActiveForOAuthSession(3).catch((e) => e);

        expect(error).toBeInstanceOf(AccountPendingDeletionError);
        expect(error.details).toMatchObject({
            status: 'pending_deletion',
            purgeScheduledAt: purgeScheduledAt.toISOString(),
        });
    });

    it('throws for a userId that no longer resolves to a user', async () =>
    {
        usersRepository.findById.mockResolvedValue(null);

        await expect(assertActiveForOAuthSession(999)).rejects.toThrow(/user not found/i);
    });
});
