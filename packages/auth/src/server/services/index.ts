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

// RBAC Service
export {
    initializeAuth,
} from './rbac.service';

// Permission Service
export {
    getUserPermissions,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    getUserRole,
    hasRole,
    hasAnyRole,
} from './permission.service';

// Role Service
export {
    createRole,
    updateRole,
    deleteRole,
    addPermissionToRole,
    removePermissionFromRole,
    setRolePermissions,
    getAllRoles,
    getRoleByName,
    getRolePermissions,
} from './role.service';

// Invitation Service
export {
    createInvitation,
    getInvitationByToken,
    getInvitationWithDetails,
    validateInvitation,
    acceptInvitation,
    listInvitations,
    cancelInvitation,
    deleteInvitation,
    expireOldInvitations,
    resendInvitation,
} from './invitation.service';

// Auth Session Service (new)
export { getAuthSessionService } from './auth-session.service';

// User Profile Service (new)
export { getUserProfileService, updateUserProfileService } from './user-profile.service';
export type { UpdateProfileParams } from './user-profile.service';

// OAuth Service
export {
    oauthStartService,
    oauthCallbackService,
    buildOAuthErrorUrl,
    isOAuthProviderEnabled,
    getEnabledOAuthProviders,
} from './oauth.service';

export type {
    OAuthStartParams,
    OAuthStartResult,
    OAuthCallbackParams,
    OAuthCallbackResult,
} from './oauth.service';

// =============================================================================
// Email & SMS - DEPRECATED: Use @spfn/notification instead
// =============================================================================
// Email and SMS functionality has been moved to @spfn/notification package.
// Please use the following imports instead:
//
//   import { sendEmail, sendSMS } from '@spfn/notification/server';
//
// The @spfn/notification package provides:
// - Multi-channel support (Email, SMS, Slack, Push)
// - Template system with variable substitution
// - Multiple provider support (AWS SES, SNS, SendGrid, Twilio, etc.)
// =============================================================================