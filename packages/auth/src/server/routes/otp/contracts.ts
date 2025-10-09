/**
 * OTP Route Contracts
 */

import { Type } from '@sinclair/typebox';
import type { RouteContract } from '@spfn/core/route';

/**
 * POST /send - OTP 발송
 *
 * 회원가입 또는 패스워드 리셋용 OTP 발송
 */
export const sendOtpContract = {
    method: 'POST',
    path: '/send',
    body: Type.Object({
        email: Type.String({ format: 'email' }),
        purpose: Type.Union([
            Type.Literal('register'),
            Type.Literal('reset-password'),
        ]),
    }),
    response: Type.Object({
        success: Type.Boolean(),
        expiresIn: Type.Number(), // OTP 유효시간 (초)
    }),
} as const satisfies RouteContract;

/**
 * POST /verify - OTP 검증
 *
 * OTP 검증 후 임시 토큰 발급 (회원가입/패스워드 리셋 시 사용)
 */
export const verifyOtpContract = {
    method: 'POST',
    path: '/verify',
    body: Type.Object({
        email: Type.String({ format: 'email' }),
        otp: Type.String({ minLength: 6, maxLength: 6 }),
        purpose: Type.Union([
            Type.Literal('register'),
            Type.Literal('reset-password'),
        ]),
    }),
    response: Type.Object({
        verified: Type.Boolean(),
        token: Type.Optional(Type.String()), // 검증 성공시 임시 토큰 (5분 유효)
    }),
} as const satisfies RouteContract;