/**
 * The runtime and the frozen contracts must be the same contract.
 *
 * `src/kit/validate.ts` writes out by hand what the I0 schemas say, because
 * nothing in `src/` may hold a second copy of the schema files. This test is
 * what makes that safe: every positive fixture in the frozen set has to pass
 * the runtime validators, every negative fixture has to fail at the exact JSON
 * pointer the fixture names, and every enum the code carries has to equal the
 * enum in the schema.
 *
 * If the origin in spfn-course changes a contract and this copy is refreshed,
 * this test is what fails first.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
    KIT_CHECKPOINT_IDS,
    KIT_OPERATION_STATUSES,
    KIT_OPERATION_TYPES,
    PROVIDER_ACTIONS,
    PROVIDER_IDS,
    PROVIDER_STATUSES,
    validateOperationJournal,
    validateProviderOperationEnvelope,
    validateSetupDescriptorEnvelope,
    type ValidationResult,
} from '../../src/kit/validate.js';
import { KIT_ERROR_EXIT, KIT_EXIT } from '../../src/kit/errors.js';
import { digestOfJson } from '../../src/kit/digest.js';

const CONTRACTS = join(fileURLToPath(new URL('..', import.meta.url)), 'landing-kit-contracts');

function contract(relativePath: string): any
{
    return JSON.parse(readFileSync(join(CONTRACTS, relativePath), 'utf8'));
}

type Validator = (value: unknown) => ValidationResult;

const SCOPE: { name: string; validate: Validator; schema: string; positives: string[]; negative: string }[] = [
    {
        name: 'setup-descriptor-envelope',
        validate: validateSetupDescriptorEnvelope,
        schema: 'schemas/setup-descriptor-envelope.v1.schema.json',
        positives: ['fixtures/positive/setup-descriptor-envelope.json'],
        negative: 'fixtures/negative/setup-descriptor-envelope.json',
    },
    {
        name: 'kit-operation-journal',
        validate: validateOperationJournal,
        schema: 'schemas/kit-operation-journal.v1.schema.json',
        positives: [
            'fixtures/positive/kit-operation-journal-waiting-approval.json',
            'fixtures/positive/kit-operation-journal-waiting-cloud.json',
            'fixtures/positive/kit-operation-journal-waiting-settlement.json',
        ],
        negative: 'fixtures/negative/kit-operation-journal.json',
    },
    {
        name: 'provider-operation-envelope',
        validate: validateProviderOperationEnvelope,
        schema: 'schemas/provider-operation-envelope.v1.schema.json',
        positives: [
            'fixtures/positive/provider-operation-envelope-applied.json',
            'fixtures/positive/provider-operation-envelope-target-drift.json',
            'fixtures/positive/provider-operation-envelope-waiting-approval.json',
        ],
        negative: 'fixtures/negative/provider-operation-envelope.json',
    },
];

describe('the runtime validators agree with the frozen I0 schemas', () =>
{
    for (const scope of SCOPE)
    {
        it(`accepts every positive fixture of ${scope.name}`, () =>
        {
            for (const path of scope.positives)
            {
                const result = scope.validate(contract(path));

                expect(result.issues, `${path}: ${JSON.stringify(result.issues)}`).toEqual([]);
                expect(result.valid).toBe(true);
            }
        });

        it(`refuses every negative fixture of ${scope.name} at the pointer it names`, () =>
        {
            for (const entry of contract(scope.negative).cases)
            {
                const result = scope.validate(entry.value);

                expect(result.valid, `${entry.negativeCaseId} should not validate`).toBe(false);

                for (const pointer of entry.expectedInvalidPointers)
                {
                    expect(
                        result.issues.map(issue => issue.pointer),
                        `${entry.negativeCaseId} should fail at ${pointer}`,
                    ).toContain(pointer);
                }
            }
        });
    }
});

describe('the enums in the code are the enums in the schemas', () =>
{
    it('carries the journal contract\'s checkpoint IDs, statuses and types', () =>
    {
        const schema = contract('schemas/kit-operation-journal.v1.schema.json');

        expect([...KIT_CHECKPOINT_IDS]).toEqual(schema.$defs.checkpointId.enum);
        expect([...KIT_OPERATION_STATUSES]).toEqual(schema.$defs.operationStatus.enum);
        expect([...KIT_OPERATION_TYPES]).toEqual(schema.properties.type.enum);
    });

    it('carries the provider contract\'s providers, actions and statuses', () =>
    {
        const schema = contract('schemas/provider-operation-envelope.v1.schema.json');

        expect([...PROVIDER_IDS]).toEqual(schema.$defs.provider.enum);
        expect([...PROVIDER_ACTIONS]).toEqual(schema.properties.action.enum);
        expect([...PROVIDER_STATUSES]).toEqual(schema.$defs.status.enum);
    });
});

describe('the payload digest convention', () =>
{
    it('is the sha256 of the payload\'s canonical JSON, as the frozen fixture pins it', () =>
    {
        const descriptor = contract('fixtures/positive/setup-descriptor-envelope.json');

        expect(digestOfJson(descriptor.payload)).toBe(descriptor.payloadDigest);
    });
});

describe('the failure vocabulary of unit 06 section 8.3', () =>
{
    it('maps every code to the exit code the design gives it, and adds none of its own', () =>
    {
        // Transcribed from unit 06 section 8.3. A code the CLI can return that
        // is not in this table is a code no other repository can read.
        expect(KIT_ERROR_EXIT).toEqual({
            KIT_SETUP_URL_INVALID: 4,
            KIT_MANIFEST_INVALID: 4,
            KIT_CLI_INCOMPATIBLE: 10,
            KIT_LICENSE_REQUIRED: 2,
            KIT_CREDENTIAL_MISSING: 4,
            KIT_CREDENTIAL_STALE: 4,
            KIT_ENTITLEMENT_EXPIRED: 4,
            KIT_PROJECT_LIMIT: 4,
            KIT_TARGET_NOT_EMPTY: 4,
            KIT_WORKTREE_DIRTY: 4,
            KIT_LOCK_INVALID: 4,
            KIT_MANAGED_DRIFT: 4,
            KIT_UNSUPPORTED_RESOLUTION: 4,
            KIT_UNSUPPORTED_IMPORT: 4,
            KIT_UPDATE_EDGE_MISSING: 4,
            KIT_OPERATION_ACTIVE: 4,
            KIT_RESUME_MISMATCH: 3,
            KIT_GUIDE_UNAVAILABLE: 5,
            KIT_GUIDE_INCOMPATIBLE: 4,
            KIT_GATE_FAILED: 3,
            KIT_MIGRATION_FAILED: 3,
            KIT_DEPLOY_FAILED: 3,
        });
    });

    it('uses only the six exit codes the design defines', () =>
    {
        expect(Object.values(KIT_EXIT).sort((left, right) => left - right)).toEqual([0, 2, 3, 4, 5, 10]);
        expect(new Set(Object.values(KIT_ERROR_EXIT)).size).toBeLessThanOrEqual(Object.values(KIT_EXIT).length);

        for (const exit of Object.values(KIT_ERROR_EXIT))
        {
            expect(Object.values(KIT_EXIT)).toContain(exit);
        }
    });
});
