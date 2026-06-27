/**
 * @spfn/auth - Main Router
 *
 * Combines all auth-related routes into a single router
 */

import { defineRouter } from '@spfn/core/route';
import {
    sendVerificationCode,
    verifyCode,
    register,
    login,
    logout,
    rotateKey,
    changePassword,
    getAuthSession,
    issueOneTimeToken,
} from './auth';
import {
    getInvitation,
    acceptInvitation,
    createInvitation,
    listInvitations,
    cancelInvitation,
    resendInvitation,
    deleteInvitation,
} from './invitations';
import { getUserProfile, updateUserProfile, checkUsername, updateUsername, updateLocale } from './users';
import {
    oauthGoogleStart,
    oauthGoogleCallback,
    oauthStart,
    oauthProviders,
    getGoogleOAuthUrl,
    oauthFinalize,
    oauthProviderStart,
    oauthProviderCallback,
    getProviderOAuthUrl,
    oauthNative,
} from './oauth';
import {
    listRoles,
    createAdminRole,
    updateAdminRole,
    deleteAdminRole,
    updateUserRole,
} from './admin';

/**
 * Main auth router
 * Exports all authentication-related routes
 *
 * Routes:
 * - Auth: /_auth/codes, /_auth/login, /_auth/logout, etc.
 * - OAuth: /_auth/oauth/google, /_auth/oauth/google/callback, etc.
 * - Invitations: /_auth/invitations/*
 * - Users: /_auth/users/*
 * - Admin: /_auth/admin/* (superadmin only)
 */
export const mainAuthRouter = defineRouter({
    // Auth routes
    sendVerificationCode,
    verifyCode,
    register,
    login,
    logout,
    rotateKey,
    changePassword,
    getAuthSession,
    // One-Time Token routes
    issueOneTimeToken,
    // OAuth routes
    oauthGoogleStart,
    oauthGoogleCallback,
    oauthStart,
    oauthProviders,
    getGoogleOAuthUrl,
    oauthFinalize,
    oauthProviderStart,
    oauthProviderCallback,
    getProviderOAuthUrl,
    oauthNative,
    // Invitation routes
    getInvitation,
    acceptInvitation,
    createInvitation,
    listInvitations,
    cancelInvitation,
    resendInvitation,
    deleteInvitation,
    // User routes
    getUserProfile,
    updateUserProfile,
    checkUsername,
    updateUsername,
    updateLocale,
    // Admin routes (superadmin only)
    listRoles,
    createAdminRole,
    updateAdminRole,
    deleteAdminRole,
    updateUserRole,
});

// For backward compatibility
export default mainAuthRouter;
