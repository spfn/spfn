/**
 * @spfn/auth - Key Service Unit Tests
 *
 * keyId는 모든 사용자에 걸쳐 UNIQUE다. 등록 전 조회가 활성 키만 보면 폐기된 행을 놓치고,
 * insert가 unique index에 걸려 로그인 트랜잭션이 통째로 500으로 굴러떨어진다.
 * 여기서 고정하는 것은 그 충돌이 도메인 에러로 드러난다는 것과, 한 기기의 반복 로그인
 * (같은 사용자 · 같은 활성 키)이 여전히 no-op 성공이라는 것이다.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { keysRepository } = vi.hoisted(() => ({
    keysRepository: {
        findByKeyId: vi.fn(),
        findActiveByKeyId: vi.fn(),
        create: vi.fn(async () => undefined),
        revokeByKeyIdAndUserId: vi.fn(async () => null),
    },
}));

vi.mock('../../server/repositories', () => ({ keysRepository }));

// fingerprint 검증은 이 테스트의 관심사가 아니다 — 충돌 판정만 본다.
vi.mock('../../server/helpers/jwt', () => ({ verifyKeyFingerprint: () => true }));

import { registerPublicKeyService } from '../../server/services/key.service';
import { KeyIdAlreadyRegisteredError } from '@spfn/auth/errors';

const OWNER_ID = 1;
const OTHER_ID = 2;
const KEY_ID = 'key-abc';

function params(userId = OWNER_ID)
{
    return {
        userId,
        keyId: KEY_ID,
        publicKey: 'base64-der-public-key',
        fingerprint: 'a'.repeat(64),
        algorithm: 'ES256' as const,
    };
}

function keyRow(overrides: Record<string, unknown> = {})
{
    return {
        id: 10,
        userId: OWNER_ID,
        keyId: KEY_ID,
        publicKey: 'base64-der-public-key',
        algorithm: 'ES256',
        fingerprint: 'a'.repeat(64),
        isActive: true,
        createdAt: new Date(),
        lastUsedAt: null,
        expiresAt: null,
        revokedAt: null,
        revokedReason: null,
        ...overrides,
    };
}

describe('registerPublicKeyService - keyId collisions', () =>
{
    beforeEach(() =>
    {
        vi.clearAllMocks();
        keysRepository.create.mockResolvedValue(undefined as never);
    });

    it('registers the key when the keyId is unused', async () =>
    {
        keysRepository.findByKeyId.mockResolvedValue(null);

        await registerPublicKeyService(params());

        expect(keysRepository.create).toHaveBeenCalledTimes(1);
    });

    it('is a no-op success when the same user re-registers their own active key', async () =>
    {
        // 한 기기에서 반복 로그인하는 정상 경로. 네이티브·웹 양쪽이 여기에 기댄다.
        keysRepository.findByKeyId.mockResolvedValue(keyRow());

        await expect(registerPublicKeyService(params())).resolves.toBeUndefined();

        expect(keysRepository.create).not.toHaveBeenCalled();
    });

    it('refuses reuse of the same user\'s revoked keyId instead of failing on the unique index', async () =>
    {
        keysRepository.findByKeyId.mockResolvedValue(keyRow({
            isActive: false,
            revokedAt: new Date(),
            revokedReason: 'Replaced by new key on login',
        }));

        await expect(registerPublicKeyService(params())).rejects.toBeInstanceOf(KeyIdAlreadyRegisteredError);

        // 폐기는 되돌리지 않는다 — 재활성화도, insert도 없다.
        expect(keysRepository.create).not.toHaveBeenCalled();
    });

    it('refuses another user\'s active keyId with the same error (no existence oracle)', async () =>
    {
        keysRepository.findByKeyId.mockResolvedValue(keyRow());

        const revoked = registerPublicKeyService(params(OTHER_ID));

        await expect(revoked).rejects.toBeInstanceOf(KeyIdAlreadyRegisteredError);
        expect(keysRepository.create).not.toHaveBeenCalled();
    });

    it('answers identically for a revoked own key and another user\'s active key', async () =>
    {
        keysRepository.findByKeyId.mockResolvedValue(keyRow({ isActive: false, revokedAt: new Date() }));
        const ownRevoked = await registerPublicKeyService(params()).catch((e: Error) => e);

        keysRepository.findByKeyId.mockResolvedValue(keyRow());
        const otherActive = await registerPublicKeyService(params(OTHER_ID)).catch((e: Error) => e);

        expect((ownRevoked as Error).name).toBe((otherActive as Error).name);
        expect((ownRevoked as Error).message).toBe((otherActive as Error).message);
    });

    it('looks the keyId up without an isActive filter', async () =>
    {
        keysRepository.findByKeyId.mockResolvedValue(null);

        await registerPublicKeyService(params());

        // 활성 필터가 걸린 조회로 되돌아가면 폐기 행을 다시 놓친다.
        expect(keysRepository.findByKeyId).toHaveBeenCalledWith(KEY_ID);
        expect(keysRepository.findActiveByKeyId).not.toHaveBeenCalled();
    });
});
