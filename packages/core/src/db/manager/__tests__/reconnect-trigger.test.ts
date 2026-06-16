/**
 * Reconnect Trigger Unit Tests
 *
 * Covers:
 *  - isConnectionLevelError classifier (direct code / errno / SQLSTATE / cause chain)
 *  - reportDatabaseError sliding-window threshold
 *  - WeakSet dedup across error-chain re-wrapping (repo → middleware)
 *  - resetConnectionErrorCounter
 *  - isReconnectingNow gating
 *  - never-throw invariant (bad inputs must not bubble)
 *
 * Strategy: mock ./health-check so we can observe `triggerForceReconnect`
 * without running the real reconnect logic, and flip `isReconnectingNow`
 * per test. Time is faked via vi.setSystemTime so the sliding window can
 * be exercised deterministically.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Must import ConnectionError from the SAME path that reconnect-trigger
// uses internally, otherwise `instanceof` fails because vitest resolves
// relative and alias paths to distinct module copies.
import { ConnectionError } from '@spfn/core/errors';

// Mock logger so we do not spam stderr during assertions.
vi.mock('../../../logger', () => ({
    logger: {
        child: vi.fn(() => ({
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
        })),
    },
}));

// Mock health-check's two interaction points. triggerForceReconnect must
// return a Promise (reporter chains .catch on it).
const mockTriggerForceReconnect = vi.fn(async (_reason: string) => true);
const mockIsReconnectingNow = vi.fn(() => false);

vi.mock('../health-check', () => ({
    triggerForceReconnect: (reason: string) => mockTriggerForceReconnect(reason),
    isReconnectingNow: () => mockIsReconnectingNow(),
}));

// Import AFTER mocks are installed.
import {
    isConnectionLevelError,
    reportDatabaseError,
    resetConnectionErrorCounter,
} from '../reconnect-trigger';

describe('reconnect-trigger', () =>
{
    beforeEach(() =>
    {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
        mockTriggerForceReconnect.mockClear();
        mockTriggerForceReconnect.mockResolvedValue(true);
        mockIsReconnectingNow.mockClear();
        mockIsReconnectingNow.mockReturnValue(false);
        resetConnectionErrorCounter();
    });

    afterEach(() =>
    {
        vi.useRealTimers();
    });

    // ========================================================================
    // isConnectionLevelError
    // ========================================================================

    describe('isConnectionLevelError', () =>
    {
        it('returns false for null / undefined / primitives', () =>
        {
            expect(isConnectionLevelError(null)).toBe(false);
            expect(isConnectionLevelError(undefined)).toBe(false);
            expect(isConnectionLevelError('ECONNRESET')).toBe(false);
            expect(isConnectionLevelError(42)).toBe(false);
        });

        it('returns false for plain query / constraint errors', () =>
        {
            const syntaxErr = Object.assign(new Error('syntax error'), { code: '42601' });
            const uniqueErr = Object.assign(new Error('unique violation'), { code: '23505' });
            expect(isConnectionLevelError(syntaxErr)).toBe(false);
            expect(isConnectionLevelError(uniqueErr)).toBe(false);
        });

        it('detects ConnectionError instances', () =>
        {
            const err = new ConnectionError({ message: 'pool dead' });
            expect(isConnectionLevelError(err)).toBe(true);
        });

        it('detects postgres.js driver codes', () =>
        {
            const codes = [
                'CONNECTION_ENDED',
                'CONNECTION_CLOSED',
                'CONNECTION_DESTROYED',
                'CONNECT_TIMEOUT',
                'CONNECTION_CONNECT_TIMEOUT',
            ];
            for (const code of codes)
            {
                const err = Object.assign(new Error('boom'), { code });
                expect(isConnectionLevelError(err)).toBe(true);
            }
        });

        it('detects Node network errno codes', () =>
        {
            const codes = [
                'ECONNRESET',
                'ECONNREFUSED',
                'EPIPE',
                'ETIMEDOUT',
                'EHOSTUNREACH',
                'ENETUNREACH',
                'ENOTFOUND',
            ];
            for (const code of codes)
            {
                const err = Object.assign(new Error('network'), { code });
                expect(isConnectionLevelError(err)).toBe(true);
            }
        });

        it('detects PG SQLSTATE class 08 (connection exception)', () =>
        {
            for (const code of ['08000', '08001', '08003', '08006', '08P01'])
            {
                const err = Object.assign(new Error('pg'), { code });
                expect(isConnectionLevelError(err)).toBe(true);
            }
        });

        it('detects PG SQLSTATE 53300 and 57P01..03', () =>
        {
            for (const code of ['53300', '57P01', '57P02', '57P03'])
            {
                const err = Object.assign(new Error('pg'), { code });
                expect(isConnectionLevelError(err)).toBe(true);
            }
        });

        it('does NOT treat generic 57000 as connection-level', () =>
        {
            // Only the admin/crash/cannot-connect members of class 57 count.
            const err = Object.assign(new Error('pg'), { code: '57014' }); // query_canceled
            expect(isConnectionLevelError(err)).toBe(false);
        });

        it('walks the cause chain for nested driver errors', () =>
        {
            const inner = Object.assign(new Error('socket closed'), { code: 'ECONNRESET' });
            const wrapped = new Error('wrapped: socket closed');
            (wrapped as { cause?: unknown }).cause = inner;

            expect(isConnectionLevelError(wrapped)).toBe(true);
        });

        it('walks through repository-style nesting (original key)', () =>
        {
            const inner = Object.assign(new Error('pool'), { code: 'CONNECTION_ENDED' });
            const wrapped = Object.assign(new Error('repository failed'), { original: inner });
            expect(isConnectionLevelError(wrapped)).toBe(true);
        });

        it('tolerates cyclic cause chains without infinite loop', () =>
        {
            const a = new Error('a') as { cause?: unknown };
            const b = new Error('b') as { cause?: unknown };
            a.cause = b;
            b.cause = a;
            // Neither has a connection code — must return false and terminate.
            expect(isConnectionLevelError(a)).toBe(false);
        });
    });

    // ========================================================================
    // reportDatabaseError — sliding window
    // ========================================================================

    describe('reportDatabaseError — sliding window', () =>
    {
        const makeConnErr = () =>
            Object.assign(new Error('conn'), { code: 'ECONNRESET' });

        it('is a no-op for non-connection errors', () =>
        {
            const queryErr = Object.assign(new Error('syntax'), { code: '42601' });
            for (let i = 0; i < 10; i++)
            {
                reportDatabaseError(queryErr);
            }
            expect(mockTriggerForceReconnect).not.toHaveBeenCalled();
        });

        it('does not trigger below threshold (default: 3)', () =>
        {
            reportDatabaseError(makeConnErr());
            reportDatabaseError(makeConnErr());
            expect(mockTriggerForceReconnect).not.toHaveBeenCalled();
        });

        it('triggers at threshold within window', () =>
        {
            reportDatabaseError(makeConnErr());
            reportDatabaseError(makeConnErr());
            reportDatabaseError(makeConnErr());
            expect(mockTriggerForceReconnect).toHaveBeenCalledTimes(1);
            expect(mockTriggerForceReconnect).toHaveBeenCalledWith('query_error_threshold');
        });

        it('resets the counter immediately after triggering', () =>
        {
            reportDatabaseError(makeConnErr());
            reportDatabaseError(makeConnErr());
            reportDatabaseError(makeConnErr());
            expect(mockTriggerForceReconnect).toHaveBeenCalledTimes(1);

            // Next 2 errors (still within window) must NOT re-trigger yet.
            reportDatabaseError(makeConnErr());
            reportDatabaseError(makeConnErr());
            expect(mockTriggerForceReconnect).toHaveBeenCalledTimes(1);

            // Third new error crosses threshold again.
            reportDatabaseError(makeConnErr());
            expect(mockTriggerForceReconnect).toHaveBeenCalledTimes(2);
        });

        it('ages out errors that fall outside the window', () =>
        {
            reportDatabaseError(makeConnErr()); // t=0
            reportDatabaseError(makeConnErr()); // t=0

            // Advance past the 10s window.
            vi.advanceTimersByTime(11_000);

            // The two old entries are pruned on next report → not enough to fire.
            reportDatabaseError(makeConnErr());
            expect(mockTriggerForceReconnect).not.toHaveBeenCalled();

            reportDatabaseError(makeConnErr());
            reportDatabaseError(makeConnErr());
            expect(mockTriggerForceReconnect).toHaveBeenCalledTimes(1);
        });

        it('skips counting while reconnect is already in progress', () =>
        {
            mockIsReconnectingNow.mockReturnValue(true);

            for (let i = 0; i < 10; i++)
            {
                reportDatabaseError(makeConnErr());
            }
            expect(mockTriggerForceReconnect).not.toHaveBeenCalled();

            // Once the reconnect finishes, the counter must start from zero
            // (previous reports were discarded, not accumulated).
            mockIsReconnectingNow.mockReturnValue(false);
            reportDatabaseError(makeConnErr());
            reportDatabaseError(makeConnErr());
            expect(mockTriggerForceReconnect).not.toHaveBeenCalled();

            reportDatabaseError(makeConnErr());
            expect(mockTriggerForceReconnect).toHaveBeenCalledTimes(1);
        });

        it('survives triggerForceReconnect rejecting', async () =>
        {
            mockTriggerForceReconnect.mockRejectedValueOnce(new Error('force failed'));

            reportDatabaseError(makeConnErr());
            reportDatabaseError(makeConnErr());
            expect(() => reportDatabaseError(makeConnErr())).not.toThrow();
            expect(mockTriggerForceReconnect).toHaveBeenCalledTimes(1);

            // Let the rejected promise's .catch handler run.
            await vi.runOnlyPendingTimersAsync().catch(() => 
            {});
        });
    });

    // ========================================================================
    // WeakSet dedup
    // ========================================================================

    describe('reportDatabaseError — dedup across error chain', () =>
    {
        it('counts the same error object only once', () =>
        {
            const err = Object.assign(new Error('conn'), { code: 'ECONNRESET' });

            reportDatabaseError(err);
            reportDatabaseError(err);
            reportDatabaseError(err);
            // Three reports, same object → one count → below threshold → no trigger.
            expect(mockTriggerForceReconnect).not.toHaveBeenCalled();
        });

        it('dedups when middleware re-catches a repository-wrapped error', () =>
        {
            // Simulates the real flow: three distinct failed requests, each
            // reported twice — once by repository.withContext (raw pg error)
            // and once by transaction middleware (the RepositoryError wrapper
            // whose `cause` points at the same pg error).
            // Expected: 3 logical failures counted, 6 physical calls, trigger once.
            for (let i = 0; i < 3; i++)
            {
                const inner = Object.assign(new Error(`pool dead ${i}`), { code: 'ECONNRESET' });
                const wrapper = new Error(`RepositoryError ${i}`);
                (wrapper as { cause?: unknown }).cause = inner;

                reportDatabaseError(inner);    // repo.withContext
                reportDatabaseError(wrapper);  // middleware catch (same inner)
            }

            expect(mockTriggerForceReconnect).toHaveBeenCalledTimes(1);
        });

        it('counts the same underlying failure only once even if reported many times', () =>
        {
            // Invariant: a single physical failure is one logical failure,
            // regardless of how many catch blocks it passes through. Reporting
            // the SAME inner error object 10 times must not trip the threshold.
            const inner = Object.assign(new Error('pool dead'), { code: 'ECONNRESET' });
            for (let i = 0; i < 10; i++)
            {
                reportDatabaseError(inner);
                const wrapper = new Error(`layer ${i}`);
                (wrapper as { cause?: unknown }).cause = inner;
                reportDatabaseError(wrapper);
            }
            expect(mockTriggerForceReconnect).not.toHaveBeenCalled();
        });

        it('treats fresh wrappers (different inner error) as distinct', () =>
        {
            // Different underlying errors, each wrapped — must all count.
            const mkWrapped = () =>
            {
                const inner = Object.assign(new Error('net'), { code: 'ECONNRESET' });
                const outer = new Error('wrapped');
                (outer as { cause?: unknown }).cause = inner;

                return outer;
            };

            reportDatabaseError(mkWrapped());
            reportDatabaseError(mkWrapped());
            reportDatabaseError(mkWrapped());
            expect(mockTriggerForceReconnect).toHaveBeenCalledTimes(1);
        });
    });

    // ========================================================================
    // Robustness
    // ========================================================================

    describe('reportDatabaseError — never throws', () =>
    {
        it('handles null / undefined / primitives without throwing', () =>
        {
            expect(() => reportDatabaseError(null)).not.toThrow();
            expect(() => reportDatabaseError(undefined)).not.toThrow();
            expect(() => reportDatabaseError('boom')).not.toThrow();
            expect(() => reportDatabaseError(42)).not.toThrow();
            expect(mockTriggerForceReconnect).not.toHaveBeenCalled();
        });

        it('handles frozen objects in the error chain', () =>
        {
            const inner = Object.freeze(
                Object.assign(new Error('frozen'), { code: 'ECONNRESET' }),
            );
            expect(() => reportDatabaseError(inner)).not.toThrow();
        });
    });

    describe('resetConnectionErrorCounter', () =>
    {
        it('clears accumulated counts', () =>
        {
            const err = Object.assign(new Error('conn'), { code: 'ECONNRESET' });

            reportDatabaseError(err);
            reportDatabaseError({ code: 'ECONNRESET' });
            resetConnectionErrorCounter();

            // Need 3 fresh errors to trigger.
            reportDatabaseError({ code: 'ECONNRESET' });
            reportDatabaseError({ code: 'ECONNRESET' });
            expect(mockTriggerForceReconnect).not.toHaveBeenCalled();

            reportDatabaseError({ code: 'ECONNRESET' });
            expect(mockTriggerForceReconnect).toHaveBeenCalledTimes(1);
        });
    });
});
