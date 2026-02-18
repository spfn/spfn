/**
 * @spfn/monitor - Fingerprint Tests
 *
 * Verifies deterministic fingerprint generation
 */

import { describe, it, expect } from 'vitest';
import { generateFingerprint } from '../../server/services/error-tracking.service';

describe('generateFingerprint', () =>
{
    it('should generate a 16-character hex string', () =>
    {
        const fp = generateFingerprint('Error', 'something went wrong', '/api/test');

        expect(fp).toHaveLength(16);
        expect(fp).toMatch(/^[0-9a-f]{16}$/);
    });

    it('should be deterministic (same input → same output)', () =>
    {
        const fp1 = generateFingerprint('TypeError', 'null is not an object', '/api/users');
        const fp2 = generateFingerprint('TypeError', 'null is not an object', '/api/users');

        expect(fp1).toBe(fp2);
    });

    it('should produce different fingerprints for different names', () =>
    {
        const fp1 = generateFingerprint('TypeError', 'something failed', '/api/test');
        const fp2 = generateFingerprint('RangeError', 'something failed', '/api/test');

        expect(fp1).not.toBe(fp2);
    });

    it('should produce different fingerprints for different messages', () =>
    {
        const fp1 = generateFingerprint('Error', 'message A', '/api/test');
        const fp2 = generateFingerprint('Error', 'message B', '/api/test');

        expect(fp1).not.toBe(fp2);
    });

    it('should produce different fingerprints for different paths', () =>
    {
        const fp1 = generateFingerprint('Error', 'same message', '/api/users');
        const fp2 = generateFingerprint('Error', 'same message', '/api/posts');

        expect(fp1).not.toBe(fp2);
    });

    it('should handle empty strings', () =>
    {
        const fp = generateFingerprint('', '', '');

        expect(fp).toHaveLength(16);
        expect(fp).toMatch(/^[0-9a-f]{16}$/);
    });

    it('should handle special characters', () =>
    {
        const fp = generateFingerprint(
            'Error',
            'Cannot read property "foo" of undefined',
            '/api/users?id=123&name=test'
        );

        expect(fp).toHaveLength(16);
        expect(fp).toMatch(/^[0-9a-f]{16}$/);
    });
});
