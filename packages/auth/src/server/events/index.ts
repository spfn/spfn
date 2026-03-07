/**
 * @spfn/auth - Auth Events
 *
 * 인증 관련 이벤트 정의
 * - auth.login: 로그인 성공 시 (기존 사용자만)
 * - auth.register: 회원가입 성공 시 (OAuth 신규 가입 포함)
 */

import { defineEvent } from '@spfn/core/event';
import { Type } from '@sinclair/typebox';

/**
 * Auth provider type
 */
export const AuthProviderSchema = Type.Union([
    Type.Literal('email'),
    Type.Literal('phone'),
    Type.Literal('google'),
]);

/**
 * auth.login - 로그인 성공 이벤트
 *
 * 발행 시점:
 * - 이메일/전화 로그인 성공 시
 * - OAuth 기존 사용자 로그인 시
 *
 * @example
 * ```typescript
 * authLoginEvent.subscribe(async (payload) => {
 *     await analytics.trackLogin(payload.userId, payload.provider);
 * });
 * ```
 */
export const authLoginEvent = defineEvent(
    'auth.login',
    Type.Object({
        userId: Type.String(),
        provider: AuthProviderSchema,
        email: Type.Optional(Type.String()),
        phone: Type.Optional(Type.String()),
    })
);

/**
 * auth.register - 회원가입 성공 이벤트
 *
 * 발행 시점:
 * - 이메일/전화 회원가입 성공 시
 * - OAuth 신규 사용자 가입 시
 *
 * @example
 * ```typescript
 * authRegisterEvent.subscribe(async (payload) => {
 *     await emailService.sendWelcome(payload.email);
 * });
 * ```
 */
export const authRegisterEvent = defineEvent(
    'auth.register',
    Type.Object({
        userId: Type.String(),
        provider: AuthProviderSchema,
        email: Type.Optional(Type.String()),
        phone: Type.Optional(Type.String()),
        metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    })
);

/**
 * Auth event payload types
 */
export type AuthLoginPayload = typeof authLoginEvent._payload;
export type AuthRegisterPayload = typeof authRegisterEvent._payload;
