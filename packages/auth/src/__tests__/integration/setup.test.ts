/**
 * @spfn/auth - Setup Integration Tests
 *
 * Tests for ensureAdminExists() function
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { setupTestDb, teardownTestDb, clearTables, getTestDb, isDatabaseAvailable } from '../helpers/db';
import { ensureAdminExists } from '@/server/setup';
import { initializeAuth } from '@/server/services/rbac.service';
import { getRoleByName } from '@/server/services/role.service';
import { users } from '@/server/entities';
import { verifyPassword } from '@/server/helpers/password';
import { authLogger } from '@/server/logger';
import { eq } from 'drizzle-orm';

// Check if database is available before running tests
const dbAvailable = await isDatabaseAvailable();

describe.skipIf(!dbAvailable)('Setup - ensureAdminExists()', () =>
{
    beforeAll(async () =>
    {
        await setupTestDb();
    });

    afterAll(async () =>
    {
        await teardownTestDb();
    });

    beforeEach(async () =>
    {
        const db = getTestDb();
        await clearTables(db);

        // Initialize RBAC system (creates roles)
        await initializeAuth();

        // Clear environment variables before each test
        delete process.env.SPFN_AUTH_ADMIN_ACCOUNTS;
        delete process.env.SPFN_AUTH_ADMIN_EMAILS;
        delete process.env.SPFN_AUTH_ADMIN_PASSWORDS;
        delete process.env.SPFN_AUTH_ADMIN_ROLES;
        delete process.env.SPFN_AUTH_ADMIN_EMAIL;
        delete process.env.SPFN_AUTH_ADMIN_PASSWORD;
    });

    describe('JSON Format (ADMIN_ACCOUNTS)', () =>
    {
        it('should create multiple admin accounts from JSON', async () =>
        {
            process.env.SPFN_AUTH_ADMIN_ACCOUNTS = JSON.stringify([
                {
                    email: 'super@example.com',
                    password: 'super-password',
                    role: 'superadmin',
                    phone: '+821012345678',
                },
                {
                    email: 'admin@example.com',
                    password: 'admin-password',
                    role: 'admin',
                },
                {
                    email: 'user@example.com',
                    password: 'user-password',
                    role: 'user',
                },
            ]);

            await ensureAdminExists();

            const db = getTestDb();
            const allUsers = await db.select().from(users);

            // Get role IDs for comparison
            const superadminRole = await getRoleByName('superadmin');
            const adminRole = await getRoleByName('admin');
            const userRole = await getRoleByName('user');

            expect(allUsers).toHaveLength(3);

            // Check super admin
            const superAdmin = allUsers.find(u => u.email === 'super@example.com');
            expect(superAdmin).toBeDefined();
            expect(superAdmin?.roleId).toBe(superadminRole!.id);
            expect(superAdmin?.phone).toBe('+821012345678');
            expect(superAdmin?.emailVerifiedAt).toBeTruthy();
            expect(superAdmin?.passwordChangeRequired).toBe(true);
            expect(superAdmin?.status).toBe('active');

            // Verify password hash
            const isValidPassword = await verifyPassword('super-password', superAdmin!.passwordHash!);
            expect(isValidPassword).toBe(true);

            // Check admin
            const admin = allUsers.find(u => u.email === 'admin@example.com');
            expect(admin?.roleId).toBe(adminRole!.id);

            // Check user
            const regularUser = allUsers.find(u => u.email === 'user@example.com');
            expect(regularUser?.roleId).toBe(userRole!.id);
        });

        it('should use default role "user" if not specified', async () =>
        {
            process.env.SPFN_AUTH_ADMIN_ACCOUNTS = JSON.stringify([
                {
                    email: 'default@example.com',
                    password: 'password123',
                },
            ]);

            await ensureAdminExists();

            const db = getTestDb();
            const [user] = await db.select().from(users).where(eq(users.email, 'default@example.com'));
            const userRole = await getRoleByName('user');

            expect(user).toBeDefined();
            expect(user.roleId).toBe(userRole!.id);
        });

        it('should respect passwordChangeRequired flag', async () =>
        {
            process.env.SPFN_AUTH_ADMIN_ACCOUNTS = JSON.stringify([
                {
                    email: 'no-change@example.com',
                    password: 'password123',
                    passwordChangeRequired: false,
                },
                {
                    email: 'change@example.com',
                    password: 'password123',
                    passwordChangeRequired: true,
                },
            ]);

            await ensureAdminExists();

            const db = getTestDb();
            const [noChange] = await db.select().from(users).where(eq(users.email, 'no-change@example.com'));
            const [change] = await db.select().from(users).where(eq(users.email, 'change@example.com'));

            expect(noChange.passwordChangeRequired).toBe(false);
            expect(change.passwordChangeRequired).toBe(true);
        });

        it('should skip accounts with missing email or password', async () =>
        {
            const consoleWarnSpy = vi.spyOn(authLogger.setup, 'warn').mockImplementation(() => 
            {});

            process.env.SPFN_AUTH_ADMIN_ACCOUNTS = JSON.stringify([
                {
                    email: 'valid@example.com',
                    password: 'password123',
                },
                {
                    email: 'no-password@example.com',
                    // Missing password
                },
                {
                    password: 'no-email-password',
                    // Missing email
                },
            ]);

            await ensureAdminExists();

            const db = getTestDb();
            const allUsers = await db.select().from(users);

            expect(allUsers).toHaveLength(1);
            expect(allUsers[0].email).toBe('valid@example.com');
            expect(consoleWarnSpy).toHaveBeenCalled();

            consoleWarnSpy.mockRestore();
        });

        it('should handle JSON parsing errors gracefully', async () =>
        {
            const consoleErrorSpy = vi.spyOn(authLogger.setup, 'error').mockImplementation(() => 
            {});

            process.env.SPFN_AUTH_ADMIN_ACCOUNTS = 'invalid-json{[';

            await ensureAdminExists();

            const db = getTestDb();
            const allUsers = await db.select().from(users);

            expect(allUsers).toHaveLength(0);
            expect(consoleErrorSpy).toHaveBeenCalled();

            consoleErrorSpy.mockRestore();
        });

        it('should handle non-array JSON gracefully', async () =>
        {
            const consoleErrorSpy = vi.spyOn(authLogger.setup, 'error').mockImplementation(() => 
            {});

            process.env.SPFN_AUTH_ADMIN_ACCOUNTS = JSON.stringify({
                email: 'single@example.com',
                password: 'password123',
            });

            await ensureAdminExists();

            const db = getTestDb();
            const allUsers = await db.select().from(users);

            expect(allUsers).toHaveLength(0);
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('ADMIN_ACCOUNTS must be an array'),
            );

            consoleErrorSpy.mockRestore();
        });
    });

    describe('Comma-Separated Format (ADMIN_EMAILS)', () =>
    {
        it('should create multiple admin accounts from comma-separated values', async () =>
        {
            process.env.SPFN_AUTH_ADMIN_EMAILS = 'super@example.com,admin@example.com,user@example.com';
            process.env.SPFN_AUTH_ADMIN_PASSWORDS = 'super-pass,admin-pass,user-pass';
            process.env.SPFN_AUTH_ADMIN_ROLES = 'superadmin,admin,user';

            await ensureAdminExists();

            const db = getTestDb();
            const allUsers = await db.select().from(users);

            // Get role IDs
            const superadminRole = await getRoleByName('superadmin');
            const adminRole = await getRoleByName('admin');
            const userRole = await getRoleByName('user');

            expect(allUsers).toHaveLength(3);

            const superAdmin = allUsers.find(u => u.email === 'super@example.com');
            expect(superAdmin?.roleId).toBe(superadminRole!.id);

            const admin = allUsers.find(u => u.email === 'admin@example.com');
            expect(admin?.roleId).toBe(adminRole!.id);

            const regularUser = allUsers.find(u => u.email === 'user@example.com');
            expect(regularUser?.roleId).toBe(userRole!.id);
        });

        it('should trim whitespace from values', async () =>
        {
            process.env.SPFN_AUTH_ADMIN_EMAILS = ' admin@example.com , user@example.com ';
            process.env.SPFN_AUTH_ADMIN_PASSWORDS = ' admin-pass , user-pass ';
            process.env.SPFN_AUTH_ADMIN_ROLES = ' admin , user ';

            await ensureAdminExists();

            const db = getTestDb();
            const allUsers = await db.select().from(users);

            expect(allUsers).toHaveLength(2);
            expect(allUsers[0].email).toBe('admin@example.com');
            expect(allUsers[1].email).toBe('user@example.com');
        });

        it('should use default role "user" if ADMIN_ROLES not provided', async () =>
        {
            process.env.SPFN_AUTH_ADMIN_EMAILS = 'admin@example.com,user@example.com';
            process.env.SPFN_AUTH_ADMIN_PASSWORDS = 'admin-pass,user-pass';
            // No ADMIN_ROLES

            await ensureAdminExists();

            const db = getTestDb();
            const allUsers = await db.select().from(users);
            const userRole = await getRoleByName('user');

            expect(allUsers).toHaveLength(2);
            expect(allUsers[0].roleId).toBe(userRole!.id);
            expect(allUsers[1].roleId).toBe(userRole!.id);
        });

        it('should handle email/password length mismatch', async () =>
        {
            const consoleErrorSpy = vi.spyOn(authLogger.setup, 'error').mockImplementation(() => 
            {});

            process.env.SPFN_AUTH_ADMIN_EMAILS = 'admin@example.com,user@example.com';
            process.env.SPFN_AUTH_ADMIN_PASSWORDS = 'admin-pass'; // Only 1 password

            await ensureAdminExists();

            const db = getTestDb();
            const allUsers = await db.select().from(users);

            expect(allUsers).toHaveLength(0);
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('length mismatch'),
            );

            consoleErrorSpy.mockRestore();
        });

        it('should skip accounts with empty email or password', async () =>
        {
            const consoleWarnSpy = vi.spyOn(authLogger.setup, 'warn').mockImplementation(() => 
            {});

            process.env.SPFN_AUTH_ADMIN_EMAILS = 'valid@example.com,,user@example.com';
            process.env.SPFN_AUTH_ADMIN_PASSWORDS = 'valid-pass,,user-pass';

            await ensureAdminExists();

            const db = getTestDb();
            const allUsers = await db.select().from(users);

            expect(allUsers).toHaveLength(2);
            expect(consoleWarnSpy).toHaveBeenCalled();

            consoleWarnSpy.mockRestore();
        });

        it('should set passwordChangeRequired to true by default', async () =>
        {
            process.env.SPFN_AUTH_ADMIN_EMAILS = 'admin@example.com';
            process.env.SPFN_AUTH_ADMIN_PASSWORDS = 'admin-pass';

            await ensureAdminExists();

            const db = getTestDb();
            const [admin] = await db.select().from(users).where(eq(users.email, 'admin@example.com'));

            expect(admin.passwordChangeRequired).toBe(true);
        });
    });

    describe('Single Account Format (Legacy)', () =>
    {
        it('should create single superadmin account from ADMIN_EMAIL', async () =>
        {
            process.env.SPFN_AUTH_ADMIN_EMAIL = 'admin@example.com';
            process.env.SPFN_AUTH_ADMIN_PASSWORD = 'AdminPass1!';

            await ensureAdminExists();

            const db = getTestDb();
            const allUsers = await db.select().from(users);
            const superadminRole = await getRoleByName('superadmin');

            expect(allUsers).toHaveLength(1);
            expect(allUsers[0].email).toBe('admin@example.com');
            expect(allUsers[0].roleId).toBe(superadminRole!.id);
            expect(allUsers[0].passwordChangeRequired).toBe(true);
            expect(allUsers[0].emailVerifiedAt).toBeTruthy();
        });

        it('should verify password is correctly hashed', async () =>
        {
            process.env.SPFN_AUTH_ADMIN_EMAIL = 'admin@example.com';
            process.env.SPFN_AUTH_ADMIN_PASSWORD = 'MySecurePass1!';

            await ensureAdminExists();

            const db = getTestDb();
            const [admin] = await db.select().from(users).where(eq(users.email, 'admin@example.com'));

            const isValid = await verifyPassword('MySecurePass1!', admin.passwordHash!);
            expect(isValid).toBe(true);
        });
    });

    describe('Priority and Fallback', () =>
    {
        it('should prioritize JSON format over comma-separated', async () =>
        {
            process.env.SPFN_AUTH_ADMIN_ACCOUNTS = JSON.stringify([
                {
                    email: 'json@example.com',
                    password: 'json-pass',
                    role: 'superadmin',
                },
            ]);
            process.env.SPFN_AUTH_ADMIN_EMAILS = 'csv@example.com';
            process.env.SPFN_AUTH_ADMIN_PASSWORDS = 'csv-pass';

            await ensureAdminExists();

            const db = getTestDb();
            const allUsers = await db.select().from(users);

            expect(allUsers).toHaveLength(1);
            expect(allUsers[0].email).toBe('json@example.com');
        });

        it('should prioritize comma-separated over single account', async () =>
        {
            process.env.SPFN_AUTH_ADMIN_EMAILS = 'csv@example.com';
            process.env.SPFN_AUTH_ADMIN_PASSWORDS = 'csv-pass';
            process.env.SPFN_AUTH_ADMIN_EMAIL = 'single@example.com';
            process.env.SPFN_AUTH_ADMIN_PASSWORD = 'single-pass';

            await ensureAdminExists();

            const db = getTestDb();
            const allUsers = await db.select().from(users);

            expect(allUsers).toHaveLength(1);
            expect(allUsers[0].email).toBe('csv@example.com');
        });
    });

    describe('Duplicate Handling', () =>
    {
        it('should skip existing accounts and not update them', async () =>
        {
            const db = getTestDb();

            // Create existing user manually
            process.env.SPFN_AUTH_ADMIN_EMAIL = 'existing@example.com';
            process.env.SPFN_AUTH_ADMIN_PASSWORD = 'FirstPass1!';
            await ensureAdminExists();

            // Try to create again with different password
            process.env.SPFN_AUTH_ADMIN_PASSWORD = 'SecondPass1!';
            await ensureAdminExists();

            const allUsers = await db.select().from(users);
            expect(allUsers).toHaveLength(1);

            // Password should still be the first one
            const isValidFirst = await verifyPassword('FirstPass1!', allUsers[0].passwordHash!);
            const isValidSecond = await verifyPassword('SecondPass1!', allUsers[0].passwordHash!);

            expect(isValidFirst).toBe(true);
            expect(isValidSecond).toBe(false);
        });

        it('should log correct summary for mixed create/skip', async () =>
        {
            const consoleLogSpy = vi.spyOn(authLogger.setup, 'info').mockImplementation(() => 
            {});

            // Create first account
            process.env.SPFN_AUTH_ADMIN_EMAIL = 'existing@example.com';
            process.env.SPFN_AUTH_ADMIN_PASSWORD = 'AdminPass1!';
            await ensureAdminExists();

            consoleLogSpy.mockClear();

            // Try to create multiple, one existing
            process.env.SPFN_AUTH_ADMIN_ACCOUNTS = JSON.stringify([
                {
                    email: 'existing@example.com',
                    password: 'password',
                },
                {
                    email: 'new@example.com',
                    password: 'password',
                },
            ]);
            await ensureAdminExists();

            // Check summary log
            const summaryLog = consoleLogSpy.mock.calls.find(
                call => call[0]?.includes('Summary'),
            );
            expect(summaryLog).toBeDefined();
            expect(summaryLog![0]).toContain('1 created');
            expect(summaryLog![0]).toContain('1 skipped');

            consoleLogSpy.mockRestore();
        });
    });

    describe('Edge Cases', () =>
    {
        it('should do nothing if no environment variables are set', async () =>
        {
            await ensureAdminExists();

            const db = getTestDb();
            const allUsers = await db.select().from(users);

            expect(allUsers).toHaveLength(0);
        });

        it('should do nothing if only ADMIN_EMAIL is set without password', async () =>
        {
            process.env.SPFN_AUTH_ADMIN_EMAIL = 'admin@example.com';
            // No ADMIN_PASSWORD

            await ensureAdminExists();

            const db = getTestDb();
            const allUsers = await db.select().from(users);

            expect(allUsers).toHaveLength(0);
        });

        it('should handle database errors gracefully', async () =>
        {
            const consoleErrorSpy = vi.spyOn(authLogger.setup, 'error').mockImplementation(() => 
            {});

            process.env.SPFN_AUTH_ADMIN_ACCOUNTS = JSON.stringify([
                {
                    email: 'invalid-email-format', // Invalid email might cause DB error
                    password: 'password123',
                    role: 'invalid-role', // Invalid role will cause check constraint error
                },
            ]);

            await ensureAdminExists();

            // Should not throw, should handle error
            expect(consoleErrorSpy).toHaveBeenCalled();

            consoleErrorSpy.mockRestore();
        });

        it('should auto-verify email for all created accounts', async () =>
        {
            process.env.SPFN_AUTH_ADMIN_ACCOUNTS = JSON.stringify([
                {
                    email: 'admin1@example.com',
                    password: 'password123',
                },
                {
                    email: 'admin2@example.com',
                    password: 'password123',
                },
            ]);

            await ensureAdminExists();

            const db = getTestDb();
            const allUsers = await db.select().from(users);

            allUsers.forEach(user =>
            {
                expect(user.emailVerifiedAt).toBeTruthy();
                expect(user.emailVerifiedAt).toBeInstanceOf(Date);
            });
        });

        it('should set status to active for all created accounts', async () =>
        {
            process.env.SPFN_AUTH_ADMIN_EMAILS = 'admin1@example.com,admin2@example.com';
            process.env.SPFN_AUTH_ADMIN_PASSWORDS = 'pass1,pass2';

            await ensureAdminExists();

            const db = getTestDb();
            const allUsers = await db.select().from(users);

            allUsers.forEach(user =>
            {
                expect(user.status).toBe('active');
            });
        });
    });
});
