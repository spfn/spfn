/**
 * The gate
 *
 * Puts the pieces together: read the newest released snapshot, compare this
 * build's contract against it, and decide removals against what released
 * clients still call.
 *
 * Nothing released yet is a pass — with a warning. "This is the first contract"
 * and "the release that should have written a snapshot didn't" produce the same
 * empty directory, and only a person can tell them apart.
 */

import { compareDocuments } from './compare';
import { newestSnapshot, readSnapshot, usageDir } from './snapshot';
import { callersOf, readUsageRecords } from './usage';
import type { ContractDocument, ContractViolation } from './types';

export interface ContractCheckResult
{
    /** Version compared against, absent when nothing is released yet. */
    baselineVersion?: string;

    violations: ContractViolation[];

    /** Things a person should look at that do not stop the build. */
    warnings: string[];
}

export function checkContract(contractsDir: string, current: ContractDocument): ContractCheckResult
{
    const baseline = newestSnapshot(contractsDir);

    if (!baseline)
    {
        return {
            violations: [],
            warnings: [
                'No released contract snapshot found, so nothing was compared. '
                + 'This is expected for a first contract, and a mistake if a release forgot to write one.',
            ],
        };
    }

    let previous: ContractDocument;

    try
    {
        previous = readSnapshot(baseline.file).document;
    }
    catch (error)
    {
        return {
            baselineVersion: baseline.version,
            warnings: [],
            violations: [{
                kind: 'snapshot.digest-mismatch',
                detail: error instanceof Error ? error.message : String(error),
            }],
        };
    }

    const { violations, removedOperations } = compareDocuments(previous, current);

    return {
        baselineVersion: baseline.version,
        warnings: [],
        violations: [...violations, ...judgeRemovals(contractsDir, removedOperations)],
    };
}

/**
 * Decide whether removed operations may go.
 *
 * Only reached when something was actually removed — an app that removes
 * nothing never needs a usage file to exist.
 */
function judgeRemovals(contractsDir: string, removedOperations: string[]): ContractViolation[]
{
    if (removedOperations.length === 0)
    {
        return [];
    }

    const usage = readUsageRecords(usageDir(contractsDir));

    if (!usage.decidable)
    {
        return [{
            kind: 'usage.undecidable',
            detail:
                `${removedOperations.join(', ')} would be removed, but no released client's call list could be read `
                + `(${usage.reason}). Not knowing who calls an operation is not the same as knowing nobody does.`,
        }];
    }

    const violations: ContractViolation[] = [];

    for (const operation of removedOperations)
    {
        const callers = callersOf(operation, usage.records);

        if (callers.length === 0)
        {
            continue;
        }

        violations.push({
            kind: 'usage.still-called',
            operation,
            detail:
                'still called by '
                + callers.map(caller => `${caller.platform} ${caller.appVersion}`).join(', '),
        });
    }

    return violations;
}

/** Render violations as the message a failing build prints. */
export function formatViolations(violations: ContractViolation[]): string
{
    return violations
        .map((violation) =>
        {
            const where = [violation.operation, violation.location].filter(Boolean).join(' ');

            return `  - [${violation.kind}]${where ? ` ${where}` : ''}: ${violation.detail}`;
        })
        .join('\n');
}
