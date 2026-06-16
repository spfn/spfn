/**
 * 소셜 provider id_token JWKS 검증
 *
 * 네이티브/웹 SDK가 받은 id_token을 provider의 공개키(JWKS)로 검증한다.
 * authorization code 교환이 없으므로 client secret을 쓰지 않는다.
 * 서명·issuer·audience·만료는 jose가, nonce는 여기서 직접 대조한다.
 */

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { InvalidSocialTokenError } from '@spfn/auth/errors';
import { authLogger } from '../../logger';

// id_token 발급자/서버 간 시계 오차 허용치(초). 갓 발급된 토큰의 간헐적 거부를 막는다.
const CLOCK_TOLERANCE_SECONDS = 30;

// 원격 JWKS는 URI별로 한 번만 만들어 캐싱한다(jose가 키 회전을 자동 처리).
const jwksByUri = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getRemoteJwks(jwksUri: string): ReturnType<typeof createRemoteJWKSet>
{
    const cached = jwksByUri.get(jwksUri);
    if (cached)
    {
        return cached;
    }

    const jwks = createRemoteJWKSet(new URL(jwksUri));
    jwksByUri.set(jwksUri, jwks);

    return jwks;
}

export interface VerifyIdTokenParams
{
    idToken: string;
    jwksUri: string;
    issuer: string | string[];
    audiences: string[];
    /** 허용 서명 알고리즘 화이트리스트(alg confusion 방어). Google/Apple은 'RS256'. */
    algorithms: string[];
    /** id_token의 nonce claim과 정확히 일치해야 하는 값(provider별로 raw 또는 SHA-256 해시). */
    expectedNonce: string;
}

/**
 * id_token을 검증하고 claims(payload)를 반환한다.
 *
 * @throws InvalidSocialTokenError 서명/issuer/audience/만료/알고리즘/nonce/sub 검증 실패 시
 */
export async function verifyIdToken(params: VerifyIdTokenParams): Promise<JWTPayload>
{
    const payload = await verifySignature(params);

    if (payload.nonce !== params.expectedNonce)
    {
        throw new InvalidSocialTokenError({ message: 'id_token nonce mismatch' });
    }

    // sub(provider 신원 식별자)은 OIDC 필수 claim. jose는 sub 존재를 강제하지 않으므로 직접 확인한다.
    if (typeof payload.sub !== 'string' || payload.sub.length === 0)
    {
        throw new InvalidSocialTokenError({ message: 'id_token is missing the subject (sub) claim' });
    }

    return payload;
}

/**
 * jose의 서명/issuer/audience/algorithm/만료 검증을 도메인 에러로 감싼다.
 *
 * 검증 실패의 구체적 사유는 우회 지점을 좁히는 정보가 되므로 클라이언트에 노출하지 않고
 * 로그로만 남긴다. 토큰 원문은 기록하지 않는다.
 */
async function verifySignature(params: VerifyIdTokenParams): Promise<JWTPayload>
{
    try
    {
        const { payload } = await jwtVerify(params.idToken, getRemoteJwks(params.jwksUri), {
            issuer: params.issuer,
            audience: params.audiences,
            algorithms: params.algorithms,
            clockTolerance: CLOCK_TOLERANCE_SECONDS,
        });

        return payload;
    }
    catch (err)
    {
        authLogger.service.warn('id_token signature/claims verification failed', {
            reason: err instanceof Error ? err.message : 'unknown',
        });
        throw new InvalidSocialTokenError();
    }
}
