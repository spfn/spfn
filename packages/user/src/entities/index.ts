/**
 * User domain entities
 */

export { spfnCore, users, UserState } from './users.js';
export type { User, NewUser, UserState as UserStateType } from './users.js';

export {
	userWithdrawals,
	WithdrawalStatus,
	WithdrawalReason,
	VerificationMethod,
} from './user-withdrawals.js';
export type {
	UserWithdrawal,
	NewUserWithdrawal,
	WithdrawalStatus as WithdrawalStatusType,
	WithdrawalReason as WithdrawalReasonType,
	VerificationMethod as VerificationMethodType,
} from './user-withdrawals.js';