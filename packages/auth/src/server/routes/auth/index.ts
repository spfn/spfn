/**
 * @spfn/auth - Auth Routes
 *
 * Thin route handlers that delegate to services
 */

import { createApp } from '@spfn/core/route';
import {
    checkAccountExistsContract,
    registerContract,
    loginContract,
    logoutContract,
    rotateKeyContract,
    changePasswordContract,
    sendVerificationCodeContract,
    verifyCodeContract
} from '@/lib/contracts';
import { authenticate } from '@/server/middleware';
import { getAuth, getUser } from '@/server/helpers';
import {
    checkAccountExistsService,
    registerService,
    loginService,
    logoutService,
    changePasswordService,
    sendVerificationCodeService,
    verifyCodeService,
    rotateKeyService,
} from '@/server/services';

const app = createApp();

// POST /api/auth/exists
app.bind(checkAccountExistsContract, async (c) =>
{
    const body = await c.data();
    const result = await checkAccountExistsService(body);
    return c.success(result);
});

// POST /_auth/codes
app.bind(sendVerificationCodeContract, async (c) =>
{
    const body = await c.data();
    const result = await sendVerificationCodeService(body);
    return c.success(result);
});

// POST /_auth/codes/verify
app.bind(verifyCodeContract, async (c) =>
{
    const body = await c.data();
    const result = await verifyCodeService(body);
    return c.success(result);
});

// POST /api/auth/register
app.bind(registerContract, async (c) =>
{
    const body = await c.data();
    const result = await registerService(body);
    return c.success(result);
});

// POST /api/auth/login
app.bind(loginContract, async (c) =>
{
    const body = await c.data();
    const result = await loginService(body);
    return c.success(result);
});

// ===== Authenticated Routes Below =====
// POST /api/auth/logout (Authenticated)
app.bind(logoutContract, [authenticate], async (c) =>
{
    const { keyId, userId } = getAuth(c);
    await logoutService({ userId: Number(userId), keyId });
    return c.success({ success: true });
});

// POST /api/auth/keys/rotate (Authenticated)
app.bind(rotateKeyContract, [authenticate], async (c) =>
{
    const body = await c.data();
    const { keyId: oldKeyId, userId } = getAuth(c);

    const result = await rotateKeyService({
        userId: Number(userId),
        oldKeyId,
        newKeyId: body.keyId,
        newPublicKey: body.publicKey,
        fingerprint: body.fingerprint,
        algorithm: body.algorithm,
    });

    return c.success(result);
});

// PUT /_auth/password (Authenticated)
app.bind(changePasswordContract, [authenticate], async (c) =>
{
    const body = await c.data();
    const user = getUser(c);

    await changePasswordService({
        userId: user.id,
        currentPassword: body.currentPassword,
        newPassword: body.newPassword,
        passwordHash: user.passwordHash || undefined,
    });

    return c.success({ success: true });
});

export default app;