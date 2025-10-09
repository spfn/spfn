/**
 * Auth Error Classes
 *
 * Custom error classes for authentication and OTP flows
 */

import { DatabaseError } from '@spfn/core';

/**
 * Base OTP Error
 *
 * Base class for OTP-related errors
 */
export class OtpError extends DatabaseError
{
	constructor(message: string, statusCode: number = 400, details?: Record<string, any>)
	{
		super(message, statusCode, details);
		this.name = 'OtpError';
	}
}

/**
 * Rate Limit Error (429)
 *
 * OTP 발송 횟수 제한 초과
 */
export class RateLimitError extends OtpError
{
	constructor(retryAfter: number)
	{
		super('Rate limit exceeded. Please try again later.', 429, { retryAfter });
		this.name = 'RateLimitError';
	}
}

/**
 * OTP Expired Error (400)
 *
 * OTP 만료
 */
export class OtpExpiredError extends OtpError
{
	constructor()
	{
		super('OTP has expired.', 400);
		this.name = 'OtpExpiredError';
	}
}

/**
 * Invalid OTP Error (400)
 *
 * OTP 불일치
 */
export class InvalidOtpError extends OtpError
{
	constructor(attemptsRemaining: number)
	{
		super(`Invalid OTP. ${attemptsRemaining} attempts remaining.`, 400, {
			attemptsRemaining,
		});
		this.name = 'InvalidOtpError';
	}
}

/**
 * OTP Not Found Error (400)
 *
 * OTP가 존재하지 않거나 이미 사용됨
 */
export class OtpNotFoundError extends OtpError
{
	constructor()
	{
		super('OTP not found or already used.', 400);
		this.name = 'OtpNotFoundError';
	}
}

/**
 * Max Attempts Error (400)
 *
 * 최대 검증 시도 횟수 초과
 */
export class MaxAttemptsError extends OtpError
{
	constructor(maxAttempts: number)
	{
		super('Maximum verification attempts exceeded.', 400, { maxAttempts });
		this.name = 'MaxAttemptsError';
	}
}