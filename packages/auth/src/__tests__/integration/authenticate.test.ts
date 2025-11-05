/**
 * @spfn/auth - Authentication Middleware Integration Tests
 *
 * Tests for authenticate middleware with database operations
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { authenticate } from '@/server/middleware/authenticate';
import { generateKeyPair, generateClientToken } from '@/client/lib/crypto';
import type { Context, Next } from 'hono';
import * as dbModule from '@spfn/core/db';
import * as jwtHelpers from '@/server/helpers/jwt';

// Mock database functions
vi.mock('@spfn/core/db', async (importOriginal) =>
{
    const actual = await importOriginal() as any;
    return {
        ...actual,
        getDatabase: vi.fn(),
        findOne: vi.fn(),
    };
});

// Mock JWT verification
vi.mock('@/server/helpers/jwt', async (importOriginal) =>
{
    const actual = await importOriginal() as any;
    return {
        ...actual,
        verifyClientToken: vi.fn(),
    };
});

describe('Authenticate Middleware', () =>
{
    let mockContext: Partial<Context>;
    let mockNext: Next;

    beforeEach(() =>
    {
        // Reset mocks
        vi.clearAllMocks();

        // Mock next function
        mockNext = vi.fn();

        // Mock context
        mockContext = {
            req: {
                header: vi.fn(),
            } as any,
            json: vi.fn((data, status) => ({ data, status })),
            set: vi.fn(),
            raw: {
                get: vi.fn(),
            } as any,
        };
    });

    describe('Header Validation', () =>
    {
        it('should reject request without Authorization header', async () =>
        {
            (mockContext.req!.header as any).mockReturnValue(undefined);

            await expect(authenticate(mockContext as Context, mockNext))
                .rejects
                .toThrow('Missing or invalid authorization header');

            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should reject request with invalid Authorization format', async () =>
        {
            (mockContext.req!.header as any).mockImplementation((name: string) =>
            {
                if (name === 'Authorization') return 'InvalidFormat token';
                return undefined;
            });

            await expect(authenticate(mockContext as Context, mockNext))
                .rejects
                .toThrow('Missing or invalid authorization header');

            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should reject request without X-Key-Id header', async () =>
        {
            (mockContext.req!.header as any).mockImplementation((name: string) =>
            {
                if (name === 'Authorization') return 'Bearer validtoken';
                return undefined;
            });

            await expect(authenticate(mockContext as Context, mockNext))
                .rejects
                .toThrow('Missing X-Key-Id header');

            expect(mockNext).not.toHaveBeenCalled();
        });
    });

    describe('Key Validation', () =>
    {
        beforeEach(() =>
        {
            // Setup valid headers
            (mockContext.req!.header as any).mockImplementation((name: string) =>
            {
                if (name === 'Authorization') return 'Bearer validtoken';
                if (name === 'X-Key-Id') return 'test-key-id';
                return undefined;
            });
        });

        it('should reject request with invalid or revoked key', async () =>
        {
            // Mock database to return empty result (key not found)
            vi.mocked(dbModule.getDatabase).mockReturnValue({
                select: vi.fn().mockReturnValue({
                    from: vi.fn().mockReturnValue({
                        where: vi.fn().mockResolvedValue([]), // No key found
                    }),
                }),
            } as any);

            await expect(authenticate(mockContext as Context, mockNext))
                .rejects
                .toThrow('Invalid or revoked key');

            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should reject request with expired key', async () =>
        {
            // Mock database to return expired key
            const expiredDate = new Date();
            expiredDate.setDate(expiredDate.getDate() - 1); // Yesterday

            vi.mocked(dbModule.getDatabase).mockReturnValue({
                select: vi.fn().mockReturnValue({
                    from: vi.fn().mockReturnValue({
                        where: vi.fn().mockResolvedValue([
                            {
                                id: 1,
                                keyId: 'test-key-id',
                                userId: 1,
                                publicKey: 'mock-public-key',
                                algorithm: 'ES256',
                                isActive: true,
                                expiresAt: expiredDate,
                            },
                        ]),
                    }),
                }),
            } as any);

            await expect(authenticate(mockContext as Context, mockNext))
                .rejects
                .toThrow('Public key has expired');

            expect(mockNext).not.toHaveBeenCalled();
        });
    });

    describe('User Validation', () =>
    {
        beforeEach(() =>
        {
            // Setup valid headers
            (mockContext.req!.header as any).mockImplementation((name: string) =>
            {
                if (name === 'Authorization') return 'Bearer validtoken';
                if (name === 'X-Key-Id') return 'test-key-id';
                return undefined;
            });

            // Mock JWT verification to succeed
            vi.mocked(jwtHelpers.verifyClientToken).mockReturnValue(undefined);

            // Mock valid key
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + 90);

            vi.mocked(dbModule.getDatabase).mockReturnValue({
                select: vi.fn().mockReturnValue({
                    from: vi.fn().mockReturnValue({
                        where: vi.fn().mockResolvedValue([
                            {
                                id: 1,
                                keyId: 'test-key-id',
                                userId: 1,
                                publicKey: 'mock-public-key',
                                algorithm: 'ES256',
                                isActive: true,
                                expiresAt: futureDate,
                            },
                        ]),
                    }),
                }),
                update: vi.fn().mockReturnValue({
                    set: vi.fn().mockReturnValue({
                        where: vi.fn().mockReturnValue({
                            execute: vi.fn().mockResolvedValue(undefined),
                        }),
                    }),
                }),
            } as any);
        });

        it('should reject request if user not found', async () =>
        {
            // Mock findOne to return null (user not found)
            vi.mocked(dbModule.findOne).mockResolvedValue(null);

            await expect(authenticate(mockContext as Context, mockNext))
                .rejects
                .toThrow('User not found');

            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should reject request if user account is inactive', async () =>
        {
            // Mock findOne to return inactive user
            vi.mocked(dbModule.findOne).mockResolvedValue({
                id: 1,
                email: 'test@example.com',
                status: 'inactive',
            } as any);

            await expect(authenticate(mockContext as Context, mockNext))
                .rejects
                .toThrow('Account is inactive');

            expect(mockNext).not.toHaveBeenCalled();
        });

        it('should reject request if user account is suspended', async () =>
        {
            // Mock findOne to return suspended user
            vi.mocked(dbModule.findOne).mockResolvedValue({
                id: 1,
                email: 'test@example.com',
                status: 'suspended',
            } as any);

            await expect(authenticate(mockContext as Context, mockNext))
                .rejects
                .toThrow('Account is suspended');

            expect(mockNext).not.toHaveBeenCalled();
        });
    });

    describe('Successful Authentication', () =>
    {
        it('should pass authentication with valid token and active user', async () =>
        {
            // Generate real key pair for valid token
            const { privateKey, publicKey, keyId, algorithm } = generateKeyPair('ES256');
            const token = generateClientToken(
                { userId: '1', action: 'test' },
                privateKey,
                algorithm
            );

            // Setup valid headers with real token
            (mockContext.req!.header as any).mockImplementation((name: string) =>
            {
                if (name === 'Authorization') return `Bearer ${token}`;
                if (name === 'X-Key-Id') return keyId;
                return undefined;
            });

            // Mock valid key with real public key
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + 90);

            vi.mocked(dbModule.getDatabase).mockReturnValue({
                select: vi.fn().mockReturnValue({
                    from: vi.fn().mockReturnValue({
                        where: vi.fn().mockResolvedValue([
                            {
                                id: 1,
                                keyId,
                                userId: 1,
                                publicKey,
                                algorithm,
                                isActive: true,
                                expiresAt: futureDate,
                            },
                        ]),
                    }),
                }),
                update: vi.fn().mockReturnValue({
                    set: vi.fn().mockReturnValue({
                        where: vi.fn().mockReturnValue({
                            execute: vi.fn().mockResolvedValue(undefined),
                        }),
                    }),
                }),
            } as any);

            // Mock active user
            vi.mocked(dbModule.findOne).mockResolvedValue({
                id: 1,
                email: 'test@example.com',
                status: 'active',
            } as any);

            await authenticate(mockContext as Context, mockNext);

            // Should set user data in context
            expect(mockContext.set).toHaveBeenCalledWith('auth', expect.objectContaining({
                userId: '1',
                keyId,
            }));

            // Should call next middleware
            expect(mockNext).toHaveBeenCalled();
        });
    });
});