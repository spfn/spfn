/**
 * @spfn/notification - Welcome Template
 */

import type { TemplateDefinition } from '../types';

export const welcomeTemplate: TemplateDefinition = {
    name: 'welcome',
    channels: ['email'],

    email: {
        subject: '[{{appName}}] 가입을 환영합니다!',
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
        <h2 style="color: #333; margin-top: 0;">환영합니다, {{name | default:회원}}님!</h2>
        <p style="font-size: 16px; color: #555;">
            {{appName}}에 가입해 주셔서 감사합니다.
        </p>
        <p style="font-size: 16px; color: #555;">
            이제 모든 서비스를 이용하실 수 있습니다.
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="color: #999; font-size: 12px; text-align: center; margin: 0;">
            문의사항이 있으시면 언제든지 연락해 주세요.
        </p>
    </div>
</body>
</html>`,
        text: `[{{appName}}] 가입을 환영합니다!

{{name | default:회원}}님, {{appName}}에 가입해 주셔서 감사합니다.
이제 모든 서비스를 이용하실 수 있습니다.`,
    },
};
