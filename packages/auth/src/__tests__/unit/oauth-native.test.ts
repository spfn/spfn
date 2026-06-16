/**
 * @spfn/auth - Native Social Login (id_token verification) Unit Tests
 *
 * 실제 ES256 키페어로 id_token을 서명하고, jose의 원격 JWKS 조회만 mock하여
 * 로컬 공개키로 검증한다. 따라서 서명·issuer·audience·만료·nonce는 실제로 검사된다.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { generateKeyPair, SignJWT, createRemoteJWKSet } from 'jose';

// 원격 JWKS 조회만 교체. jwtVerify/SignJWT 등은 실제 구현을 쓴다.
vi.mock('jose', async (importOriginal) =>
{
    const actual = await importOriginal<typeof import('jose')>();

    return { ...actual, createRemoteJWKSet: vi.fn() };
});

import { getOAuthProvider } from '../../server/lib/oauth';

const GOOGLE_ISS = 'https://accounts.google.com';
const APPLE_ISS = 'https://appleid.apple.com';

let privateKey: CryptoKey;
let publicKey: CryptoKey;

beforeEach(async () =>
{
    // Google/Apple id_token은 RS256으로 서명된다.
    const kp = await generateKeyPair('RS256');
    privateKey = kp.privateKey;
    publicKey = kp.publicKey;

    // 캐시된 resolver도 항상 현재 테스트의 공개키를 반환하도록 클로저로 참조한다.
    vi.mocked(createRemoteJWKSet).mockReturnValue((async () => publicKey) as never);

    vi.stubEnv('SPFN_AUTH_GOOGLE_NATIVE_CLIENT_IDS', 'ios.example.com,android.example.com');
    vi.stubEnv('SPFN_AUTH_APPLE_CLIENT_IDS', 'com.example.app');
});

afterEach(() =>
{
    vi.unstubAllEnvs();
});

interface TokenOptions
{
    iss: string;
    aud: string;
    sub: string;
    expSeconds?: number;
}

async function signToken(claims: Record<string, unknown>, opts: TokenOptions): Promise<string>
{
    const jwt = new SignJWT(claims)
        .setProtectedHeader({ alg: 'RS256' })
        .setIssuer(opts.iss)
        .setAudience(opts.aud)
        .setSubject(opts.sub)
        .setIssuedAt();

    if (opts.expSeconds !== undefined)
    {
        jwt.setExpirationTime(opts.expSeconds);
    }
    else
    {
        jwt.setExpirationTime('1h');
    }

    return jwt.sign(privateKey);
}

describe('Native id_token - Google', () =>
{
    it('verifies a valid id_token and normalizes the identity', async () =>
    {
        const google = getOAuthProvider('google')!;

        const token = await signToken(
            { email: 'user@example.com', email_verified: true, name: 'User', picture: 'https://pic', nonce: 'raw-nonce' },
            { iss: GOOGLE_ISS, aud: 'ios.example.com', sub: 'google-123' },
        );

        const identity = await google.verifyNativeIdToken!(token, { nonce: 'raw-nonce' });

        expect(identity.providerUserId).toBe('google-123');
        expect(identity.email).toBe('user@example.com');
        expect(identity.emailVerified).toBe(true);
        expect(identity.name).toBe('User');
        expect(identity.avatar).toBe('https://pic');
    });

    it('rejects a mismatched nonce', async () =>
    {
        const google = getOAuthProvider('google')!;

        const token = await signToken(
            { nonce: 'real-nonce' },
            { iss: GOOGLE_ISS, aud: 'ios.example.com', sub: 'g' },
        );

        await expect(google.verifyNativeIdToken!(token, { nonce: 'attacker-nonce' }))
            .rejects.toThrow(/nonce/i);
    });

    it('rejects a token whose audience is not an allowed client id', async () =>
    {
        const google = getOAuthProvider('google')!;

        const token = await signToken(
            { nonce: 'n' },
            { iss: GOOGLE_ISS, aud: 'attacker.example.com', sub: 'g' },
        );

        await expect(google.verifyNativeIdToken!(token, { nonce: 'n' })).rejects.toThrow();
    });

    it('rejects an expired token', async () =>
    {
        const google = getOAuthProvider('google')!;

        const token = await signToken(
            { nonce: 'n' },
            { iss: GOOGLE_ISS, aud: 'ios.example.com', sub: 'g', expSeconds: Math.floor(Date.now() / 1000) - 60 },
        );

        await expect(google.verifyNativeIdToken!(token, { nonce: 'n' })).rejects.toThrow();
    });

    it('also accepts the web client id (SPFN_AUTH_GOOGLE_CLIENT_ID) as audience', async () =>
    {
        vi.stubEnv('SPFN_AUTH_GOOGLE_CLIENT_ID', 'web.example.com');
        const google = getOAuthProvider('google')!;

        const token = await signToken(
            { nonce: 'n' },
            { iss: GOOGLE_ISS, aud: 'web.example.com', sub: 'g' },
        );

        const identity = await google.verifyNativeIdToken!(token, { nonce: 'n' });
        expect(identity.providerUserId).toBe('g');
    });

    it('throws when native client ids are not configured', async () =>
    {
        vi.stubEnv('SPFN_AUTH_GOOGLE_NATIVE_CLIENT_IDS', '');
        vi.stubEnv('SPFN_AUTH_GOOGLE_CLIENT_ID', '');
        const google = getOAuthProvider('google')!;

        const token = await signToken({ nonce: 'n' }, { iss: GOOGLE_ISS, aud: 'ios.example.com', sub: 'g' });

        await expect(google.verifyNativeIdToken!(token, { nonce: 'n' })).rejects.toThrow(/not configured/i);
    });

    it('rejects a token missing the sub claim', async () =>
    {
        const google = getOAuthProvider('google')!;

        // setSubject 없이 서명 → sub claim 부재
        const token = await new SignJWT({ nonce: 'n' })
            .setProtectedHeader({ alg: 'RS256' })
            .setIssuer(GOOGLE_ISS)
            .setAudience('ios.example.com')
            .setIssuedAt()
            .setExpirationTime('1h')
            .sign(privateKey);

        await expect(google.verifyNativeIdToken!(token, { nonce: 'n' })).rejects.toThrow(/sub/i);
    });

    it('rejects a token signed with a non-whitelisted algorithm (ES256)', async () =>
    {
        const google = getOAuthProvider('google')!;

        const es = await generateKeyPair('ES256');
        // mock JWKS resolver가 이 ES256 공개키를 돌려주도록 교체
        vi.mocked(createRemoteJWKSet).mockReturnValue((async () => es.publicKey) as never);

        const token = await new SignJWT({ nonce: 'n' })
            .setProtectedHeader({ alg: 'ES256' })
            .setIssuer(GOOGLE_ISS)
            .setAudience('ios.example.com')
            .setSubject('g')
            .setIssuedAt()
            .setExpirationTime('1h')
            .sign(es.privateKey);

        // verifyIdToken은 algorithms: ['RS256']만 허용하므로 ES256은 거부돼야 한다.
        await expect(google.verifyNativeIdToken!(token, { nonce: 'n' })).rejects.toThrow();
    });
});

describe('Native id_token - Apple', () =>
{
    it('verifies a token with SHA-256 hashed nonce and string email_verified', async () =>
    {
        const apple = getOAuthProvider('apple')!;
        const rawNonce = 'raw-apple-nonce';
        const hashedNonce = createHash('sha256').update(rawNonce).digest('hex');

        const token = await signToken(
            { email: 'abc@privaterelay.appleid.com', email_verified: 'true', is_private_email: 'true', nonce: hashedNonce },
            { iss: APPLE_ISS, aud: 'com.example.app', sub: 'apple-xyz' },
        );

        const identity = await apple.verifyNativeIdToken!(token, { nonce: rawNonce });

        expect(identity.providerUserId).toBe('apple-xyz');
        expect(identity.email).toBe('abc@privaterelay.appleid.com');
        // string "true" → boolean true 정규화
        expect(identity.emailVerified).toBe(true);
    });

    it('rejects when the nonce was not SHA-256 hashed', async () =>
    {
        const apple = getOAuthProvider('apple')!;
        const rawNonce = 'raw-nonce';

        // 토큰에 raw nonce를 담았지만 apple provider는 sha256(rawNonce)를 기대한다.
        const token = await signToken(
            { email_verified: 'true', nonce: rawNonce },
            { iss: APPLE_ISS, aud: 'com.example.app', sub: 'a' },
        );

        await expect(apple.verifyNativeIdToken!(token, { nonce: rawNonce })).rejects.toThrow(/nonce/i);
    });

    it('rejects a token from the wrong issuer', async () =>
    {
        const apple = getOAuthProvider('apple')!;
        const rawNonce = 'n';
        const hashedNonce = createHash('sha256').update(rawNonce).digest('hex');

        const token = await signToken(
            { nonce: hashedNonce },
            { iss: 'https://evil.example.com', aud: 'com.example.app', sub: 'a' },
        );

        await expect(apple.verifyNativeIdToken!(token, { nonce: rawNonce })).rejects.toThrow();
    });

    it('throws when apple client ids are not configured', async () =>
    {
        vi.stubEnv('SPFN_AUTH_APPLE_CLIENT_IDS', '');
        const apple = getOAuthProvider('apple')!;

        await expect(apple.verifyNativeIdToken!('any.token.here', { nonce: 'n' }))
            .rejects.toThrow(/not configured/i);
    });

    it('rejects web oauth methods (native-only provider)', () =>
    {
        const apple = getOAuthProvider('apple')!;
        expect(() => apple.getAuthUrl('state')).toThrow(/native/i);
    });
});

describe('Native id_token - provider registry', () =>
{
    it('auto-registers both google and apple providers on module load', () =>
    {
        expect(getOAuthProvider('google')?.verifyNativeIdToken).toBeTypeOf('function');
        expect(getOAuthProvider('apple')?.verifyNativeIdToken).toBeTypeOf('function');
    });
});
