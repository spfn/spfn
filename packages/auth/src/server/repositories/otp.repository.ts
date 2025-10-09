/**
 * OTP Repository
 *
 * CRUD operations for otp_logs table
 */

import { eq, and, gte } from 'drizzle-orm';
import { Repository } from '@spfn/core/db';

import { otpLogs } from '../entities';
import type { OtpLog } from '../entities';
import type { OtpPurpose } from '../services';

/**
 * OTP Repository
 *
 * Extends Repository pattern from @spfn/core/db
 *
 * @example
 * ```typescript
 * import { OtpRepository, otpLogs } from '@spfn/auth/server';
 *
 * const otpRepo = new OtpRepository(otpLogs);
 * const log = await otpRepo.findPendingOtp('user@example.com', 'register');
 * ```
 */
export class OtpRepository extends Repository<typeof otpLogs>
{
	/**
	 * Find most recent pending OTP
	 */
	async findPendingOtp(email: string, purpose: OtpPurpose): Promise<OtpLog | null>
	{
		const [log] = await this.db
			.select()
			.from(this.table)
			.where(
				and(
					eq(this.table.email, email),
					eq(this.table.purpose, purpose),
					eq(this.table.status, 'pending')
				)
			)
			.orderBy(this.table.createdAt)
			.limit(1);

		return log ?? null;
	}

	/**
	 * Find most recent pending and non-expired OTP (for Redis fast path)
	 */
	async findPendingValidOtp(email: string, purpose: OtpPurpose): Promise<OtpLog | null>
	{
		const [log] = await this.db
			.select()
			.from(this.table)
			.where(
				and(
					eq(this.table.email, email),
					eq(this.table.purpose, purpose),
					eq(this.table.status, 'pending'),
					gte(this.table.expiresAt, new Date())
				)
			)
			.orderBy(this.table.createdAt)
			.limit(1);

		return log ?? null;
	}

	/**
	 * Find recent OTP logs for rate limiting
	 */
	async findRecentLogs(email: string, purpose: OtpPurpose, since: Date): Promise<OtpLog[]>
	{
		return this.db
			.select()
			.from(this.table)
			.where(
				and(
					eq(this.table.email, email),
					eq(this.table.purpose, purpose),
					gte(this.table.createdAt, since)
				)
			);
	}
}