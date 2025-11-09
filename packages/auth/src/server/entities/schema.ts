/**
 * @spfn/auth - Database Schema Definition
 *
 * Defines the 'spfn_auth' PostgreSQL schema for all auth-related tables
 */

import { createFunctionSchema } from '@spfn/core/db';

/**
 * Auth schema for all authentication and authorization tables
 * Tables: users, roles, permissions, user_invitations, etc.
 */
export const authSchema = createFunctionSchema('@spfn/auth');