/**
 * @spfn/auth - Main Router
 *
 * Combines all auth-related routes into a single router
 */

import { defineRouter } from '@spfn/core/route';
import {
    checkAccountExists,
    sendVerificationCode,
    verifyCode,
    register,
    login,
    logout,
    rotateKey,
    changePassword,
    getAuthSession,
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
import { getUserProfile, updateUserProfile } from './users';
import {
    oauthGoogleStart,
    oauthGoogleCallback,
    oauthStart,
    oauthProviders,
    getGoogleOAuthUrl,
    oauthFinalize,
} from './oauth';

/**
 * Main auth router
 * Exports all authentication-related routes
 *
 * Routes:
 * - Auth: /_auth/exists, /_auth/codes, /_auth/login, /_auth/logout, etc.
 * - OAuth: /_auth/oauth/google, /_auth/oauth/google/callback, etc.
 * - Invitations: /_auth/invitations/*
 * - Users: /_auth/users/*
 */
export const mainAuthRouter = defineRouter({
    // Auth routes
    checkAccountExists,
    sendVerificationCode,
    verifyCode,
    register,
    login,
    logout,
    rotateKey,
    changePassword,
    getAuthSession,
    // OAuth routes
    oauthGoogleStart,
    oauthGoogleCallback,
    oauthStart,
    oauthProviders,
    getGoogleOAuthUrl,
    oauthFinalize,
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
});

// For backward compatibility
export default mainAuthRouter;