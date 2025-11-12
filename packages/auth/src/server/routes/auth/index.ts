/**
 * @spfn/auth - Auth Routes
 *
 * Thin route handlers that delegate to services
 */

import { createApp } from '@spfn/core/route';
import { Transactional } from '@spfn/core/db';
import {
    checkAccountExistsContract,
    registerContract,
    loginContract,
    logoutContract,
    rotateKeyContract,
    changePasswordContract,
    sendVerificationCodeContract,
    verifyCodeContract,
    getAuthSessionContract
} from '@/lib/contracts';
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
import { getAuthSessionService } from '@/server/services/auth-session.service';

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
app.bind(registerContract, [Transactional()], async (c) =>
{
    const body = await c.data();
    const result = await registerService(body);
    return c.success(result);
});

// POST /api/auth/login
app.bind(loginContract, [Transactional()], async (c) =>
{
    const body = await c.data();
    const result = await loginService(body);
    return c.success(result);
});

// ===== Authenticated Routes Below =====
// POST /api/auth/logout (Authenticated)
app.bind(logoutContract, async (c) =>
{
    const auth = getAuth(c);

    // If no auth (expired/invalid session), logout is still considered successful
    if (!auth)
    {
        return c.success({ success: true });
    }

    const { keyId, userId } = auth;
    await logoutService({ userId: Number(userId), keyId });
    return c.success({ success: true });
});

// POST /api/auth/keys/rotate (Authenticated)
app.bind(rotateKeyContract, [Transactional()], async (c) =>
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
app.bind(changePasswordContract, async (c) =>
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

// GET /_auth/session (Authenticated)
app.bind(getAuthSessionContract, async (c) =>
{
    const { userId } = getAuth(c);
    const result = await getAuthSessionService(userId);
    return c.success(result);
});

export default app;