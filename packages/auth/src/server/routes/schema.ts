/**
 * TypeBox Schemas - Single Source of Truth
 *
 * All validation schemas, types, and runtime constants are defined here.
 * Other modules import from this file to ensure consistency.
 */

import { Type, Static } from '@sinclair/typebox';
import { EMAIL_PATTERN, PHONE_PATTERN } from '@spfn/auth';
import { KEY_DEVICE_NAME_MAX_LENGTH, KEY_PLATFORM } from '../types';

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

/**
 * Optional device labels a client may send when registering a key.
 *
 * Display only: the key list uses them to tell one device from another, and
 * nothing is authorized or refused by either value, so a client that lies about
 * them gains nothing. Both are omitted by every key registered before they
 * existed, hence optional rather than defaulted.
 */
export const DeviceNameSchema = Type.String({
    maxLength: KEY_DEVICE_NAME_MAX_LENGTH,
    description: `Device label shown in the key list (max ${KEY_DEVICE_NAME_MAX_LENGTH} chars)`,
});

export const PlatformSchema = Type.Union(
    KEY_PLATFORM.map(platform => Type.Literal(platform)),
    { description: 'Platform the key lives on' },
);

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
