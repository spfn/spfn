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
} from './auth-errors';

export {
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
} from './auth-errors';

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

export * as AuthError from './auth-errors';