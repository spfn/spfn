import { describe, expect, it } from 'vitest';

import type { OpsCommandDescriptor } from '../../../utils/ops/client.js';
import { destructiveConfirmationRequired } from '../index.js';

function command(effect?: OpsCommandDescriptor['effect']): OpsCommandDescriptor
{
    return {
        name: 'reconcile.key.forget',
        method: 'DELETE',
        path: '/_ops/reconcile/key/:key',
        ...(effect ? { effect } : {}),
        input: {},
    };
}

describe('destructiveConfirmationRequired', () =>
{
    it('requires --yes only for commands explicitly described as destructive', () =>
    {
        expect(destructiveConfirmationRequired(command('destructive'), undefined)).toBe(true);
        expect(destructiveConfirmationRequired(command('destructive'), true)).toBe(false);
        expect(destructiveConfirmationRequired(command('write'), undefined)).toBe(false);
        expect(destructiveConfirmationRequired(command(), undefined)).toBe(false);
    });

    it('requires --yes when the effect is unknown because its metadata was refused', () =>
    {
        // The alternative is reading a missing `effect` as harmless, which
        // opens the gate for precisely the commands the CLI could not verify.
        const refused = { ...command(), metadataRejected: true };

        expect(destructiveConfirmationRequired(refused, undefined)).toBe(true);
        expect(destructiveConfirmationRequired(refused, true)).toBe(false);
    });
});
