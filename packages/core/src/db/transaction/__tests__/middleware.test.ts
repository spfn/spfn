/**
 * Transaction Middleware Unit Tests
 *
 * Tests the Transactional middleware with mocking for unit isolation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { Transactional } from '../middleware.js';

// Mock dependencies
vi.mock('../../../logger', () => ({
    logger: {
        child: vi.fn(() => ({
            debug: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            info: vi.fn(),
        })),
    },
}));

vi.mock('../../manager', () => ({
    getDatabase: vi.fn(),
}));

vi.mock('../context.js', () => ({
    runWithTransaction: vi.fn(async (_tx: any, _txId: string, fn: () => Promise<void>) => {
        await fn();
    }),
}));

vi.mock('../../postgres-errors.js', () => ({
    fromPostgresError: vi.fn((error) => error instanceof Error ? error : new Error('Unknown error')),
}));

vi.mock('../../../errors', () => ({
    TransactionError: class TransactionError extends Error {
        statusCode: number;
        context?: any;

        constructor(message: string, statusCode: number = 500, context?: any) {
            super(message);
            this.name = 'TransactionError';
            this.statusCode = statusCode;
            this.context = context;
        }
    },
}));

describe('Transaction Middleware', () =>
{
    beforeEach(() =>
    {
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() =>
    {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    describe('Basic Functionality', () =>
    {
        it('should start and commit transaction on success', async () =>
        {
            const mockTx = {
                execute: vi.fn(),
            };

            const mockWriteDb = {
                transaction: vi.fn(async (callback: any) => {
                    await callback(mockTx);
                }),
            };

            const { getDatabase } = await import('../../manager');
            vi.mocked(getDatabase).mockReturnValue(mockWriteDb as any);

            const app = new Hono();
            app.use('*', Transactional());
            app.get('/test', async (c) => c.json({ success: true }));

            const response = await app.request('/test');

            expect(response.status).toBe(200);
            expect(getDatabase).toHaveBeenCalledWith('write');
            expect(mockWriteDb.transaction).toHaveBeenCalled();
        });

        it('should rollback transaction on error', async () =>
        {
            const mockTx = {
                execute: vi.fn(),
            };

            const mockWriteDb = {
                transaction: vi.fn(async (callback: any) => {
                    await callback(mockTx);
                }),
            };

            const { getDatabase } = await import('../../manager');
            vi.mocked(getDatabase).mockReturnValue(mockWriteDb as any);

            const app = new Hono();
            app.use('*', Transactional());
            app.get('/test', async () => {
                throw new Error('Test error');
            });

            app.onError((err, c) => {
                return c.json({ error: err.message }, 500);
            });

            const response = await app.request('/test');

            expect(response.status).toBe(500);
            const body = await response.json();
            expect(body.error).toBe('Test error');
        });

        it('should throw TransactionError when database not initialized', async () =>
        {
            const { getDatabase } = await import('../../manager');
            vi.mocked(getDatabase).mockReturnValue(undefined);

            const app = new Hono();
            app.use('*', Transactional());
            app.get('/test', async (c) => c.json({ success: true }));

            app.onError((err, c) => {
                return c.json({
                    error: err.message,
                    name: err.name,
                }, 500);
            });

            const response = await app.request('/test');

            expect(response.status).toBe(500);
            const body = await response.json();
            expect(body.name).toBe('TransactionError');
            expect(body.error).toContain('Database not initialized');
        });

        it('should detect and rollback on context.error', async () =>
        {
            const mockTx = {
                execute: vi.fn(),
            };

            const mockWriteDb = {
                transaction: vi.fn(async (callback: any) => {
                    await callback(mockTx);
                }),
            };

            const { getDatabase } = await import('../../manager');
            vi.mocked(getDatabase).mockReturnValue(mockWriteDb as any);

            const app = new Hono();
            app.use('*', Transactional());
            app.get('/test', async (c) => {
                // Simulate Hono setting context.error
                (c as any).error = new Error('Context error');
                return c.json({ success: true });
            });

            app.onError((err, c) => {
                return c.json({ error: err.message }, 500);
            });

            const response = await app.request('/test');

            expect(response.status).toBe(500);
            const body = await response.json();
            expect(body.error).toBe('Context error');
        });
    });

    describe('Options', () =>
    {
        it('should respect custom slowThreshold', async () =>
        {
            const mockTx = { execute: vi.fn() };
            const mockWriteDb = {
                transaction: vi.fn(async (callback: any) => {
                    await callback(mockTx);
                }),
            };

            const { getDatabase } = await import('../../manager');
            vi.mocked(getDatabase).mockReturnValue(mockWriteDb as any);

            const { logger } = await import('../../../logger');
            const mockLogger = {
                debug: vi.fn(),
                warn: vi.fn(),
                error: vi.fn(),
                info: vi.fn(),
            };
            vi.mocked(logger.child).mockReturnValue(mockLogger as any);

            const app = new Hono();
            app.use('*', Transactional({ slowThreshold: 100 }));
            app.get('/slow', async (c) => {
                // Simulate slow operation
                await new Promise(resolve => setTimeout(resolve, 150));
                return c.json({ success: true });
            });

            const promise = app.request('/slow');

            // Advance time to simulate slow operation
            await vi.advanceTimersByTimeAsync(150);

            await promise;

            // Should log warning for slow transaction
            expect(mockLogger.warn).toHaveBeenCalledWith(
                'Slow transaction committed',
                expect.objectContaining({
                    threshold: '100ms',
                })
            );
        });

        it('should disable logging when enableLogging=false', async () =>
        {
            const mockTx = { execute: vi.fn() };
            const mockWriteDb = {
                transaction: vi.fn(async (callback: any) => {
                    await callback(mockTx);
                }),
            };

            const { getDatabase } = await import('../../manager');
            vi.mocked(getDatabase).mockReturnValue(mockWriteDb as any);

            const { logger } = await import('../../../logger');
            const mockLogger = {
                debug: vi.fn(),
                warn: vi.fn(),
                error: vi.fn(),
                info: vi.fn(),
            };
            vi.mocked(logger.child).mockReturnValue(mockLogger as any);

            const app = new Hono();
            app.use('*', Transactional({ enableLogging: false }));
            app.get('/test', async (c) => c.json({ success: true }));

            await app.request('/test');

            // Should not log anything
            expect(mockLogger.debug).not.toHaveBeenCalled();
            expect(mockLogger.warn).not.toHaveBeenCalled();
            expect(mockLogger.error).not.toHaveBeenCalled();
        });

        it('should enforce timeout when configured', async () =>
        {
            const mockTx = { execute: vi.fn() };
            const mockWriteDb = {
                transaction: vi.fn(async (callback: any) => {
                    await callback(mockTx);
                }),
            };

            const { getDatabase } = await import('../../manager');
            vi.mocked(getDatabase).mockReturnValue(mockWriteDb as any);

            const app = new Hono();
            app.use('*', Transactional({ timeout: 100 }));
            app.get('/timeout', async (c) => {
                await new Promise(resolve => setTimeout(resolve, 200));
                return c.json({ success: true });
            });

            app.onError((err, c) => {
                return c.json({
                    error: err.message,
                    name: err.name,
                }, 500);
            });

            const promise = app.request('/timeout');

            // Advance time past timeout
            await vi.advanceTimersByTimeAsync(100);

            const response = await promise;

            expect(response.status).toBe(500);
            const body = await response.json();
            expect(body.name).toBe('TransactionError');
            expect(body.error).toContain('Transaction timeout');
        });

        it('should disable timeout when timeout=0', async () =>
        {
            const mockTx = { execute: vi.fn() };
            const mockWriteDb = {
                transaction: vi.fn(async (callback: any) => {
                    await callback(mockTx);
                }),
            };

            const { getDatabase } = await import('../../manager');
            vi.mocked(getDatabase).mockReturnValue(mockWriteDb as any);

            const app = new Hono();
            app.use('*', Transactional({ timeout: 0 }));
            app.get('/long', async (c) => {
                await new Promise(resolve => setTimeout(resolve, 100));
                return c.json({ success: true });
            });

            const promise = app.request('/long');

            await vi.advanceTimersByTimeAsync(100);

            const response = await promise;

            expect(response.status).toBe(200);
        });

        it('should use default timeout from environment variable', async () =>
        {
            // Save original env
            const originalTimeout = process.env.TRANSACTION_TIMEOUT;
            process.env.TRANSACTION_TIMEOUT = '5000';

            const mockTx = { execute: vi.fn() };
            const mockWriteDb = {
                transaction: vi.fn(async (callback: any) => {
                    await callback(mockTx);
                }),
            };

            const { getDatabase } = await import('../../manager');
            vi.mocked(getDatabase).mockReturnValue(mockWriteDb as any);

            // Re-import to pick up new env var
            vi.resetModules();
            const { Transactional: TransactionalFresh } = await import('../middleware.js');

            const app = new Hono();
            app.use('*', TransactionalFresh());
            app.get('/test', async (c) => {
                await new Promise(resolve => setTimeout(resolve, 6000));
                return c.json({ success: true });
            });

            app.onError((err, c) => {
                return c.json({
                    error: err.message,
                }, 500);
            });

            const promise = app.request('/test');

            await vi.advanceTimersByTimeAsync(5000);

            const response = await promise;

            // Should timeout at 5000ms (from env var)
            expect(response.status).toBe(500);
            const body = await response.json();
            expect(body.error).toContain('timeout after 5000ms');

            // Restore env
            if (originalTimeout === undefined) {
                delete process.env.TRANSACTION_TIMEOUT;
            } else {
                process.env.TRANSACTION_TIMEOUT = originalTimeout;
            }
        });
    });

    describe('Error Handling', () =>
    {
        it('should convert PostgreSQL errors', async () =>
        {
            const mockTx = { execute: vi.fn() };
            const mockWriteDb = {
                transaction: vi.fn(async (callback: any) => {
                    await callback(mockTx);
                }),
            };

            const { getDatabase } = await import('../../manager');
            vi.mocked(getDatabase).mockReturnValue(mockWriteDb as any);

            const { fromPostgresError } = await import('../../postgres-errors.js');
            const pgError = new Error('PostgreSQL error');
            const convertedError = new Error('Converted error');
            vi.mocked(fromPostgresError).mockReturnValue(convertedError);

            const app = new Hono();
            app.use('*', Transactional());
            app.get('/test', async () => {
                throw pgError;
            });

            app.onError((err, c) => {
                return c.json({ error: err.message }, 500);
            });

            const response = await app.request('/test');

            expect(response.status).toBe(500);
            expect(fromPostgresError).toHaveBeenCalledWith(pgError);
            const body = await response.json();
            expect(body.error).toBe('Converted error');
        });

        it('should not convert TransactionError', async () =>
        {
            const mockTx = { execute: vi.fn() };
            const mockWriteDb = {
                transaction: vi.fn(async (callback: any) => {
                    await callback(mockTx);
                }),
            };

            const { getDatabase } = await import('../../manager');
            vi.mocked(getDatabase).mockReturnValue(mockWriteDb as any);

            const { TransactionError } = await import('../../../errors');
            const { fromPostgresError } = await import('../../postgres-errors.js');

            const app = new Hono();
            app.use('*', Transactional());
            app.get('/test', async () => {
                throw new TransactionError('Transaction error', 500);
            });

            app.onError((err, c) => {
                return c.json({
                    error: err.message,
                    name: err.name,
                }, 500);
            });

            const response = await app.request('/test');

            expect(response.status).toBe(500);
            expect(fromPostgresError).not.toHaveBeenCalled();
            const body = await response.json();
            expect(body.name).toBe('TransactionError');
            expect(body.error).toBe('Transaction error');
        });
    });

    describe('Logging', () =>
    {
        it('should log transaction start', async () =>
        {
            const mockTx = { execute: vi.fn() };
            const mockWriteDb = {
                transaction: vi.fn(async (callback: any) => {
                    await callback(mockTx);
                }),
            };

            const { getDatabase } = await import('../../manager');
            vi.mocked(getDatabase).mockReturnValue(mockWriteDb as any);

            const { logger } = await import('../../../logger');
            const mockLogger = {
                debug: vi.fn(),
                warn: vi.fn(),
                error: vi.fn(),
                info: vi.fn(),
            };
            vi.mocked(logger.child).mockReturnValue(mockLogger as any);

            const app = new Hono();
            app.use('*', Transactional());
            app.get('/test', async (c) => c.json({ success: true }));

            await app.request('/test');

            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Transaction started',
                expect.objectContaining({
                    route: 'GET /test',
                })
            );
        });

        it('should log transaction commit', async () =>
        {
            const mockTx = { execute: vi.fn() };
            const mockWriteDb = {
                transaction: vi.fn(async (callback: any) => {
                    await callback(mockTx);
                }),
            };

            const { getDatabase } = await import('../../manager');
            vi.mocked(getDatabase).mockReturnValue(mockWriteDb as any);

            const { logger } = await import('../../../logger');
            const mockLogger = {
                debug: vi.fn(),
                warn: vi.fn(),
                error: vi.fn(),
                info: vi.fn(),
            };
            vi.mocked(logger.child).mockReturnValue(mockLogger as any);

            const app = new Hono();
            app.use('*', Transactional());
            app.get('/test', async (c) => c.json({ success: true }));

            await app.request('/test');

            expect(mockLogger.debug).toHaveBeenCalledWith(
                'Transaction committed',
                expect.objectContaining({
                    route: 'GET /test',
                })
            );
        });

        it('should log transaction rollback', async () =>
        {
            const mockTx = { execute: vi.fn() };
            const mockWriteDb = {
                transaction: vi.fn(async (callback: any) => {
                    await callback(mockTx);
                }),
            };

            const { getDatabase } = await import('../../manager');
            vi.mocked(getDatabase).mockReturnValue(mockWriteDb as any);

            const { logger } = await import('../../../logger');
            const mockLogger = {
                debug: vi.fn(),
                warn: vi.fn(),
                error: vi.fn(),
                info: vi.fn(),
            };
            vi.mocked(logger.child).mockReturnValue(mockLogger as any);

            const testError = new Error('Test error');
            const { fromPostgresError } = await import('../../postgres-errors.js');
            vi.mocked(fromPostgresError).mockReturnValue(testError);

            const app = new Hono();
            app.use('*', Transactional());
            app.get('/test', async () => {
                throw testError;
            });

            app.onError((err, c) => {
                return c.json({ error: err.message }, 500);
            });

            await app.request('/test');

            expect(mockLogger.error).toHaveBeenCalledWith(
                'Transaction rolled back',
                expect.objectContaining({
                    route: 'GET /test',
                    error: 'Test error',
                })
            );
        });
    });
});