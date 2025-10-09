/**
 * OTP Logs Entity
 *
 * OTP 발송 및 검증 로그
 * Stored in spfn_auth schema
 */

import { text, timestamp, integer } from 'drizzle-orm/pg-core';
import { id, timestamps } from '@spfn/core/db';
import { spfnAuth } from './user-keys.js';

/**
 * OTP logs table
 *
 * 감사 로그 및 rate limiting용
 */
export const otpLogs = spfnAuth.table('otp_logs', {
	id: id(),

	/** 이메일 주소 */
	email: text('email').notNull(),

	/** OTP 목적 */
	purpose: text('purpose', { enum: ['register', 'reset-password'] }).notNull(),

	/** OTP 코드 해시 (bcrypt/argon2) */
	code: text('code').notNull(),

	/** 상태 */
	status: text('status', { enum: ['pending', 'verified', 'expired'] })
		.notNull()
		.default('pending'),

	/** 만료 시각 */
	expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),

	/** 검증 성공 시각 (null = 미검증) */
	verifiedAt: timestamp('verified_at', { withTimezone: true, mode: 'date' }),

	/** 검증 시도 횟수 (최대 3회) */
	attempts: integer('attempts').notNull().default(0),

	/** 요청 IP 주소 */
	ipAddress: text('ip_address'),

	...timestamps(),
});

export type OtpLog = typeof otpLogs.$inferSelect;
export type NewOtpLog = typeof otpLogs.$inferInsert;
