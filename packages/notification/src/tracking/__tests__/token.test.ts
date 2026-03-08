/**
 * Token Module Tests
 *
 * Tests HMAC token generation and verification without DB
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock config before importing token module
vi.mock('../../config', () => ({
    getTrackingSecret: vi.fn(() => 'test-secret-key-for-hmac-signing'),
}));

import {
    generateOpenToken,
    generateClickToken,
    verifyOpenToken,
    verifyClickToken,
} from '../token';
import { getTrackingSecret } from '../../config';

describe('tracking/token', () =>
{
    describe('generateOpenToken / verifyOpenToken', () =>
    {
        it('should generate and verify a valid open token', () =>
        {
            const token = generateOpenToken(42);
            const result = verifyOpenToken(token);

            expect(result.valid).toBe(true);
            expect(result.notificationId).toBe(42);
        });

        it('should reject a tampered token', () =>
        {
            const token = generateOpenToken(42);
            const tampered = token.slice(0, -2) + 'xx';
            const result = verifyOpenToken(tampered);

            expect(result.valid).toBe(false);
            expect(result.notificationId).toBeUndefined();
        });

        it('should reject a token without dot separator', () =>
        {
            const result = verifyOpenToken('nodot');
            expect(result.valid).toBe(false);
        });

        it('should reject a click token as open token', () =>
        {
            const clickToken = generateClickToken(42, 3);
            const result = verifyOpenToken(clickToken);

            expect(result.valid).toBe(false);
        });

        it('should handle large notification IDs', () =>
        {
            const token = generateOpenToken(999999999);
            const result = verifyOpenToken(token);

            expect(result.valid).toBe(true);
            expect(result.notificationId).toBe(999999999);
        });
    });

    describe('generateClickToken / verifyClickToken', () =>
    {
        it('should generate and verify a valid click token', () =>
        {
            const token = generateClickToken(42, 5);
            const result = verifyClickToken(token);

            expect(result.valid).toBe(true);
            expect(result.notificationId).toBe(42);
            expect(result.linkIndex).toBe(5);
        });

        it('should reject a tampered click token', () =>
        {
            const token = generateClickToken(42, 5);
            const tampered = 'x' + token.slice(1);
            const result = verifyClickToken(tampered);

            expect(result.valid).toBe(false);
        });

        it('should reject an open token as click token', () =>
        {
            const openToken = generateOpenToken(42);
            const result = verifyClickToken(openToken);

            expect(result.valid).toBe(false);
        });

        it('should preserve linkIndex 0', () =>
        {
            const token = generateClickToken(1, 0);
            const result = verifyClickToken(token);

            expect(result.valid).toBe(true);
            expect(result.linkIndex).toBe(0);
        });
    });

    describe('secret missing', () =>
    {
        it('should throw on generate when secret is not set', () =>
        {
            vi.mocked(getTrackingSecret).mockReturnValueOnce(undefined);
            expect(() => generateOpenToken(1)).toThrow('Tracking secret is not configured');
        });

        it('should return invalid on verify when secret is not set', () =>
        {
            vi.mocked(getTrackingSecret).mockReturnValueOnce(undefined);
            const result = verifyOpenToken('any.token');
            expect(result.valid).toBe(false);
        });
    });

    describe('deterministic tokens', () =>
    {
        it('should produce the same token for the same input', () =>
        {
            const token1 = generateOpenToken(42);
            const token2 = generateOpenToken(42);
            expect(token1).toBe(token2);
        });

        it('should produce different tokens for different inputs', () =>
        {
            const token1 = generateOpenToken(1);
            const token2 = generateOpenToken(2);
            expect(token1).not.toBe(token2);
        });
    });
});
