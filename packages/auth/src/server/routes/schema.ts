/**
 * TypeBox Schemas - Single Source of Truth
 *
 * All validation schemas, types, and runtime constants are defined here.
 * Other modules import from this file to ensure consistency.
 */

import { Type, Static } from '@sinclair/typebox';
import { EMAIL_PATTERN, PHONE_PATTERN } from '@spfn/auth';

// ============================================================================
// Basic Schemas
// ============================================================================

export const EmailSchema = Type.String({
    pattern: EMAIL_PATTERN,
    description: 'Email address',
});

export const PhoneSchema = Type.String({
    pattern: PHONE_PATTERN,
    description: 'Phone number in E.164 format (e.g., +821012345678)',
});

export const PasswordSchema = Type.String({
    minLength: 8,
    maxLength: 72,
    description: 'User password (8–72 characters). bcrypt silently ignores bytes past 72, so longer inputs are rejected rather than truncated.',
});

// ============================================================================
// Verification Target Type
// ============================================================================

export const TargetTypeSchema = Type.Union([
    Type.Literal('email'),
    Type.Literal('phone'),
], {
    description: 'Type of target (email or phone)',
});

export type VerificationTargetType = Static<typeof TargetTypeSchema>;

export const VERIFICATION_TARGET_TYPES = ['email', 'phone'] as const;

// ============================================================================
// Verification Purpose
// ============================================================================

export const VerificationPurposeSchema = Type.Union([
    Type.Literal('registration'),
    Type.Literal('login'),
    Type.Literal('password_reset'),
    Type.Literal('email_change'),
    Type.Literal('phone_change'),
    Type.Literal('account_deletion'),
], {
    description: 'Purpose of verification',
});

export type VerificationPurpose = Static<typeof VerificationPurposeSchema>;

export const VERIFICATION_PURPOSES = ['registration', 'login', 'password_reset', 'email_change', 'phone_change', 'account_deletion'] as const;
