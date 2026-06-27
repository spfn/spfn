/**
 * changePasswordService — revoke all sessions on password change (#4)
 *
 * A password change must revoke every active key for the user, so existing
 * sessions are logged out (backend authenticate verifies active keys only).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { usersRepository, keysRepository, verifyPassword, hashPassword } = vi.hoisted(() => ({
    usersRepository: {
        findById: vi.fn(),
        updatePassword: vi.fn(async () => undefined),
    },
    keysRepository: {
        revokeAllActiveByUserId: vi.fn(async () => []),
    },
    verifyPassword: vi.fn(async () => true),
    hashPassword: vi.fn(async () => 'new-hash'),
}));

vi.mock('../../server/repositories', () => ({ usersRepository, keysRepository }));
vi.mock('../../server/helpers', () => ({ hashPassword, verifyPassword }));

import { changePasswordService } from '../../server/services/auth.service';

describe('changePasswordService — session revocation', () =>
{
    beforeEach(() => vi.clearAllMocks());

    it('revokes all active keys after a successful password change', async () =>
    {
        await changePasswordService({
            userId: 7,
            currentPassword: 'old-password',
            newPassword: 'new-password',
            passwordHash: 'old-hash',
        });

        expect(usersRepository.updatePassword).toHaveBeenCalledWith(7, 'new-hash', true);
        expect(keysRepository.revokeAllActiveByUserId).toHaveBeenCalledTimes(1);
        expect(keysRepository.revokeAllActiveByUserId).toHaveBeenCalledWith(7, expect.any(String));
    });
});
