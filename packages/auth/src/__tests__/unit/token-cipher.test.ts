/**
 * @spfn/auth - Social Token At-Rest Encryption Unit Tests
 *
 * AES-256-GCM round-trip, 레거시 평문 하위 호환, 변조 감지 검증.
 * ⚠️ 토큰/키 평문 값은 출력하지 않는다 — 길이·존재·일치 여부만 단언.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { encryptToken, decryptToken, isEncrypted } from '@/server/lib/oauth/token-cipher';

const TEST_SECRET = 'test-secret-with-at-least-32-characters-for-security-testing';
const SAMPLE = 'ya29.a0AfH6SMexample-access-token-value';

describe('Token Cipher - AES-256-GCM', () =>
{
    beforeEach(() =>
    {
        vi.stubEnv('SPFN_AUTH_SESSION_SECRET', TEST_SECRET);
    });

    it('암호화 결과는 enc:v1: 마커를 가지며 평문과 다르다', () =>
    {
        const encrypted = encryptToken(SAMPLE);

        expect(isEncrypted(encrypted)).toBe(true);
        expect(encrypted.startsWith('enc:v1:')).toBe(true);
        expect(encrypted).not.toBe(SAMPLE);
        expect(encrypted).not.toContain(SAMPLE);
    });

    it('round-trip 으로 원본 평문이 복원된다', () =>
    {
        expect(decryptToken(encryptToken(SAMPLE))).toBe(SAMPLE);
    });

    it('같은 평문도 매번 다른 암호문을 낸다 (random IV)', () =>
    {
        expect(encryptToken(SAMPLE)).not.toBe(encryptToken(SAMPLE));
    });

    it('마커 없는 레거시 평문은 그대로 반환된다 (하위 호환)', () =>
    {
        expect(isEncrypted(SAMPLE)).toBe(false);
        expect(decryptToken(SAMPLE)).toBe(SAMPLE);
    });

    it('암호문 변조 시 복호화가 실패한다', () =>
    {
        const encrypted = encryptToken(SAMPLE);
        const tampered = encrypted.slice(0, -4) + 'AAAA';

        expect(() => decryptToken(tampered)).toThrow();
    });

    it('마커는 있으나 본문이 짧으면(손상) 복호화가 실패한다', () =>
    {
        expect(() => decryptToken('enc:v1:QUFB')).toThrow();
    });

    it('이미 암호화된 값을 다시 암호화해도 이중 암호화되지 않는다', () =>
    {
        const once = encryptToken(SAMPLE);

        expect(encryptToken(once)).toBe(once);
        expect(decryptToken(encryptToken(once))).toBe(SAMPLE);
    });

    it('다른 secret 으로는 복호화되지 않는다', () =>
    {
        const encrypted = encryptToken(SAMPLE);

        vi.stubEnv('SPFN_AUTH_SESSION_SECRET', 'different-secret-with-at-least-32-characters-here!!');
        expect(() => decryptToken(encrypted)).toThrow();
    });
});
