/**
 * Rotation.
 *
 * A key is replaced in four ordered steps, and the order is the whole point:
 *
 *   1. **add**    — every verifier trusts the new key while the old one still signs.
 *   2. **switch** — the new key starts signing; nothing signed by the old key is invalidated.
 *   3. **wait**   — until the longest-lived token signed by the old key has expired.
 *   4. **remove** — the old key stops being trusted.
 *
 * Skipping step 1 rejects live tokens. Skipping step 3 rejects live tokens.
 * `rotate()` will not let you skip either.
 */

import type { KeyRing } from './ring';
import type { PublicKeyEntry } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Warn this many days before a key reaches its rotation age. */
const WARN_DAYS = 7;

export type RotationStage = 'add' | 'switch' | 'wait' | 'remove' | 'complete';

export interface RotationPlan
{
    /** The key taking over. */
    incoming: PublicKeyEntry;
    /** The kid being retired. */
    outgoing: string;
    /** The longest lifetime a token signed by the outgoing key can have. */
    maxTokenTtlSec: number;
    /** Epoch milliseconds at which the ring switched. Set by `rotate()`. */
    switchedAt?: number;
}

/** The step this plan is waiting on, without taking it. */
export function rotationStage(ring: KeyRing, plan: RotationPlan, now: number = Date.now()): RotationStage
{
    if (!ring.keys.has(plan.incoming.kid))
    {
        return 'add';
    }

    if (ring.current !== plan.incoming.kid)
    {
        return 'switch';
    }

    if (!ring.keys.has(plan.outgoing))
    {
        return 'complete';
    }

    const settled = plan.switchedAt !== undefined
        && now >= plan.switchedAt + plan.maxTokenTtlSec * 1000;

    return settled ? 'remove' : 'wait';
}

/**
 * Take at most one step of the plan.
 *
 * The ring is modified in place; the plan is returned rather than mutated, so
 * a caller can persist it between the process that switches and the process
 * that removes. Call it until the stage is `complete`.
 */
export function rotate(
    ring: KeyRing,
    plan: RotationPlan,
    now: number = Date.now(),
): { stage: RotationStage; plan: RotationPlan }
{
    const stage = rotationStage(ring, plan, now);

    if (stage === 'add')
    {
        ring.add(plan.incoming);
    }

    if (stage === 'switch')
    {
        ring.switch(plan.incoming.kid);

        return { stage, plan: { ...plan, switchedAt: now } };
    }

    if (stage === 'remove')
    {
        ring.remove(plan.outgoing);
    }

    return { stage, plan };
}

/**
 * Whether a key is old enough to replace.
 *
 * `@spfn/auth` has its own `shouldRotateKey` that answers the same question.
 * They stay separate on purpose: sharing six lines of date arithmetic is not
 * worth a runtime dependency from one published package to another, which is
 * an ordering constraint every future release has to honour.
 */
export function shouldRotate(
    createdAt: Date,
    rotationDays: number = 90,
    now: Date = new Date(),
): { shouldRotate: boolean; daysRemaining: number }
{
    const ageInDays = Math.floor((now.getTime() - createdAt.getTime()) / DAY_MS);
    const daysRemaining = Math.max(0, rotationDays - ageInDays);

    return { shouldRotate: daysRemaining <= WARN_DAYS, daysRemaining };
}
