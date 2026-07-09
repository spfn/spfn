/**
 * @spfn/auth - Native Social Login Service
 *
 * 네이티브/웹 SDK가 받은 id_token을 JWKS로 검증하고, 검증된 신원에 클라이언트가 만든
 * 공개키를 등록한다. 토큰은 발급하지 않는다 — 클라이언트가 등록한 키로 client token을
 * 직접 서명해 Bearer로 사용한다(client-signs / server-verifies 모델).
 *
 * 흐름은 두 단계로 분리한다:
 *   1) id_token 검증 — 외부 JWKS 네트워크 조회. DB 트랜잭션 밖에서 수행한다.
 *   2) persist — 사용자 link/create + 공개키 등록을 한 트랜잭션으로. 이벤트는 커밋 후 발행.
 */

import { ValidationError } from '@spfn/core/errors';
import { runInTransaction, onAfterCommit } from '@spfn/core/db';

import { socialAccountsRepository } from '../repositories';
import { type SocialProvider, type KeyAlgorithmType } from '../types';
import { getOAuthProvider, type NormalizedIdentity } from '../lib/oauth';
import { createOrLinkUser, assertActiveForOAuthSession } from './oauth.service';
import { registerPublicKeyService } from './key.service';
import { updateLastLoginService } from './user.service';
import { authLoginEvent, authRegisterEvent } from '../events';

export interface OAuthNativeParams
{
    provider: SocialProvider;
    idToken: string;
    nonce: string;
    publicKey: string;
    keyId: string;
    fingerprint: string;
    algorithm: KeyAlgorithmType;
    /** Apple은 첫 로그인에만 이름을 별도로 주므로 클라이언트가 전달할 수 있다. */
    profile?: { name?: string };
    metadata?: Record<string, unknown>;
}

export interface OAuthNativeResult
{
    userId: string;
    keyId: string;
    isNewUser: boolean;
}

/**
 * native id_token 로그인 처리
 *
 * @throws ValidationError provider가 native sign-in을 지원하지 않을 때
 * @throws InvalidSocialTokenError id_token 검증 실패 시
 */
export async function oauthNativeService(params: OAuthNativeParams): Promise<OAuthNativeResult>
{
    const oauthProvider = getOAuthProvider(params.provider);

    if (!oauthProvider?.verifyNativeIdToken)
    {
        throw new ValidationError({
            message: `Provider '${params.provider}' does not support native id_token sign-in.`,
        });
    }

    // 1. id_token 검증 (외부 JWKS 조회 — 트랜잭션 밖)
    const identity = await oauthProvider.verifyNativeIdToken(params.idToken, { nonce: params.nonce });

    // Apple 첫 로그인 등 id_token에 이름이 없을 때 클라이언트 profile로 보강
    if (params.profile?.name && !identity.name)
    {
        identity.name = params.profile.name;
    }

    // 2. persist (트랜잭션)
    return persistNativeLogin(identity, params);
}

/**
 * 검증된 신원에 사용자 연결/생성 + 공개키 등록을 한 트랜잭션으로 처리한다.
 * 이벤트는 커밋 성공 후에만 발행한다(롤백 시 유령 이벤트 방지).
 */
async function persistNativeLogin(
    identity: NormalizedIdentity,
    params: OAuthNativeParams,
): Promise<OAuthNativeResult>
{
    return runInTransaction(async () =>
    {
        // providerUserId 우선 매칭 → 없으면 신규 생성/이메일 연결
        const existing = await socialAccountsRepository.findByProviderAndProviderId(
            params.provider,
            identity.providerUserId,
        );

        let userId: number;
        let isNewUser = false;

        if (existing)
        {
            userId = existing.userId;
        }
        else
        {
            const result = await createOrLinkUser(params.provider, identity);
            userId = result.userId;
            isNewUser = result.isNewUser;
        }

        // 세션(공개키) 발급 전 계정 상태 검사 — oauth.service.ts의 web 흐름과 동일한 지점
        await assertActiveForOAuthSession(userId);

        // 공개키 등록 (idempotent — 같은 keyId 재등록은 무시됨)
        await registerPublicKeyService({
            userId,
            keyId: params.keyId,
            publicKey: params.publicKey,
            fingerprint: params.fingerprint,
            algorithm: params.algorithm,
        });

        await updateLastLoginService(userId);

        const eventPayload = {
            userId: String(userId),
            provider: params.provider,
            email: identity.email || undefined,
            metadata: params.metadata,
        };
        onAfterCommit(() => (isNewUser ? authRegisterEvent : authLoginEvent).emit(eventPayload));

        return { userId: String(userId), keyId: params.keyId, isNewUser };
    }, { context: 'auth:oauth-native' });
}
