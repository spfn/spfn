/**
 * @spfn/auth - Services Export
 *
 * All business logic services for reusability
 */

// Auth Service
export {
    registerService,
    loginService,
    logoutService,
    changePasswordService,
} from './auth.service';

export type {
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
    checkUsernameAvailableService,
    updateUsernameService,
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
    assertCanAssignRole,
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

// One-Time Token Service
export {
    issueOneTimeTokenService,
    verifyOneTimeTokenService,
} from './one-time-token.service';

export type {
    IssueOneTimeTokenResult,
} from './one-time-token.service';

// User Profile Service (new)
export { getUserProfileService, updateUserProfileService, updateLocaleService } from './user-profile.service';
export type { UpdateProfileParams } from './user-profile.service';

// OAuth Service
export {
    oauthStartService,
    oauthCallbackService,
    buildOAuthErrorUrl,
    isOAuthProviderEnabled,
    requireEnabledProvider,
    getEnabledOAuthProviders,
    getGoogleAccessToken,
    oauthUnlinkNotifyService,
} from './oauth.service';

export type {
    OAuthStartParams,
    OAuthStartResult,
    OAuthCallbackParams,
    OAuthCallbackResult,
    UnlinkNotifyResult,
} from './oauth.service';

// Native Social Login Service
export {
    oauthNativeService,
} from './oauth-native.service';

export type {
    OAuthNativeParams,
    OAuthNativeResult,
} from './oauth-native.service';

// Account Deletion Service
export {
    requestAccountDeletionService,
    cancelAccountDeletionService,
    purgeUserService,
    sweepDuePurges,
    getPendingDeletionInfo,
} from './account-deletion.service';

export type {
    RequestAccountDeletionParams,
    RequestAccountDeletionResult,
    CancelAccountDeletionParams,
    CancelAccountDeletionResult,
    PurgeUserResult,
    SweepDuePurgesResult,
    PendingDeletionInfo,
} from './account-deletion.service';

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
