/**
 * @spfn/auth - Auth Events
 *
 * 인증 관련 이벤트 정의
 * - auth.login: 로그인 성공 시 (기존 사용자만)
 * - auth.register: 회원가입 성공 시 (OAuth 신규 가입 포함)
 */

import { defineEvent } from '@spfn/core/event';
import { Type } from '@sinclair/typebox';

import { SOCIAL_PROVIDERS } from '../types';

/**
 * Auth provider type
 *
 * 직접 인증(email/phone) + 등록 가능한 모든 소셜 provider(SOCIAL_PROVIDERS).
 */
export const AuthProviderSchema = Type.Union([
    Type.Literal('email'),
    Type.Literal('phone'),
    ...SOCIAL_PROVIDERS.map(p => Type.Literal(p)),
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
 * auth.invitation.created - 초대 생성 이벤트
 *
 * 발행 시점:
 * - createInvitation() 성공 시
 * - resendInvitation() 성공 시
 *
 * @example
 * ```typescript
 * invitationCreatedEvent.subscribe(async (payload) => {
 *     const inviteUrl = `${APP_URL}/invite/${payload.token}`;
 *     await notificationService.send({
 *         channel: 'email',
 *         to: payload.email,
 *         subject: 'You are invited!',
 *         html: renderInviteEmail({ inviteUrl, ...payload.metadata }),
 *     });
 * });
 * ```
 */
export const invitationCreatedEvent = defineEvent(
    'auth.invitation.created',
    Type.Object({
        invitationId: Type.String(),
        email: Type.String(),
        token: Type.String(),
        roleId: Type.Number(),
        invitedBy: Type.String(),
        expiresAt: Type.String(),
        isResend: Type.Boolean(),
        metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    })
);

/**
 * auth.invitation.accepted - 초대 수락 이벤트
 *
 * 발행 시점:
 * - acceptInvitation() 성공 시
 *
 * @example
 * ```typescript
 * invitationAcceptedEvent.subscribe(async (payload) => {
 *     await onboardingService.start(payload.userId);
 * });
 * ```
 */
export const invitationAcceptedEvent = defineEvent(
    'auth.invitation.accepted',
    Type.Object({
        invitationId: Type.String(),
        email: Type.String(),
        userId: Type.String(),
        roleId: Type.Number(),
        invitedBy: Type.String(),
        metadata: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    })
);

/**
 * Auth event payload types
 */
export type AuthLoginPayload = typeof authLoginEvent._payload;
export type AuthRegisterPayload = typeof authRegisterEvent._payload;
export type InvitationCreatedPayload = typeof invitationCreatedEvent._payload;
export type InvitationAcceptedPayload = typeof invitationAcceptedEvent._payload;
