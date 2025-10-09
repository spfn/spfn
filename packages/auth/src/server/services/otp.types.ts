/**
 * OTP Service Types
 */

import type { Redis } from 'ioredis';

/**
 * OTP Service Options
 */
export interface OtpServiceOptions
{
	/** Redis instance for OTP caching (optional) */
	redis?: Redis;

	/** Email provider for sending OTP */
	sendEmail: (to: string, otp: string, purpose: 'register' | 'reset-password') => Promise<void>;

	/** OTP expiry in seconds (default: 300 = 5분) */
	otpExpiry?: number;

	/** Verified token expiry in seconds (default: 300 = 5분) */
	verifiedTokenExpiry?: number;

	/** Maximum verification attempts (default: 3) */
	maxAttempts?: number;

	/** Rate limit: Maximum OTP sends per email in window (default: 3) */
	rateLimitMax?: number;

	/** Rate limit window in seconds (default: 300 = 5분) */
	rateLimitWindow?: number;
}

/**
 * Send OTP Result
 */
export interface SendOtpResult
{
	success: true;
	expiresIn: number;
}

/**
 * Verify OTP Result
 */
export interface VerifyOtpResult
{
	verified: true;
	token: string;
}

/**
 * OTP Purpose
 */
export type OtpPurpose = 'register' | 'reset-password';