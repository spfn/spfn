/**
 * @spfn/auth - Ops token shape unit tests
 *
 * An application that admits both an ops token and a user session on one
 * route sorts them by shape before either is verified. That sorting reads a
 * raw header, so the predicate answers for anything a header can be — a JWT,
 * an empty string, nothing at all — and never throws.
 *
 * Shape is not validity: `isOpsToken` says only which credential this is,
 * and `verifyOpsTokenService` (DB-backed, covered in the integration suite)
 * decides whether it still authorizes anything.
 */

import { describe, it, expect } from 'vitest';

import { isOpsToken, OPS_TOKEN_PREFIX } from '../../server/services/ops-token.service';

const ISSUED = OPS_TOKEN_PREFIX + '0'.repeat(64);
const SESSION_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.c2ln';

describe('OPS_TOKEN_PREFIX', () =>
{
    it('is the value the CLI and the service both mint against', () =>
    {
        expect(OPS_TOKEN_PREFIX).toBe('spfn_ops_');
    });
});

describe('isOpsToken', () =>
{
    it('accepts an issued-shape secret', () =>
    {
        expect(isOpsToken(ISSUED)).toBe(true);
    });

    it('accepts the bare prefix — verification, not shape, decides validity', () =>
    {
        expect(isOpsToken(OPS_TOKEN_PREFIX)).toBe(true);
    });

    it('refuses a session JWT', () =>
    {
        expect(isOpsToken(SESSION_JWT)).toBe(false);
    });

    it('refuses an empty string', () =>
    {
        expect(isOpsToken('')).toBe(false);
    });

    it('refuses a missing header without throwing', () =>
    {
        expect(isOpsToken(undefined as unknown as string)).toBe(false);
        expect(isOpsToken(null as unknown as string)).toBe(false);
    });
});
