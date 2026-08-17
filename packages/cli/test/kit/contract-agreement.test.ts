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
    PATTERNS,
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

/**
 * A positive case built here instead of copied from the frozen set.
 *
 * I0-C5 added `fixtures/positive/setup-descriptor-envelope-port.json` at the
 * origin, but the frozen manifest scopes that file to spfn-course alone, and
 * the conformance runner refuses a copy carrying a file the manifest does not
 * list for this repository. So the case is rebuilt from the fixture this
 * repository *is* given, by changing the one field it is about. When the origin
 * regenerates the manifest with that file scoped to spfn too, this becomes an
 * ordinary path in `positives` and this comment goes away.
 */
interface DerivedPositive
{
    name: string;
    from: string;
    build: (fixture: any) => unknown;
}

const PORT_ORIGIN = 'https://certification.superfunction.xyz:8443';

const SCOPE: {
    name: string;
    validate: Validator;
    schema: string;
    positives: string[];
    derived?: DerivedPositive[];
    negative: string;
}[] = [
    {
        name: 'setup-descriptor-envelope',
        validate: validateSetupDescriptorEnvelope,
        schema: 'schemas/setup-descriptor-envelope.v1.schema.json',
        positives: ['fixtures/positive/setup-descriptor-envelope.json'],
        derived: [{
            name: 'a locator with an explicit port (I0-C5)',
            from: 'fixtures/positive/setup-descriptor-envelope.json',
            build: (fixture: any) => ({
                ...fixture,
                setupUrl: `${PORT_ORIGIN}/setup/landing-kit`,
                catalogUrl: `${PORT_ORIGIN}/kits/landing-kit/catalog`,
                manifestUrl: `${PORT_ORIGIN}/kits/landing-kit/manifests/1.0.0`,
            }),
        }],
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

            for (const derived of scope.derived ?? [])
            {
                const result = scope.validate(derived.build(contract(derived.from)));

                expect(result.issues, `${derived.name}: ${JSON.stringify(result.issues)}`).toEqual([]);
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

/**
 * The patterns are transcribed by hand, so they are the part most likely to
 * drift — and drift silently, because a stricter copy simply refuses something
 * the contract allows and reports it as the caller's mistake. That is exactly
 * what happened to `setupUrl` between I0-C5 and G2: the schema admitted a port,
 * the copy did not, and a certification run read the refusal as its own bad
 * URL. Comparing the source strings is what turns that into a failing test
 * rather than a lost afternoon.
 */
describe('the patterns in the code are the patterns in the schemas', () =>
{
    it('transcribes the setup descriptor\'s patterns exactly', () =>
    {
        const defs = contract('schemas/setup-descriptor-envelope.v1.schema.json').$defs;
        const transcribed: Record<string, RegExp> = {
            publicId: PATTERNS.publicId,
            instant: PATTERNS.instant,
            digest: PATTERNS.digest,
            version: PATTERNS.version,
            httpsUrl: PATTERNS.httpsUrl,
            setupUrl: PATTERNS.setupUrl,
        };

        for (const [name, pattern] of Object.entries(transcribed))
        {
            // A JavaScript regex literal has to escape `/`; a JSON Schema
            // pattern is a string and does not. Same expression, one spelling.
            expect(pattern.source.replace(/\\\//g, '/'), `${name} drifted from the schema`)
                .toBe(defs[name].pattern);
        }
    });

    it('admits the port I0-C5 added, and nothing else in the authority', () =>
    {
        expect(PATTERNS.setupUrl.test('https://certification.superfunction.xyz:8443/setup/landing-kit')).toBe(true);
        expect(PATTERNS.setupUrl.test('https://start.superfunction.xyz/setup/landing-kit')).toBe(true);

        for (const url of [
            'http://start.superfunction.xyz/setup/landing-kit',
            'https://start.superfunction.xyz:80a/setup/landing-kit',
            'https://start.superfunction.xyz:/setup/landing-kit',
            'https://start.superfunction.xyz:123456/setup/landing-kit',
            'https://user:pass@start.superfunction.xyz/setup/landing-kit',
            'https://start.superfunction.xyz/setup/landing-kit?license=spfnl_x',
            'https://start.superfunction.xyz/setup/landing-kit#spfnl_x',
            'https://start.superfunction.xyz/downloads/landing-kit',
        ])
        {
            expect(PATTERNS.setupUrl.test(url), url).toBe(false);
        }
    });
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
