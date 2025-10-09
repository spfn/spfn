/**
 * OTP Service
 *
 * OTP 발송 및 검증 비즈니스 로직
 */

import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { otpLogs } from '../entities';
import { OtpRepository } from '../repositories';
import {
	RateLimitError,
	OtpExpiredError,
	InvalidOtpError,
	OtpNotFoundError,
	MaxAttemptsError,
} from '../../shared/errors.js';
import type {
	OtpServiceOptions,
	SendOtpResult,
	VerifyOtpResult,
	OtpPurpose,
} from './otp.types.js';

const scryptAsync = promisify(scrypt);

/**
 * Hash OTP code using scrypt
 */
async function hashOtp(otp: string): Promise<string>
{
	const salt = randomBytes(16).toString('hex');
	const derivedKey = (await scryptAsync(otp, salt, 32)) as Buffer;
	return `${salt}:${derivedKey.toString('hex')}`;
}

/**
 * Verify OTP code against hash
 */
async function verifyOtpHash(otp: string, hash: string): Promise<boolean>
{
	const [salt, key] = hash.split(':');
	const derivedKey = (await scryptAsync(otp, salt, 32)) as Buffer;
	const keyBuffer = Buffer.from(key, 'hex');
	return timingSafeEqual(derivedKey, keyBuffer);
}

/**
 * OTP Service
 *
 * OTP 생성, 발송, 검증 비즈니스 로직
 */
export class OtpService
{
	private readonly redis?: OtpServiceOptions['redis'];
	private readonly sendEmail: OtpServiceOptions['sendEmail'];
	private readonly otpExpiry: number;
	private readonly verifiedTokenExpiry: number;
	private readonly maxAttempts: number;
	private readonly rateLimitMax: number;
	private readonly rateLimitWindow: number;

	constructor(options: OtpServiceOptions)
	{
		this.redis = options.redis;
		this.sendEmail = options.sendEmail;
		this.otpExpiry = options.otpExpiry ?? 300;
		this.verifiedTokenExpiry = options.verifiedTokenExpiry ?? 300;
		this.maxAttempts = options.maxAttempts ?? 3;
		this.rateLimitMax = options.rateLimitMax ?? 3;
		this.rateLimitWindow = options.rateLimitWindow ?? 300;
	}

	/**
	 * Get OTP repository
	 */
	private get repo()
	{
		return new OtpRepository(otpLogs);
	}

	/**
	 * OTP 발송
	 *
	 * Rate limiting 체크 → OTP 생성 → DB 저장 → Redis 캐싱 (optional) → 이메일 발송
	 */
	async sendOtp(email: string, purpose: OtpPurpose): Promise<SendOtpResult>
	{
		// 1. Rate limiting: 같은 email에 대해 최근 N분 내 M회 초과 체크
		await this.checkRateLimit(email, purpose);

		// 2. Generate OTP (6-digit)
		const otp = Math.floor(100000 + Math.random() * 900000).toString();

		// 3. Hash OTP
		const hashedOtp = await hashOtp(otp);

		// 4. Store in DB
		const expiresAt = new Date(Date.now() + this.otpExpiry * 1000);
		await this.repo.save({
			email,
			purpose,
			code: hashedOtp,
			status: 'pending',
			expiresAt,
			attempts: 0,
			ipAddress: undefined, // TODO: Get from request context
		});

		// 5. Optional: Cache in Redis
		if (this.redis)
		{
			const key = `otp:${purpose}:${email}`;
			await this.redis.setex(key, this.otpExpiry, otp);
		}

		// 6. Send email
		await this.sendEmail(email, otp, purpose);

		return {
			success: true,
			expiresIn: this.otpExpiry,
		};
	}

	/**
	 * OTP 검증
	 *
	 * Redis 체크 (fast path) → DB 검증 → attempts 증가
	 */
	async verifyOtp(email: string, otp: string, purpose: OtpPurpose): Promise<VerifyOtpResult>
	{
		// 1. Optional: Check Redis first (fast path)
		if (this.redis)
		{
			const redisResult = await this.verifyOtpFromRedis(email, otp, purpose);
			if (redisResult)
			{
				return redisResult;
			}
		}

		// 2. Find most recent pending OTP from DB
		const log = await this.repo.findPendingOtp(email, purpose);

		if (!log)
		{
			throw new OtpNotFoundError();
		}

		// 3. Check expiry
		if (new Date() > log.expiresAt)
		{
			await this.repo.update(log.id, { status: 'expired' });
			throw new OtpExpiredError();
		}

		// 4. Check max attempts
		if (log.attempts >= this.maxAttempts)
		{
			await this.repo.update(log.id, { status: 'expired' });
			throw new MaxAttemptsError(this.maxAttempts);
		}

		// 5. Verify OTP hash
		const isValid = await verifyOtpHash(otp, log.code);

		// 6. Increment attempts
		await this.repo.update(log.id, {
			attempts: log.attempts + 1,
		});

		if (!isValid)
		{
			throw new InvalidOtpError(this.maxAttempts - log.attempts - 1);
		}

		// 7. Success: Update status
		await this.repo.update(log.id, {
			status: 'verified',
			verifiedAt: new Date(),
		});

		// 8. Generate verified token
		const token = randomUUID();

		if (this.redis)
		{
			const tokenKey = `verified:${purpose}:${email}`;
			await this.redis.setex(tokenKey, this.verifiedTokenExpiry, token);
		}

		return {
			verified: true,
			token,
		};
	}

	/**
	 * Rate limit 체크
	 *
	 * @throws RateLimitError
	 */
	private async checkRateLimit(email: string, purpose: OtpPurpose): Promise<void>
	{
		const rateLimitStart = new Date(Date.now() - this.rateLimitWindow * 1000);
		const recentLogs = await this.repo.findRecentLogs(email, purpose, rateLimitStart);

		if (recentLogs.length >= this.rateLimitMax)
		{
			throw new RateLimitError(this.rateLimitWindow);
		}
	}

	/**
	 * Redis에서 OTP 검증 (fast path)
	 */
	private async verifyOtpFromRedis(
		email: string,
		otp: string,
		purpose: OtpPurpose
	): Promise<VerifyOtpResult | null>
	{
		if (!this.redis)
		{
			return null;
		}

		const key = `otp:${purpose}:${email}`;
		const cachedOtp = await this.redis.get(key);

		if (cachedOtp && cachedOtp === otp)
		{
			// Redis hit: Update DB status and delete cache
			const log = await this.repo.findPendingValidOtp(email, purpose);

			if (log)
			{
				await this.repo.update(log.id, {
					status: 'verified',
					verifiedAt: new Date(),
				});
			}

			await this.redis.del(key);

			// Generate verified token
			const token = randomUUID();
			const tokenKey = `verified:${purpose}:${email}`;
			await this.redis.setex(tokenKey, this.verifiedTokenExpiry, token);

			return {
				verified: true,
				token,
			};
		}

		return null;
	}
}