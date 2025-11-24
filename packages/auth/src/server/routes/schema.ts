import { Type } from "@sinclair/typebox";
import { EMAIL_PATTERN, PHONE_PATTERN } from "@spfn/auth";

export const EmailSchema = Type.String({
    pattern: EMAIL_PATTERN,
    description: 'Email address'
});

export const PhoneSchema = Type.String({
    pattern: PHONE_PATTERN,
    description: 'Phone number in E.164 format (e.g., +821012345678)'
});

export const PasswordSchema = Type.String({
    minLength: 8,
    description: 'User password (minimum 8 characters)'
});

export const TargetTypeSchema = Type.Union([
    Type.Literal('email'),
    Type.Literal('phone')
], {
    description: 'Type of target (email or phone)'
})

export const VerificationPurposeSchema = Type.Union([
    Type.Literal('registration'),
    Type.Literal('login'),
    Type.Literal('password_reset')
], {
    description: 'Purpose of verification'
});