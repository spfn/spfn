/**
 * OTP Routes
 *
 * OTP 발송 및 검증 API 엔드포인트
 */

import { createApp } from '@spfn/core/route';
import { sendOtpContract, verifyOtpContract } from './contracts.js';
import { OtpService, type OtpServiceOptions } from '../../services';

/**
 * OTP Routes Options
 */
export type OtpRoutesOptions = OtpServiceOptions;

/**
 * Create OTP routes
 *
 * @example
 * ```typescript
 * import { createOtpRoutes } from '@spfn/auth/server';
 *
 * const otpRoutes = createOtpRoutes({
 *   redis: redisClient,
 *   sendEmail: async (to, otp, purpose) => {
 *     await emailService.send(to, `Your OTP: ${otp}`);
 *   }
 * });
 *
 * app.route('/otp', otpRoutes);
 * ```
 */
export function createOtpRoutes(options: OtpRoutesOptions)
{
	const otpService = new OtpService(options);
	const app = createApp();

	/**
	 * POST /send - OTP 발송
	 */
	app.bind(sendOtpContract, async (c) =>
	{
		const { email, purpose } = await c.data();

		const result = await otpService.sendOtp(email, purpose);

		return c.json(result);
	});

	/**
	 * POST /verify - OTP 검증
	 */
	app.bind(verifyOtpContract, async (c) =>
	{
		const { email, otp, purpose } = await c.data();

		const result = await otpService.verifyOtp(email, otp, purpose);

		return c.json(result);
	});

	return app;
}