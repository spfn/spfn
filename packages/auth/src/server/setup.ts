/**
 * @spfn/auth - Setup Functions
 *
 * Initial setup and admin account creation
 */

import { hashPassword } from '@/server/helpers';
import { getRoleByName } from '@/server/services/role.service';
import { authLogger } from '@/server/logger';
import { usersRepository } from '@/server/repositories';
import { env } from '@/config';

/**
 * Admin account configuration
 */
interface AdminAccountConfig
{
    email: string;
    password: string;
    role?: string; // Role name (e.g., 'user', 'admin', 'superadmin')
    phone?: string;
    passwordChangeRequired?: boolean;
}

/**
 * Parse admin accounts from environment variables
 *
 * Supports three formats (in priority order):
 *
 * 1. JSON format (ADMIN_ACCOUNTS):
 *    ```
 *    ADMIN_ACCOUNTS='[{"email":"admin@example.com","password":"pass","role":"superadmin"}]'
 *    ```
 *
 * 2. Comma-separated format (ADMIN_EMAILS + ADMIN_PASSWORDS + ADMIN_ROLES):
 *    ```
 *    ADMIN_EMAILS=admin@example.com,user@example.com
 *    ADMIN_PASSWORDS=admin-pass,user-pass
 *    ADMIN_ROLES=superadmin,user
 *    ```
 *
 * 3. Single account format (legacy, ADMIN_EMAIL + ADMIN_PASSWORD):
 *    ```
 *    ADMIN_EMAIL=admin@example.com
 *    ADMIN_PASSWORD=admin-password
 *    ```
 *
 * @returns Array of admin account configurations
 */
function parseAdminAccounts(): AdminAccountConfig[]
{
    const accounts: AdminAccountConfig[] = [];

    // Method 1: JSON format (highest priority)
    if (env.SPFN_AUTH_ADMIN_ACCOUNTS)
    {
        try
        {
            const accountsJson = env.SPFN_AUTH_ADMIN_ACCOUNTS;

            const parsed = JSON.parse(accountsJson);

            if (!Array.isArray(parsed))
            {
                authLogger.setup.error('❌ SPFN_AUTH_ADMIN_ACCOUNTS must be an array');
                return accounts;
            }

            for (const item of parsed)
            {
                if (!item.email || !item.password)
                {
                    authLogger.setup.warn('⚠️  Skipping account: missing email or password');
                    continue;
                }

                accounts.push({
                    email: item.email,
                    password: item.password,
                    role: item.role || 'user',
                    phone: item.phone,
                    passwordChangeRequired: item.passwordChangeRequired !== false, // Default: true
                });
            }

            return accounts;
        }
        catch (error)
        {
            const err = error as Error;
            authLogger.setup.error('❌ Failed to parse SPFN_AUTH_ADMIN_ACCOUNTS:', err);
            return accounts;
        }
    }

    // Method 2: Comma-separated format
    const adminEmails = env.SPFN_AUTH_ADMIN_EMAILS;

    if (adminEmails)
    {
        const emails = adminEmails.split(',').map(s => s.trim());
        const passwords = (env.SPFN_AUTH_ADMIN_PASSWORDS || '').split(',').map(s => s.trim());
        const roles = (env.SPFN_AUTH_ADMIN_ROLES || '').split(',').map(s => s.trim());

        // Validate lengths match
        if (passwords.length !== emails.length)
        {
            authLogger.setup.error('❌ SPFN_AUTH_ADMIN_EMAILS and SPFN_AUTH_ADMIN_PASSWORDS length mismatch');
            return accounts;
        }

        for (let i = 0; i < emails.length; i++)
        {
            const email = emails[i];
            const password = passwords[i];
            const role = roles[i] || 'user';

            if (!email || !password)
            {
                authLogger.setup.warn(`⚠️  Skipping account ${i + 1}: missing email or password`);
                continue;
            }

            accounts.push({
                email,
                password,
                role,
                passwordChangeRequired: true,
            });
        }

        return accounts;
    }

    // Method 3: Single account (legacy format)
    const adminEmail = env.SPFN_AUTH_ADMIN_EMAIL;
    const adminPassword = env.SPFN_AUTH_ADMIN_PASSWORD;

    if (adminEmail && adminPassword)
    {
        accounts.push({
            email: adminEmail,
            password: adminPassword,
            role: 'superadmin',
            passwordChangeRequired: true,
        });
    }

    return accounts;
}

/**
 * Ensure admin accounts exist from environment variables
 *
 * Supports multiple admin account creation via three formats:
 * 1. JSON format (SPFN_AUTH_ADMIN_ACCOUNTS)
 * 2. Comma-separated format (SPFN_AUTH_ADMIN_EMAILS + SPFN_AUTH_ADMIN_PASSWORDS + SPFN_AUTH_ADMIN_ROLES)
 * 3. Single account format (SPFN_AUTH_ADMIN_EMAIL + SPFN_AUTH_ADMIN_PASSWORD) - legacy
 *
 * Default behavior for created accounts:
 * - emailVerifiedAt: current timestamp (auto-verified)
 * - passwordChangeRequired: true (must change on first login)
 * - status: 'active'
 *
 * @example
 * ```typescript
 * // In your server startup code:
 * import { ensureAdminExists } from '@spfn/auth/server';
 *
 * await ensureAdminExists();
 * ```
 */
export async function ensureAdminExists(): Promise<void>
{
    const accounts = parseAdminAccounts();

    // Skip if no accounts configured
    if (accounts.length === 0)
    {
        return;
    }

    authLogger.setup.info(`Creating ${accounts.length} admin account(s)...`);

    let created = 0;
    let skipped = 0;
    let failed = 0;

    for (const account of accounts)
    {
        authLogger.setup.info(`Creating ${account.email} admin account(s)...`);

        try
        {
            // Check if account already exists
            const existing = await usersRepository.findByEmail(account.email);

            if (existing)
            {
                authLogger.setup.info(`⚠️  Account already exists: ${account.email} (skipped)`);
                skipped++;
                continue;
            }

            // Get role ID from role name
            const roleName = account.role || 'user';
            const role = await getRoleByName(roleName);

            if (!role)
            {
                authLogger.setup.error(`❌ Role '${roleName}' not found for ${account.email}. Run initializeAuth() first.`);
                failed++;
                continue;
            }

            // Hash password
            const passwordHash = await hashPassword(account.password);

            // Create admin account
            await usersRepository.create({
                email: account.email,
                phone: account.phone || null,
                passwordHash,
                roleId: role.id,
                emailVerifiedAt: new Date(), // Auto-verify admin
                passwordChangeRequired: account.passwordChangeRequired !== false,
                status: 'active',
            });

            authLogger.setup.info(`✅ Admin account created: ${account.email} (${roleName})`);
            created++;
        }
        catch (error)
        {
            const err = error as Error;
            authLogger.setup.error(`❌ Failed to create account ${account.email}:`, err);
            failed++;
        }
    }

    // Summary
    authLogger.setup.info(`📊 Summary: ${created} created, ${skipped} skipped, ${failed} failed`);

    if (created > 0)
    {
        authLogger.setup.info('⚠️  Please change passwords on first login!');
    }
}