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
const KAKAO_ISS = 'https://kauth.kakao.com';

// 카카오는 앱 하나가 키를 여러 벌 쓴다 — 네이티브 앱 키(앱 SDK)와 REST API 키(웹).
const KAKAO_NATIVE_KEY = 'kakao-native-app-key';
const KAKAO_REST_KEY = 'kakao-rest-api-key';

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
    vi.stubEnv('SPFN_AUTH_KAKAO_NATIVE_CLIENT_IDS', KAKAO_NATIVE_KEY);
    vi.stubEnv('SPFN_AUTH_KAKAO_CLIENT_ID', KAKAO_REST_KEY);
});

afterEach(() =>
{
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
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

/**
 * 카카오 user-info(/v2/user/me) 응답을 흉내낸다.
 *
 * `id`는 카카오 회원번호로, id_token의 sub와 같은 값이어야 정상 경로다.
 */
function mockKakaoUserInfo(body: Record<string, unknown>): void
{
    vi.stubGlobal('fetch', vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => body,
    })));
}

function kakaoAccount(email: string | null, valid: boolean, verified: boolean): Record<string, unknown>
{
    return {
        email,
        is_email_valid: valid,
        is_email_verified: verified,
        profile: { nickname: '카카오사용자', profile_image_url: 'https://kakao/pic' },
    };
}

describe('Native id_token - Kakao', () =>
{
    it('verifies a valid id_token and normalizes the identity', async () =>
    {
        const kakao = getOAuthProvider('kakao')!;

        const token = await signToken(
            { email: 'user@example.com', nickname: '카카오사용자', picture: 'https://kakao/pic', nonce: 'raw-nonce' },
            { iss: KAKAO_ISS, aud: KAKAO_NATIVE_KEY, sub: '1234567890' },
        );

        const identity = await kakao.verifyNativeIdToken!(token, { nonce: 'raw-nonce' });

        expect(identity.providerUserId).toBe('1234567890');
        expect(identity.email).toBe('user@example.com');
        expect(identity.name).toBe('카카오사용자');
        expect(identity.avatar).toBe('https://kakao/pic');
    });

    it('leaves email unverified without an access token (id_token carries no email_verified)', async () =>
    {
        const kakao = getOAuthProvider('kakao')!;

        const token = await signToken(
            { email: 'user@example.com', nonce: 'n' },
            { iss: KAKAO_ISS, aud: KAKAO_NATIVE_KEY, sub: 'k-1' },
        );

        const identity = await kakao.verifyNativeIdToken!(token, { nonce: 'n' });

        expect(identity.email).toBe('user@example.com');
        expect(identity.emailVerified).toBe(false);
    });

    it('accepts the web REST API key as audience (web and app share one sub)', async () =>
    {
        const kakao = getOAuthProvider('kakao')!;

        const token = await signToken(
            { nonce: 'n' },
            { iss: KAKAO_ISS, aud: KAKAO_REST_KEY, sub: 'k-1' },
        );

        const identity = await kakao.verifyNativeIdToken!(token, { nonce: 'n' });

        expect(identity.providerUserId).toBe('k-1');
    });

    it('rejects a mismatched nonce (kakao sends the raw nonce, unhashed)', async () =>
    {
        const kakao = getOAuthProvider('kakao')!;

        const token = await signToken(
            { nonce: 'real-nonce' },
            { iss: KAKAO_ISS, aud: KAKAO_NATIVE_KEY, sub: 'k-1' },
        );

        await expect(kakao.verifyNativeIdToken!(token, { nonce: 'attacker-nonce' }))
            .rejects.toThrow(/nonce/i);
    });

    it('rejects an expired token', async () =>
    {
        const kakao = getOAuthProvider('kakao')!;

        const token = await signToken(
            { nonce: 'n' },
            { iss: KAKAO_ISS, aud: KAKAO_NATIVE_KEY, sub: 'k-1', expSeconds: 1 },
        );

        await expect(kakao.verifyNativeIdToken!(token, { nonce: 'n' })).rejects.toThrow();
    });

    it('rejects a token from the wrong issuer', async () =>
    {
        const kakao = getOAuthProvider('kakao')!;

        const token = await signToken(
            { nonce: 'n' },
            { iss: 'https://evil.example.com', aud: KAKAO_NATIVE_KEY, sub: 'k-1' },
        );

        await expect(kakao.verifyNativeIdToken!(token, { nonce: 'n' })).rejects.toThrow();
    });

    it('rejects a token whose audience is not an allowed app key', async () =>
    {
        const kakao = getOAuthProvider('kakao')!;

        const token = await signToken(
            { nonce: 'n' },
            { iss: KAKAO_ISS, aud: 'someone-elses-app-key', sub: 'k-1' },
        );

        await expect(kakao.verifyNativeIdToken!(token, { nonce: 'n' })).rejects.toThrow();
    });

    it('rejects a token without a sub claim', async () =>
    {
        const kakao = getOAuthProvider('kakao')!;

        const token = await new SignJWT({ nonce: 'n' })
            .setProtectedHeader({ alg: 'RS256' })
            .setIssuer(KAKAO_ISS)
            .setAudience(KAKAO_NATIVE_KEY)
            .setIssuedAt()
            .setExpirationTime('1h')
            .sign(privateKey);

        await expect(kakao.verifyNativeIdToken!(token, { nonce: 'n' })).rejects.toThrow(/sub/i);
    });

    it('signs in with only the native app key configured (web flow stays disabled)', async () =>
    {
        // 모바일 전용 서비스: 웹 REST API 키가 없어도 네이티브 로그인은 되어야 한다.
        vi.stubEnv('SPFN_AUTH_KAKAO_CLIENT_ID', '');
        const kakao = getOAuthProvider('kakao')!;

        const token = await signToken(
            { nonce: 'n' },
            { iss: KAKAO_ISS, aud: KAKAO_NATIVE_KEY, sub: 'k-1' },
        );

        const identity = await kakao.verifyNativeIdToken!(token, { nonce: 'n' });

        expect(identity.providerUserId).toBe('k-1');
        // 웹 흐름 판정은 REST API 키에 그대로 묶여 있다.
        expect(kakao.isEnabled()).toBe(false);
    });

    it('throws when no kakao app key is configured', async () =>
    {
        vi.stubEnv('SPFN_AUTH_KAKAO_NATIVE_CLIENT_IDS', '');
        vi.stubEnv('SPFN_AUTH_KAKAO_CLIENT_ID', '');
        const kakao = getOAuthProvider('kakao')!;

        await expect(kakao.verifyNativeIdToken!('any.token.here', { nonce: 'n' }))
            .rejects.toThrow(/not configured/i);
    });

    describe('email verification via access token', () =>
    {
        async function signKakaoToken(sub: string): Promise<string>
        {
            return signToken(
                { email: 'from-token@example.com', nonce: 'n' },
                { iss: KAKAO_ISS, aud: KAKAO_NATIVE_KEY, sub },
            );
        }

        it('verifies the email when user-info confirms it and the subject matches', async () =>
        {
            const kakao = getOAuthProvider('kakao')!;
            mockKakaoUserInfo({ id: 'k-1', kakao_account: kakaoAccount('user@example.com', true, true) });

            const identity = await kakao.verifyNativeIdToken!(await signKakaoToken('k-1'), {
                nonce: 'n',
                accessToken: 'kakao-access-token',
            });

            expect(identity.email).toBe('user@example.com');
            expect(identity.emailVerified).toBe(true);
        });

        it('keeps id_token profile values that user-info does not return', async () =>
        {
            const kakao = getOAuthProvider('kakao')!;
            const token = await signToken(
                { email: 'from-token@example.com', nickname: '토큰닉네임', picture: 'https://token/pic', nonce: 'n' },
                { iss: KAKAO_ISS, aud: KAKAO_NATIVE_KEY, sub: 'k-1' },
            );

            // 이메일만 동의하고 프로필은 동의하지 않은 응답.
            mockKakaoUserInfo({ id: 'k-1', kakao_account: { email: 'user@example.com', is_email_valid: true, is_email_verified: true } });

            const identity = await kakao.verifyNativeIdToken!(token, {
                nonce: 'n',
                accessToken: 'kakao-access-token',
            });

            expect(identity.emailVerified).toBe(true);
            expect(identity.name).toBe('토큰닉네임');
            expect(identity.avatar).toBe('https://token/pic');
        });

        it('keeps the id_token email when user-info returns none', async () =>
        {
            const kakao = getOAuthProvider('kakao')!;

            // 프로필만 동의하고 이메일은 동의하지 않은 응답 — access token의 동의 범위가 id_token보다 좁다.
            mockKakaoUserInfo({
                id: 'k-1',
                kakao_account: { profile: { nickname: '카카오사용자', profile_image_url: 'https://kakao/pic' } },
            });

            const identity = await kakao.verifyNativeIdToken!(await signKakaoToken('k-1'), {
                nonce: 'n',
                accessToken: 'kakao-access-token',
            });

            expect(identity.email).toBe('from-token@example.com');
            expect(identity.emailVerified).toBe(false);
        });

        it('keeps the email unverified when kakao reports it as not verified', async () =>
        {
            const kakao = getOAuthProvider('kakao')!;
            mockKakaoUserInfo({ id: 'k-1', kakao_account: kakaoAccount('user@example.com', true, false) });

            const identity = await kakao.verifyNativeIdToken!(await signKakaoToken('k-1'), {
                nonce: 'n',
                accessToken: 'kakao-access-token',
            });

            // user-info가 이메일을 주면 id_token 이메일로 대체하지 않는다.
            expect(identity.email).toBe('user@example.com');
            expect(identity.emailVerified).toBe(false);
        });

        it('ignores an access token that belongs to another user', async () =>
        {
            const kakao = getOAuthProvider('kakao')!;

            // 공격자가 자신의 access token을 남의 id_token과 함께 보낸 상황.
            mockKakaoUserInfo({ id: 'attacker-999', kakao_account: kakaoAccount('victim@example.com', true, true) });

            const identity = await kakao.verifyNativeIdToken!(await signKakaoToken('k-1'), {
                nonce: 'n',
                accessToken: 'attacker-access-token',
            });

            expect(identity.providerUserId).toBe('k-1');
            expect(identity.email).toBe('from-token@example.com');
            expect(identity.emailVerified).toBe(false);
        });

        it('continues the sign-in when the user-info lookup fails', async () =>
        {
            const kakao = getOAuthProvider('kakao')!;
            vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })));

            const identity = await kakao.verifyNativeIdToken!(await signKakaoToken('k-1'), {
                nonce: 'n',
                accessToken: 'kakao-access-token',
            });

            expect(identity.providerUserId).toBe('k-1');
            expect(identity.emailVerified).toBe(false);
        });
    });
});

describe('Native id_token - provider registry', () =>
{
    it('auto-registers google, apple and kakao providers on module load', () =>
    {
        expect(getOAuthProvider('google')?.verifyNativeIdToken).toBeTypeOf('function');
        expect(getOAuthProvider('apple')?.verifyNativeIdToken).toBeTypeOf('function');
        expect(getOAuthProvider('kakao')?.verifyNativeIdToken).toBeTypeOf('function');
    });
});
