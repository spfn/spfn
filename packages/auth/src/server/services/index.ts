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
export { getUserProfileService } from './user-profile.service';

// Email Templates
export {
    registerEmailTemplates,
    getVerificationCodeTemplate,
    getWelcomeTemplate,
    getPasswordResetTemplate,
    getInvitationTemplate,
} from './email/templates';

export type {
    EmailTemplateProvider,
    EmailTemplateResult,
    VerificationCodeParams,
} from './email/templates';

// Email Service
export { sendEmail, registerEmailProvider } from './email';
export type { SendEmailParams, SendEmailResult, EmailProvider } from './email';

// SMS Service
export { sendSMS, registerSMSProvider } from './sms';
export type { SendSMSParams, SendSMSResult, SMSProvider } from './sms';