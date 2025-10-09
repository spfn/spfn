/**
 * Database entities for @spfn/auth
 */

export { spfnAuth, userKeys } from './user-keys.js';
export type { UserKey, NewUserKey } from './user-keys.js';

export { otpLogs } from './otp-logs.js';
export type { OtpLog, NewOtpLog } from './otp-logs.js';

// Re-export user entities from @spfn/user
export { users, UserState } from '@spfn/user';
export type { User, NewUser } from '@spfn/user';