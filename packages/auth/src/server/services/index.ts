/**
 * @spfn/auth - Services Export
 *
 * All business logic services for reusability
 */

// Auth Service
export {
    checkAccountExistsService,
    registerService,
    loginService,
    logoutService,
    changePasswordService,
} from './auth.service';

export type {
    CheckAccountExistsParams,
    CheckAccountExistsResult,
    RegisterParams,
    RegisterResult,
    LoginParams,
    LoginResult,
    LogoutParams,
    ChangePasswordParams,
} from './auth.service';

// Verification Service
export {
    sendVerificationCodeService,
    verifyCodeService,
} from './verification.service';

export type {
    SendVerificationCodeParams,
    SendVerificationCodeResult,
    VerifyCodeParams,
    VerifyCodeResult,
} from './verification.service';

// Key Service
export {
    registerPublicKeyService,
    rotateKeyService,
    revokeKeyService,
} from './key.service';

export type {
    RegisterPublicKeyParams,
    RotateKeyParams,
    RotateKeyResult,
    RevokeKeyParams,
} from './key.service';

// User Service
export {
    getUserByIdService,
    getUserByEmailService,
    getUserByPhoneService,
    updateLastLoginService,
    updateUserService,
} from './user.service';