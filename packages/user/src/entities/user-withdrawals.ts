/**
 * User Withdrawals Entity
 *
 * User withdrawal requests and processing history
 * Schema: spfn_core
 */

import { text, timestamp, index } from 'drizzle-orm/pg-core';
import { id, timestamps, foreignKey } from '@spfn/core/db';
import { users, spfnCore } from './users.js';

/**
 * Withdrawal status
 */
export const WithdrawalStatus = {
	REQUESTED: 'requested',
	CANCELLED: 'cancelled',
	COMPLETED: 'completed',
} as const;

export type WithdrawalStatus = typeof WithdrawalStatus[keyof typeof WithdrawalStatus];

/**
 * Withdrawal reason
 */
export const WithdrawalReason = {
	SERVICE_DISSATISFACTION: 'service_dissatisfaction',
	LOW_USAGE: 'low_usage',
	PRIVACY_CONCERNS: 'privacy_concerns',
	FOUND_ALTERNATIVE: 'found_alternative',
	OTHER: 'other',
} as const;

export type WithdrawalReason = typeof WithdrawalReason[keyof typeof WithdrawalReason];

/**
 * Verification method
 */
export const VerificationMethod = {
	PASSWORD: 'PASSWORD',
	EMAIL: 'EMAIL',
	SMS: 'SMS',
} as const;

export type VerificationMethod = typeof VerificationMethod[keyof typeof VerificationMethod];

/**
 * User withdrawals table
 *
 * @example
 * ```typescript
 * import { userWithdrawals } from '@spfn/user';
 * import { getDb } from '@spfn/core/db';
 *
 * const db = getDb();
 * const withdrawal = await db.select()
 *   .from(userWithdrawals)
 *   .where(eq(userWithdrawals.userId, userId));
 * ```
 */
export const userWithdrawals = spfnCore.table('user_withdrawals', {
	/** Primary key */
	id: id(),

	/** Reference to users.id */
	userId: foreignKey('user', () => users.id),

	/** Withdrawal status (requested, cancelled, completed) */
	status: text('status').$type<WithdrawalStatus>().default(WithdrawalStatus.REQUESTED).notNull(),

	/** Withdrawal reason enum */
	reason: text('reason').$type<WithdrawalReason>(),

	/** Detailed withdrawal reason text */
	reasonDetail: text('reason_detail'),

	/** Withdrawal request timestamp */
	requestedAt: timestamp('requested_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),

	/** Grace period end timestamp */
	gracePeriodEnd: timestamp('grace_period_end', { withTimezone: true, mode: 'date' }).notNull(),

	/** Withdrawal cancellation timestamp */
	cancelledAt: timestamp('cancelled_at', { withTimezone: true, mode: 'date' }),

	/** Withdrawal completion timestamp */
	completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),

	/** IP address of withdrawal request */
	requestIp: text('request_ip'),

	/** Verification method used (PASSWORD, EMAIL, SMS) */
	verificationMethod: text('verification_method').$type<VerificationMethod>().default(VerificationMethod.PASSWORD).notNull(),

	/** Record creation and update timestamps */
	...timestamps(),
}, (table) => ({
	/** Index for user_id lookups */
	userIdIdx: index('idx_user_withdrawals_user_id').on(table.userId),

	/** Index for status filtering */
	statusIdx: index('idx_user_withdrawals_status').on(table.status),

	/** Index for grace period queries */
	gracePeriodEndIdx: index('idx_user_withdrawals_grace_period_end').on(table.gracePeriodEnd),

	/** Index for requested_at sorting */
	requestedAtIdx: index('idx_user_withdrawals_requested_at').on(table.requestedAt),
}));

export type UserWithdrawal = typeof userWithdrawals.$inferSelect;
export type NewUserWithdrawal = typeof userWithdrawals.$inferInsert;