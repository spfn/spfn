import { describe, expect, it } from 'vitest';
import { KeyRing } from './ring';
import { rotate, rotationStage, shouldRotate } from './rotation';
import { testKey } from './test-support';
import type { RotationPlan } from './rotation';

const NOW = 1_800_000_000_000;
const TTL_SEC = 900;

describe('rotation', () =>
{
    it('walks add, switch, wait, remove and refuses to reorder them', async () =>
    {
        const outgoing = await testKey('k-old', 'ES256');
        const incoming = await testKey('k-new', 'ES256');
        const ring = new KeyRing([outgoing.entry]);
        let plan: RotationPlan = {
            incoming: incoming.entry,
            outgoing: 'k-old',
            maxTokenTtlSec: TTL_SEC,
        };

        ({ plan } = expectStage(rotate(ring, plan, NOW), 'add'));
        expect(ring.keys.size).toBe(2);
        expect(ring.current).toBe('k-old');

        ({ plan } = expectStage(rotate(ring, plan, NOW), 'switch'));
        expect(ring.current).toBe('k-new');
        expect(plan.switchedAt).toBe(NOW);

        // The old key still signs tokens that are still alive.
        ({ plan } = expectStage(rotate(ring, plan, NOW + TTL_SEC * 1000 - 1), 'wait'));
        expect(ring.keys.has('k-old')).toBe(true);

        ({ plan } = expectStage(rotate(ring, plan, NOW + TTL_SEC * 1000), 'remove'));
        expect([...ring.keys.keys()]).toEqual(['k-new']);

        expect(rotationStage(ring, plan, NOW + TTL_SEC * 1000)).toBe('complete');
        expect(rotate(ring, plan, NOW + TTL_SEC * 1000).stage).toBe('complete');
    });

    it('keeps verifying tokens from the retiring key until it is removed', async () =>
    {
        const outgoing = await testKey('k-old', 'ES256');
        const incoming = await testKey('k-new', 'ES256');
        const ring = new KeyRing([outgoing.entry]);
        const inFlight = await outgoing.signer.sign({ sub: 'a' });
        let plan: RotationPlan = {
            incoming: incoming.entry,
            outgoing: 'k-old',
            maxTokenTtlSec: TTL_SEC,
        };

        ({ plan } = rotate(ring, plan, NOW));
        ({ plan } = rotate(ring, plan, NOW));

        expect(ring.verify(inFlight, { now: NOW }).ok).toBe(true);

        rotate(ring, plan, NOW + TTL_SEC * 1000);

        expect(ring.verify(inFlight, { now: NOW })).toEqual({ ok: false, reason: 'unknown-kid' });
    });

    it('reports a key as due for rotation seven days out', () =>
    {
        const day = 24 * 60 * 60 * 1000;
        const now = new Date(NOW);

        expect(shouldRotate(new Date(NOW - 10 * day), 90, now))
            .toEqual({ shouldRotate: false, daysRemaining: 80 });
        expect(shouldRotate(new Date(NOW - 83 * day), 90, now))
            .toEqual({ shouldRotate: true, daysRemaining: 7 });
        expect(shouldRotate(new Date(NOW - 200 * day), 90, now))
            .toEqual({ shouldRotate: true, daysRemaining: 0 });
    });
});

function expectStage<T extends { stage: string }>(result: T, stage: string): T
{
    expect(result.stage).toBe(stage);

    return result;
}
