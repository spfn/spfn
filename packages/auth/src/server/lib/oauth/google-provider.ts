/**
 * Google OAuthProvider 구현
 *
 * 기존 google.ts의 함수를 OAuthProvider 인터페이스로 래핑한다.
 * google.ts 자체는 그대로 유지(테스트·google 전용 route가 직접 의존).
 *
 * 이 모듈을 import 하는 것만으로 google provider가 registry에 자기 등록된다.
 */

import {
    isGoogleOAuthEnabled,
    getGoogleAuthUrl,
    exchangeCodeForTokens,
    getGoogleUserInfo,
    refreshAccessToken,
} from './google';
import {
    registerOAuthProvider,
    type OAuthProvider,
    type OAuthTokens,
    type NormalizedIdentity,
} from './provider';

export const googleProvider: OAuthProvider =
{
    id: 'google',

    isEnabled: isGoogleOAuthEnabled,

    getAuthUrl: getGoogleAuthUrl,

    async exchangeCodeForTokens(code: string): Promise<OAuthTokens>
    {
        const tokens = await exchangeCodeForTokens(code);

        return {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresIn: tokens.expires_in,
        };
    },

    async getUserInfo(accessToken: string): Promise<NormalizedIdentity>
    {
        const user = await getGoogleUserInfo(accessToken);

        return {
            providerUserId: user.id,
            email: user.email ?? null,
            emailVerified: user.verified_email,
            name: user.name,
            avatar: user.picture,
        };
    },

    async refreshTokens(refreshToken: string): Promise<OAuthTokens>
    {
        const tokens = await refreshAccessToken(refreshToken);

        return {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            expiresIn: tokens.expires_in,
        };
    },
};

// dogfood: 패키지 로드 시점에 자기 등록.
//
// ⚠️ 이 등록은 side-effect import(`lib/oauth/index.ts`의 `import './google-provider'`)에
// 의존한다. package.json에 `"sideEffects": false`를 추가하면 이 호출이 tree-shake되어
// Google 로그인이 조용히 깨질 수 있다. 등록 보장은 oauth.test.ts의 회귀 테스트로 고정되어 있다.
registerOAuthProvider(googleProvider);
