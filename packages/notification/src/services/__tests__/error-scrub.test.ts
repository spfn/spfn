/**
 * The service is the last guard before `history.error_message`: whatever a
 * caller hands it, the address-shaped tokens are gone by the time the value
 * reaches the UPDATE. DB layer mocked out.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted: vi.mock factories run before module-level consts are initialised.
const { updateOne, set } = vi.hoisted(() => ({
    updateOne: vi.fn(async (..._args: unknown[]) => null),
    set: vi.fn((_values: Record<string, unknown>) => ({ where: vi.fn(async () => undefined) })),
}));

// Partial mock: the entity modules still need the real createSchema/table
// helpers to build `notifications` at import time.
vi.mock('@spfn/core/db', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    updateOne,
    getDatabase: () => ({ update: () => ({ set }) }),
}));

import { markNotificationFailed, markManyFailed } from '../notification.service';

const ADDRESS = 'learner@example.com';
const REJECTION = `Email address is not verified. The following identities failed the check in region US-EAST-1: ${ADDRESS}`;

/**
 * Collect the bound values out of a drizzle SQL fragment. A bound value sits in
 * queryChunks as a bare string; the literal SQL around it is a StringChunk
 * object — so finding the message here is also the proof it stays a parameter
 * rather than being inlined into the CASE.
 */
function boundValues(chunk: any): string[]
{
    if (typeof chunk === 'string')
    {
        return [chunk];
    }

    return Array.isArray(chunk?.queryChunks) ? chunk.queryChunks.flatMap(boundValues) : [];
}

beforeEach(() =>
{
    updateOne.mockClear();
    set.mockClear();
});

describe('markNotificationFailed', () =>
{
    it('persists the scrubbed message', async () =>
    {
        await markNotificationFailed(1, REJECTION);

        const values = updateOne.mock.calls[0]![2] as { errorMessage: string };

        expect(values.errorMessage).not.toContain(ADDRESS);
        expect(values.errorMessage).toBe(
            'Email address is not verified. The following identities failed the check in region US-EAST-1: le***@example.com',
        );
    });
});

describe('markManyFailed', () =>
{
    it('scrubs each message inside the CASE, still as a bound value', async () =>
    {
        await markManyFailed([
            { id: 1, errorMessage: REJECTION },
            { id: 2, errorMessage: 'Unknown error' },
        ]);

        const bound = boundValues(set.mock.calls[0]![0].errorMessage);

        expect(bound).toContain('Email address is not verified. The following identities failed the check in region US-EAST-1: le***@example.com');
        expect(bound).toContain('Unknown error');
        expect(bound.join(' ')).not.toContain(ADDRESS);
    });

    it('writes nothing for an empty list', async () =>
    {
        await markManyFailed([]);

        expect(set).not.toHaveBeenCalled();
    });
});
