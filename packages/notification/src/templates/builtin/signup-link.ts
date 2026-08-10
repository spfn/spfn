/**
 * @spfn/notification - Signup Confirmation Link Template
 *
 * Sent when someone asks to sign up with an email address that has no account
 * yet. Opening the link proves the address belongs to them and takes them to the
 * page where they choose a password — no account exists until that step.
 *
 * Email only: the link flow is a web flow, and there is no SMS equivalent.
 */

import type { TemplateDefinition } from '../types';

export const signupLinkTemplate: TemplateDefinition = {
    name: 'signup-link',
    channels: ['email'],

    email: {
        subject: '[{{appName}}] Confirm your email to finish signing up',
        html: `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f5;">
    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 24px;">{{appName}}</h1>
    </div>
    <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
        <p style="margin-bottom: 20px; font-size: 16px;">
            Confirm this address to finish creating your account. You will choose a password on the next screen.
        </p>
        <p style="text-align: center; margin: 32px 0;">
            <a href="{{confirmUrl}}" style="display: inline-block; background: #667eea; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-size: 16px; font-weight: 600;">Confirm email address</a>
        </p>
        <p style="margin-bottom: 20px; font-size: 14px; color: #666;">
            The link works once and expires in {{expiresInMinutes}} minutes. If the button does not work, paste this into your browser:
        </p>
        <p style="margin-bottom: 20px; font-size: 13px; color: #666; word-break: break-all;">
            {{confirmUrl}}
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="color: #666; font-size: 14px; margin: 0;">
            If you did not ask to sign up, ignore this email. No account has been created, and none will be unless someone opens this link and sets a password.
        </p>
    </div>
</body>
</html>`,
        text: `[{{appName}}] Confirm your email to finish signing up

Confirm this address to finish creating your account. You will choose a password on the next screen.

{{confirmUrl}}

The link works once and expires in {{expiresInMinutes}} minutes.

If you did not ask to sign up, ignore this email. No account has been created, and none will be unless someone opens this link and sets a password.`,
    },
};
