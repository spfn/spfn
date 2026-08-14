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
});
