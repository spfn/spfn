/**
 * OAuth Provider 추상화
 *
 * Provider별로 하드코딩된 분기를 제거하기 위한 공통 인터페이스와 registry.
 * - 내장 provider(google)는 패키지 로드 시점에 자기 등록(dogfood)
 * - 외부 패키지(@superself/auth 등)는 registerOAuthProvider()로 런타임 등록
 *
 * @spfn/auth는 토큰 issuer가 아니라 소비(client) 측이므로,
 * 이 추상화는 "authorize URL 생성 → code 교환 → 사용자 정보 정규화"까지만 다룬다.
 */

import { type SocialProvider } from '../../types';

/**
 * Provider 사용자 정보를 공통 형태로 정규화한 신원
 *
 * provider별 응답 형태(snake_case 등)를 service에 노출하지 않기 위한 경계.
 */
export interface NormalizedIdentity
{
    providerUserId: string;
    email: string | null;
    emailVerified: boolean;
    name?: string;
    avatar?: string;
}

/**
 * 정규화된 OAuth 토큰 응답
 *
 * @property expiresIn - access token 만료까지 남은 초(seconds)
 */
export interface OAuthTokens
{
    accessToken: string;
    refreshToken?: string;
    expiresIn: number;
}

/**
 * OAuth provider 구현 인터페이스
 *
 * google, superself 등 모든 provider가 이 형태를 만족해야 registry에 등록된다.
 */
export interface OAuthProvider
{
    id: SocialProvider;

    /**
     * provider가 사용 가능한 상태인지(필수 env 등) 확인
     */
    isEnabled(): boolean;

    /**
     * provider 로그인 페이지로 보낼 authorization URL 생성
     *
     * @param state - CSRF 방지용 암호화 state
     * @param scopes - 요청할 scope (미지정 시 provider 기본값)
     */
    getAuthUrl(state: string, scopes?: string[]): string;

    /**
     * authorization code를 토큰으로 교환
     */
    exchangeCodeForTokens(code: string): Promise<OAuthTokens>;

    /**
     * access token으로 사용자 정보를 조회하고 공통 형태로 정규화
     */
    getUserInfo(accessToken: string): Promise<NormalizedIdentity>;

    /**
     * refresh token으로 access token 갱신 (provider가 지원하는 경우)
     *
     * 저장된 provider 토큰을 이후 API 호출에 재사용할 때 사용한다.
     * 미구현 provider는 갱신 불가로 간주한다.
     */
    refreshTokens?(refreshToken: string): Promise<OAuthTokens>;
}

const registry = new Map<SocialProvider, OAuthProvider>();

/**
 * OAuth provider 등록 (public)
 *
 * 동일 id로 다시 등록하면 덮어쓴다(외부 패키지의 override 허용).
 */
export function registerOAuthProvider(provider: OAuthProvider): void
{
    registry.set(provider.id, provider);
}

/**
 * 등록된 provider 조회. 미등록이면 undefined.
 */
export function getOAuthProvider(id: SocialProvider): OAuthProvider | undefined
{
    return registry.get(id);
}

/**
 * 등록된 모든 provider 목록
 */
export function getRegisteredProviders(): OAuthProvider[]
{
    return [...registry.values()];
}
