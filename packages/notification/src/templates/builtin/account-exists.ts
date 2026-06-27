/**
 * @spfn/notification - Account Exists Notice Template
 *
 * Sent when someone requests a signup code for an address/number that already has
 * an account. The signup itself returns an identical response either way (no
 * account enumeration); this notice goes only to the address owner, both as a UX
 * hint ("you already have an account") and as a security tripwire ("wasn't you?").
 */

import type { TemplateDefinition } from '../types';

export const accountExistsTemplate: TemplateDefinition = {
    name: 'account-exists',
    channels: ['email', 'sms'],

    email: {
        subject: '[{{appName}}] 이미 가입된 계정이 있어요',
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
        <p style="margin-bottom: 16px; font-size: 16px;">
            방금 이 주소로 <strong>새 계정 가입</strong>을 시도한 요청이 있었어요. 그런데 이미 가입된 계정이 있습니다.
        </p>
        <p style="margin-bottom: 16px; font-size: 16px;">
            본인이 한 거라면 새로 가입하실 필요 없이 <strong>로그인</strong>하시거나, 비밀번호가 기억나지 않으면 <strong>비밀번호 재설정</strong>을 이용해주세요.
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="color: #666; font-size: 14px; margin: 0;">
            본인이 한 게 아니라면 <strong>이 메일을 무시하셔도 됩니다</strong> — 새 계정은 만들어지지 않았고, 기존 계정도 아무것도 바뀌지 않았습니다. 모르는 시도가 계속되면 비밀번호를 한 번 바꿔두시길 권합니다.
        </p>
    </div>
</body>
</html>`,
        text: `[{{appName}}] 이미 가입된 계정이 있어요

방금 이 주소로 새 계정 가입을 시도한 요청이 있었습니다. 그런데 이미 가입된 계정이 있어요.

본인이 한 거라면 새로 가입할 필요 없이 로그인하거나, 비밀번호 재설정을 이용해주세요.

본인이 한 게 아니라면 이 메일을 무시하셔도 됩니다 — 새 계정은 만들어지지 않았고 기존 계정도 그대로입니다. 모르는 시도가 계속되면 비밀번호를 바꿔두시길 권합니다.`,
    },

    sms: {
        message: '[{{appName}}] 이미 가입된 번호로 새 가입 시도가 있었어요. 본인이면 로그인해주세요. 아니면 무시하셔도 됩니다(새 계정 안 만들어짐).',
    },
};
