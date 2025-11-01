/**
 * @spfn/auth - Setup Functions
 *
 * Initial setup and admin account creation
 */

import { findOne, create } from '@spfn/core/db';
import { users } from './entities';
import { hashPassword } from './helpers';

/**
 * Ensure admin account exists from environment variables
 *
 * Environment variables:
 * - ADMIN_EMAIL: Admin email address (required)
 * - ADMIN_PASSWORD: Admin password (required)
 *
 * The admin account will have:
 * - role: 'superadmin'
 * - emailVerifiedAt: current timestamp (auto-verified)
 * - passwordChangeRequired: true (must change on first login)
 */
export async function ensureAdminExists(): Promise<void>
{
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;

    // Skip if not configured
    if (!email || !password)
    {
        return;
    }

    // Check if admin already exists
    const existing = await findOne(users, { email });
    if (existing)
    {
        console.log('[Auth] Admin account already exists:', email);
        return;
    }

    // Create admin account
    const passwordHash = await hashPassword(password);

    await create(users, {
        email,
        passwordHash,
        role: 'superadmin',
        emailVerifiedAt: new Date(), // Auto-verify admin
        passwordChangeRequired: true, // Force password change
        status: 'active',
    });

    console.log('[Auth] ✅ Admin account created:', email);
    console.log('[Auth] ⚠️  Please change the password on first login!');
}