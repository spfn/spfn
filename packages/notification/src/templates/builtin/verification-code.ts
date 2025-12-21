/**
 * @spfn/notification - Verification Code Template
 */

import type { TemplateDefinition } from '../types';

export const verificationCodeTemplate: TemplateDefinition = {
    name: 'verification-code',
    channels: ['email', 'sms'],

    email: {
        subject: '[{{appName}}] 인증 코드: {{code}}',
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
            인증 코드를 입력해주세요:
        </p>
        <div style="background: #f8f9fa; padding: 25px; border-radius: 8px; text-align: center; margin: 25px 0; border: 2px dashed #dee2e6;">
            <span style="font-size: 36px; font-weight: bold; letter-spacing: 10px; color: #333; font-family: 'Courier New', monospace;">{{code}}</span>
        </div>
        <p style="color: #666; font-size: 14px; margin-top: 20px; text-align: center;">
            <strong>이 코드는 {{expiresInMinutes | default:5}}분 후 만료됩니다.</strong>
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="color: #999; font-size: 12px; text-align: center; margin: 0;">
            본인이 요청하지 않았다면 이 이메일을 무시해주세요.
        </p>
    </div>
</body>
</html>`,
        text: `[{{appName}}] 인증 코드: {{code}}

이 코드는 {{expiresInMinutes | default:5}}분 후 만료됩니다.

본인이 요청하지 않았다면 이 메시지를 무시해주세요.`,
    },

    sms: {
        message: '[{{appName}}] 인증 코드: {{code}} ({{expiresInMinutes | default:5}}분 내 입력)',
    },
};
