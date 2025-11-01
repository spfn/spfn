/**
 * @spfn/auth - Auth Routes
 */

import { createApp } from '@spfn/core/route';
import { findOne, updateOne } from '@spfn/core/db';
import { users } from '../../entities';
import { success, error, ErrorCodes } from '../../types';
import { checkAccountExistsContract, loginContract, changePasswordContract } from '../../contracts';
import { authenticate } from '../../middleware';
import { hashPassword, verifyPassword } from '../../helpers';
import { generateToken } from '../../helpers';

const app = createApp();

// POST /api/auth/exists
app.bind(checkAccountExistsContract, async (c) =>
{
    const body = await c.data();
    const { email, phone } = body;

    // Build query conditions and identify the search type
    let identifier: string;
    let identifierType: 'email' | 'phone';
    let user;

    if (email)
    {
        identifier = email;
        identifierType = 'email';
        user = await findOne(users, { email });
    }
    else if (phone)
    {
        identifier = phone;
        identifierType = 'phone';
        user = await findOne(users, { phone });
    }
    else
    {
        // This should never happen due to contract validation
        return c.json(
            error(ErrorCodes.VALIDATION_ERROR, 'Either email or phone must be provided'),
            400
        );
    }

    return c.json(
        success(
            {
                exists: !!user,
                identifier,
                identifierType,
            }
        )
    );
});

// POST /api/auth/login
app.bind(loginContract, async (c) =>
{
    const body = await c.data();
    const { email, phone, password } = body;

    // Find user
    let user;
    if (email)
    {
        user = await findOne(users, { email });
    }
    else if (phone)
    {
        user = await findOne(users, { phone });
    }

    if (!user || !user.passwordHash)
    {
        return c.json(
            error(ErrorCodes.INVALID_CREDENTIALS, 'Invalid credentials'),
            401
        );
    }

    // Verify password
    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid)
    {
        return c.json(
            error(ErrorCodes.INVALID_CREDENTIALS, 'Invalid credentials'),
            401
        );
    }

    // Check if user is active
    if (user.status !== 'active')
    {
        return c.json(
            error(ErrorCodes.FORBIDDEN, `Account is ${user.status}`),
            403
        );
    }

    // Update last login
    await updateOne(users, { id: user.id }, {
        lastLoginAt: new Date(),
    });

    // Generate token
    const token = generateToken({
        userId: user.id,
        role: user.role,
    });

    return c.json(
        success({
            token,
            user: {
                id: user.id,
                email: user.email || undefined,
                phone: user.phone || undefined,
                role: user.role,
                emailVerifiedAt: user.emailVerifiedAt?.toISOString(),
                phoneVerifiedAt: user.phoneVerifiedAt?.toISOString(),
            },
            passwordChangeRequired: user.passwordChangeRequired,
        })
    );
});

// ===== Authenticated Routes Below =====
// POST /api/auth/change-password (Authenticated)
app.bind(changePasswordContract, [authenticate], async (c) =>
{
    const body = await c.data();
    const { currentPassword, newPassword } = body;

    // Get authenticated user from raw context (set by middleware)
    const user = c.raw.get('user');

    // Verify current password
    if (!user.passwordHash)
    {
        return c.json(
            error(ErrorCodes.INVALID_CREDENTIALS, 'No password set for this account'),
            400
        );
    }

    const isValid = await verifyPassword(currentPassword, user.passwordHash);
    if (!isValid)
    {
        return c.json(
            error(ErrorCodes.INVALID_CREDENTIALS, 'Current password is incorrect'),
            401
        );
    }

    // Hash new password
    const newPasswordHash = await hashPassword(newPassword);

    // Update password and clear passwordChangeRequired flag
    await updateOne(users, { id: user.id }, {
        passwordHash: newPasswordHash,
        passwordChangeRequired: false,
        updatedAt: new Date(),
    });

    return c.json(
        success({
            success: true,
        })
    );
});

export default app;