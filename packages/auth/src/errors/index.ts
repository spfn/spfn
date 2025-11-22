/**
 * Auth Error Exports
 */

import { ErrorRegistry } from "@spfn/core/errors";
import * as AuthErrors from './auth-errors.js';

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
} from './auth-errors.js';

export const authErrorRegistry = new ErrorRegistry();
authErrorRegistry.append(Object.values(AuthErrors));