/**
 * account-deletion.service.ts — status transitions, re-auth gate, immediate-deletion
 * gate, anonymize placeholder email, and error/status-code consistency (issue #9).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
    usersRepository,
    keysRepository,
    socialAccountsRepository,
    userProfilesRepository,
    verificationCodesRepository,
    accountDeletionRequestsRepository,
    verifyPassword,
    validateVerificationToken,
    sendEmail,
    runInTransaction,
} = vi.hoisted(() => ({
    usersRepository: {
        findById: vi.fn(),
        findByEmailOrPhone: vi.fn(),
        updateById: vi.fn(async () => undefined),
        deleteById: vi.fn(async () => undefined),
    },
    keysRepository: {
        revokeAllActiveByUserId: vi.fn(async () => []),
        deleteAllByUserId: vi.fn(async () => 0),
    },
    socialAccountsRepository: {
        deleteAllByUserId: vi.fn(async () => 0),
    },
    userProfilesRepository: {
        updateByUserId: vi.fn(async () => undefined),
    },
    verificationCodesRepository: {
        deleteByTarget: vi.fn(async () => 0),
    },
    accountDeletionRequestsRepository: {
        create: vi.fn(),
        findPendingByUserId: vi.fn(),
        findDueForPurge: vi.fn(async () => []),
        markCancelled: vi.fn(async () => undefined),
        markCompleted: vi.fn(async () => undefined),
    },
    verifyPassword: vi.fn(async () => true),
    validateVerificationToken: vi.fn(),
    sendEmail: vi.fn(async () => ({ success: true })),
    runInTransaction: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));

vi.mock('../../server/repositories', () => ({
    usersRepository,
    keysRepository,
    socialAccountsRepository,
    userProfilesRepository,
    verificationCodesRepository,
    accountDeletionRequestsRepository,
}));

vi.mock('../../server/helpers', () => ({ verifyPassword }));
vi.mock('../../server/services/verification.service', () => ({ validateVerificationToken }));
vi.mock('@spfn/notification/server', () => ({ sendEmail }));
vi.mock('@spfn/core/db', async (importOriginal) =>
{
    const actual = await importOriginal<typeof import('@spfn/core/db')>();

    return { ...actual, runInTransaction };
});

import {
    requestAccountDeletionService,
    cancelAccountDeletionService,
    purgeUserService,
    sweepDuePurges,
} from '../../server/services/account-deletion.service';
import { configureDeletion } from '../../server/lib/deletion-config';
// Imported the same way account-deletion.service.ts imports them (package
// specifier, not the relative source path) — otherwise this resolves a second,
// distinct module instance and `instanceof` fails even for the "same" class.
import {
    AccountPendingDeletionError,
    AccountDisabledError,
    DeletionAlreadyRequestedError,
    DeletionNotRequestedError,
    ImmediateDeletionNotAllowedError,
    InvalidCredentialsError,
} from '@spfn/auth/errors';

function makeUser(overrides: Record<string, unknown> = {})
{
    return {
        id: 7,
        publicId: '11111111-1111-1111-1111-111111111111',
        email: 'user@example.com',
        phone: null,
        username: 'someone',
        passwordHash: '$2b$12$hash',
        status: 'active',
        ...overrides,
    };
}

describe('account-deletion.service', () =>
{
    beforeEach(() =>
    {
        vi.clearAllMocks();
        configureDeletion(); // reset to defaults between tests
        accountDeletionRequestsRepository.create.mockImplementation(async (data: any) => ({ id: 99, ...data }));
    });

    describe('requestAccountDeletionService — self, password re-auth', () =>
    {
        it('transitions status, records the request, and revokes sessions', async () =>
        {
            const user = makeUser();
            usersRepository.findById.mockResolvedValue(user);

            const result = await requestAccountDeletionService(user.id, {
                requestedBy: 'self',
                password: 'correct-password',
            });

            expect(verifyPassword).toHaveBeenCalledWith('correct-password', user.passwordHash);
            expect(usersRepository.updateById).toHaveBeenCalledWith(user.id, { status: 'pending_deletion' });
            expect(accountDeletionRequestsRepository.create).toHaveBeenCalledWith(
                expect.objectContaining({ userId: user.id, userPublicId: user.publicId, status: 'pending' }),
            );
            expect(keysRepository.revokeAllActiveByUserId).toHaveBeenCalledWith(user.id, expect.any(String));
            expect(result.requestId).toBe(99);

            // Default grace period is 30 days.
            const diffDays = (result.purgeScheduledAt.getTime() - Date.now()) / 86_400_000;
            expect(diffDays).toBeGreaterThan(29);
            expect(diffDays).toBeLessThan(31);
        });

        it('rejects an incorrect password without transitioning status', async () =>
        {
            const user = makeUser();
            usersRepository.findById.mockResolvedValue(user);
            verifyPassword.mockResolvedValueOnce(false);

            await expect(
                requestAccountDeletionService(user.id, { requestedBy: 'self', password: 'wrong' }),
            ).rejects.toBeInstanceOf(InvalidCredentialsError);

            expect(usersRepository.updateById).not.toHaveBeenCalled();
        });
    });

    describe('requestAccountDeletionService — self, verification-code re-auth (passwordless)', () =>
    {
        it('accepts a valid account_deletion-purpose token matching the user target', async () =>
        {
            const user = makeUser({ passwordHash: null });
            usersRepository.findById.mockResolvedValue(user);
            validateVerificationToken.mockReturnValue({
                target: user.email,
                targetType: 'email',
                purpose: 'account_deletion',
                codeId: 1,
            });

            await requestAccountDeletionService(user.id, {
                requestedBy: 'self',
                verificationToken: 'tok',
            });

            expect(usersRepository.updateById).toHaveBeenCalledWith(user.id, { status: 'pending_deletion' });
        });

        it('rejects a token issued for a different purpose', async () =>
        {
            const user = makeUser({ passwordHash: null });
            usersRepository.findById.mockResolvedValue(user);
            validateVerificationToken.mockReturnValue({
                target: user.email,
                targetType: 'email',
                purpose: 'password_reset',
                codeId: 1,
            });

            await expect(
                requestAccountDeletionService(user.id, { requestedBy: 'self', verificationToken: 'tok' }),
            ).rejects.toThrow(/account_deletion/);
        });

        it('requires a password or verification token', async () =>
        {
            const user = makeUser({ passwordHash: null });
            usersRepository.findById.mockResolvedValue(user);

            await expect(
                requestAccountDeletionService(user.id, { requestedBy: 'self' }),
            ).rejects.toThrow(/verification code is required/i);
        });
    });

    describe('requestAccountDeletionService — duplicate request / admin / immediate gate', () =>
    {
        it('rejects a second request while one is already pending_deletion', async () =>
        {
            const user = makeUser({ status: 'pending_deletion' });
            usersRepository.findById.mockResolvedValue(user);

            await expect(
                requestAccountDeletionService(user.id, { requestedBy: 'self', password: 'x' }),
            ).rejects.toBeInstanceOf(DeletionAlreadyRequestedError);
        });

        it('rejects a request for an already-deleted account', async () =>
        {
            const user = makeUser({ status: 'deleted' });
            usersRepository.findById.mockResolvedValue(user);

            await expect(
                requestAccountDeletionService(user.id, { requestedBy: 'admin' }),
            ).rejects.toBeInstanceOf(DeletionAlreadyRequestedError);
        });

        it('admin requests skip the self re-auth gate', async () =>
        {
            const user = makeUser();
            usersRepository.findById.mockResolvedValue(user);

            await requestAccountDeletionService(user.id, { requestedBy: 'admin' });

            expect(verifyPassword).not.toHaveBeenCalled();
            expect(usersRepository.updateById).toHaveBeenCalledWith(user.id, { status: 'pending_deletion' });
        });

        it('rejects self-service immediate deletion unless allowSelfImmediate is enabled', async () =>
        {
            const user = makeUser();
            usersRepository.findById.mockResolvedValue(user);

            await expect(
                requestAccountDeletionService(user.id, { requestedBy: 'self', password: 'x', immediate: true }),
            ).rejects.toBeInstanceOf(ImmediateDeletionNotAllowedError);
        });

        it('allows self-service immediate deletion once allowSelfImmediate is enabled, and purges inline', async () =>
        {
            configureDeletion({ allowSelfImmediate: true });
            const user = makeUser();
            usersRepository.findById.mockResolvedValueOnce(user).mockResolvedValueOnce(user);
            accountDeletionRequestsRepository.findPendingByUserId.mockResolvedValue(null);

            const result = await requestAccountDeletionService(user.id, {
                requestedBy: 'self',
                password: 'x',
                immediate: true,
            });

            // grace period 0 -> purgeScheduledAt ~= now, and the inline purge ran.
            expect(Math.abs(result.purgeScheduledAt.getTime() - Date.now())).toBeLessThan(5000);
            expect(accountDeletionRequestsRepository.markCompleted).toHaveBeenCalled();
        });
    });

    describe('cancelAccountDeletionService', () =>
    {
        it('recovers a pending_deletion account back to active', async () =>
        {
            const user = makeUser({ status: 'pending_deletion' });
            usersRepository.findByEmailOrPhone.mockResolvedValue(user);
            accountDeletionRequestsRepository.findPendingByUserId.mockResolvedValue({ id: 5 });

            await cancelAccountDeletionService({ email: user.email, password: 'correct-password' });

            expect(usersRepository.updateById).toHaveBeenCalledWith(user.id, { status: 'active' });
            expect(accountDeletionRequestsRepository.markCancelled).toHaveBeenCalledWith(5);
        });

        it('rejects when the account has no pending deletion request', async () =>
        {
            const user = makeUser({ status: 'active' });
            usersRepository.findByEmailOrPhone.mockResolvedValue(user);

            await expect(
                cancelAccountDeletionService({ email: user.email, password: 'x' }),
            ).rejects.toBeInstanceOf(DeletionNotRequestedError);
        });

        it('does not distinguish a missing account from a bad credential', async () =>
        {
            usersRepository.findByEmailOrPhone.mockResolvedValue(null);

            await expect(
                cancelAccountDeletionService({ email: 'nope@example.com', password: 'x' }),
            ).rejects.toBeInstanceOf(InvalidCredentialsError);
        });
    });

    describe('purge — anonymize placeholder + status transitions', () =>
    {
        it('anonymizes the user with a deleted-invalid placeholder address and scrubs child rows', async () =>
        {
            const user = makeUser();
            accountDeletionRequestsRepository.findPendingByUserId.mockResolvedValue({
                id: 5,
                userId: user.id,
                userPublicId: user.publicId,
            });
            usersRepository.findById.mockResolvedValue(user);

            const result = await purgeUserService(user.id);

            expect(result.outcome).toBe('purged');
            expect(usersRepository.updateById).toHaveBeenCalledWith(
                user.id,
                expect.objectContaining({
                    email: `deleted-${user.publicId}@deleted.invalid`,
                    phone: null,
                    username: null,
                    passwordHash: null,
                    status: 'deleted',
                }),
            );
            expect(socialAccountsRepository.deleteAllByUserId).toHaveBeenCalledWith(user.id);
            expect(keysRepository.deleteAllByUserId).toHaveBeenCalledWith(user.id);
            expect(verificationCodesRepository.deleteByTarget).toHaveBeenCalledWith(user.email);
            expect(accountDeletionRequestsRepository.markCompleted).toHaveBeenCalledWith(5, 'anonymize');
        });

        it('hard-deletes the row instead when purgeStrategy is hard-delete', async () =>
        {
            configureDeletion({ purgeStrategy: 'hard-delete' });
            const user = makeUser();
            accountDeletionRequestsRepository.findPendingByUserId.mockResolvedValue({ id: 5, userId: user.id });
            usersRepository.findById.mockResolvedValue(user);

            await purgeUserService(user.id);

            expect(usersRepository.deleteById).toHaveBeenCalledWith(user.id);
            expect(accountDeletionRequestsRepository.markCompleted).toHaveBeenCalledWith(5, 'hard-delete');
        });

        it('throws when there is no pending request to purge', async () =>
        {
            accountDeletionRequestsRepository.findPendingByUserId.mockResolvedValue(null);

            await expect(purgeUserService(123)).rejects.toBeInstanceOf(DeletionNotRequestedError);
        });

        it('skips (does not complete) a user whose onBeforePurge hook throws, and the sweep continues', async () =>
        {
            const failing = makeUser({ id: 1 });
            const ok = makeUser({ id: 2, publicId: '22222222-2222-2222-2222-222222222222' });

            configureDeletion({
                onBeforePurge: async (u) =>
                {
                    if (u.id === 1)
                    {
                        throw new Error('app data cleanup failed');
                    }
                },
            });

            accountDeletionRequestsRepository.findDueForPurge.mockResolvedValue([
                { id: 10, userId: 1, userPublicId: failing.publicId },
                { id: 11, userId: 2, userPublicId: ok.publicId },
            ]);
            usersRepository.findById.mockImplementation(async (id: number) => (id === 1 ? failing : ok));

            const result = await sweepDuePurges();

            expect(result).toEqual({ processed: 2, purged: 1, skipped: 1 });
            expect(accountDeletionRequestsRepository.markCompleted).toHaveBeenCalledTimes(1);
            expect(accountDeletionRequestsRepository.markCompleted).toHaveBeenCalledWith(11, 'anonymize');
        });
    });

    describe('error/status-code consistency', () =>
    {
        it('AccountPendingDeletionError matches AccountDisabledError\'s status code (403)', async () =>
        {
            const disabled = new AccountDisabledError({ status: 'suspended' });
            const pending = new AccountPendingDeletionError({ purgeScheduledAt: new Date().toISOString() });

            expect(pending.statusCode).toBe(disabled.statusCode);
            expect(pending.statusCode).toBe(403);
            expect(pending.details).toMatchObject({ status: 'pending_deletion' });
        });
    });
});
