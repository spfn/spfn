/**
 * Auth Error Exports
 */

import { ErrorRegistry } from "@spfn/core/errors";

import {
    InvalidCredentialsError,
    InvalidTokenError,
    TokenExpiredError,
    KeyExpiredError,
    AccountDisabledError,
    AccountAlreadyExistsError,
    InvalidVerificationCodeError,
    InvalidVerificationTokenError,
    InvalidKeyFingerprintError,
    VerificationTokenPurposeMismatchError,
    VerificationTokenTargetMismatchError,
    InsufficientPermissionsError,
    InsufficientRoleError,
} from './auth-errors.js';

export {
    InvalidCredentialsError,
    InvalidTokenError,
    TokenExpiredError,
    KeyExpiredError,
    AccountDisabledError,
    AccountAlreadyExistsError,
    InvalidVerificationCodeError,
    InvalidVerificationTokenError,
    InvalidKeyFingerprintError,  // 이 클래스가 export되지 않아서 오류 발생
    VerificationTokenPurposeMismatchError,
    VerificationTokenTargetMismatchError,
    InsufficientPermissionsError,
    InsufficientRoleError,
} from './auth-errors.js';

export const authErrorRegistry = new ErrorRegistry();
authErrorRegistry.append([
    InvalidCredentialsError,
    InvalidTokenError,
    TokenExpiredError,
    KeyExpiredError,
    AccountDisabledError,
    AccountAlreadyExistsError,
    InvalidVerificationCodeError,
    InvalidVerificationTokenError,
    InvalidKeyFingerprintError,
    VerificationTokenPurposeMismatchError,
    VerificationTokenTargetMismatchError,
    InsufficientPermissionsError,
    InsufficientRoleError,
]);

export * as AuthError from './auth-errors.js';