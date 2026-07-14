/**
 * OAuth Provider 추상화
 *
 * Provider별로 하드코딩된 분기를 제거하기 위한 공통 인터페이스와 registry.
 * - 내장 provider(google)는 패키지 로드 시점에 자기 등록(dogfood)
 * - 외부 패키지(@superself/auth 등)는 registerOAuthProvider()로 런타임 등록
 *
 * @spfn/auth는 토큰 issuer가 아니라 소비(client) 측이므로, 이 추상화는
 * web 흐름("authorize URL 생성 → code 교환 → 사용자 정보 정규화")과
 * native 흐름(네이티브/웹 SDK가 받은 id_token 직접 검증)을 다룬다.
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
 * 네이티브 id_token 검증 옵션
 */
export interface NativeVerifyOptions
{
    /** 클라이언트가 생성한 raw nonce. provider별 규약(raw 또는 SHA-256 해시)으로 대조된다. */
    nonce: string;
}

export interface OAuthCodeExchangeOptions
{
    /** Provider가 callback에 돌려준 원본 state. 일부 provider는 token 교환에도 요구한다. */
    state: string;
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
    exchangeCodeForTokens(code: string, options: OAuthCodeExchangeOptions): Promise<OAuthTokens>;

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

    /**
     * 네이티브/웹 SDK가 받은 id_token을 직접 검증하고 신원을 정규화한다.
     *
     * authorization code 교환 없이 provider JWKS로 서명을 검증하므로 client secret이
     * 필요 없다. native sign-in을 지원하는 provider만 구현한다(Apple은 web SDK 부재로
     * Android·웹도 이 경로를 쓴다).
     */
    verifyNativeIdToken?(idToken: string, options: NativeVerifyOptions): Promise<NormalizedIdentity>;
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
