/**
 * Auth Error Exports
 */

import { ErrorRegistry } from '@spfn/core/errors';

import {
    InvalidCredentialsError,
    InvalidTokenError,
    InvalidSocialTokenError,
    TokenExpiredError,
    KeyExpiredError,
    AccountDisabledError,
    AccountPendingDeletionError,
    DeletionAlreadyRequestedError,
    DeletionNotRequestedError,
    ImmediateDeletionNotAllowedError,
    AccountAlreadyExistsError,
    ReservedUsernameError,
    UsernameAlreadyTakenError,
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
    InvalidSocialTokenError,
    TokenExpiredError,
    KeyExpiredError,
    AccountDisabledError,
    AccountPendingDeletionError,
    DeletionAlreadyRequestedError,
    DeletionNotRequestedError,
    ImmediateDeletionNotAllowedError,
    AccountAlreadyExistsError,
    ReservedUsernameError,
    UsernameAlreadyTakenError,
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
    InvalidSocialTokenError,
    TokenExpiredError,
    KeyExpiredError,
    AccountDisabledError,
    AccountPendingDeletionError,
    DeletionAlreadyRequestedError,
    DeletionNotRequestedError,
    ImmediateDeletionNotAllowedError,
    AccountAlreadyExistsError,
    ReservedUsernameError,
    UsernameAlreadyTakenError,
    InvalidVerificationCodeError,
    InvalidVerificationTokenError,
    InvalidKeyFingerprintError,
    VerificationTokenPurposeMismatchError,
    VerificationTokenTargetMismatchError,
    InsufficientPermissionsError,
    InsufficientRoleError,
]);

export * as AuthError from './auth-errors';
