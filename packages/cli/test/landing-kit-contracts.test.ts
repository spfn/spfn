import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readCatalog } from '../src/kit/ports.js';
import { verifySignedDocument } from '../src/kit/signature.js';
import { latestStableRelease } from '../src/kit/operations/shared.js';
// @ts-expect-error - plain ESM, held byte-identically in three repositories.
import { runConformance } from './landing-kit-contracts/conformance/run.mjs';

/**
 * Landing Kit I0 contracts, checked from the CLI side.
 *
 * The original of every file under `landing-kit-contracts/` lives in
 * spfn-course (`packages/landing-kit/contracts`). What sits here is a copy,
 * and the first test refuses it if a single byte differs. Nothing in this
 * repository edits the copy: a contract change is made at the origin and
 * re-copied.
 *
 * The CLI owns three of the eight contracts, and only the generic halves:
 *
 *   - the setup descriptor envelope, whose product payload the CLI carries
 *     without reading, so one CLI can install a second Kit later;
 *   - the operation journal, which is how a `spfn kit` operation survives a
 *     wait and resumes;
 *   - the provider operation envelope, which is identity, approval and
 *     outcome — never a per-provider policy judgement.
 */

const CONTRACTS_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), 'landing-kit-contracts');

/** spfn-course and capabilities pin this same value. Three different values
 *  would mean three repositories reading three different contracts. */
const FROZEN_CONTRACT_SET_DIGEST = 'sha256:f2973474921e58697a5d05a750ea03123680fb5bdcc7f6064639089dd4c983b0';

const EXPECTED_CONTRACTS = [
    'setup-descriptor-envelope',
    'signed-document-wrapper',
    'kit-catalog',
    'kit-operation-journal',
    'provider-operation-envelope',
];

function readContractJson(relativePath: string): any
{
    return JSON.parse(readFileSync(join(CONTRACTS_ROOT, relativePath), 'utf8'));
}

describe('Landing Kit I0 contracts (CLI scope)', () =>
{
    it('holds a byte-identical copy and every fixture conforms', async () =>
    {
        const { failures, checked } = await runConformance({ root: CONTRACTS_ROOT, repo: 'spfn' });

        assert.deepEqual(failures, []);
        expect(checked.contractSetDigest).toBe(FROZEN_CONTRACT_SET_DIGEST);
        expect(checked.contracts).toBe(EXPECTED_CONTRACTS.length);
        expect(checked.positives).toBeGreaterThan(0);
        expect(checked.negatives).toBeGreaterThan(0);
    });

    it('pins schemaVersion 1 on every contract the CLI owns', () =>
    {
        const manifest = readContractJson('fixture-manifest.json');
        const scoped = manifest.contracts.filter((contract: { repos: string[] }) =>
            contract.repos.includes('spfn'));

        expect(scoped.map((contract: { id: string }) => contract.id).sort())
            .toEqual([...EXPECTED_CONTRACTS].sort());

        for (const contract of scoped)
        {
            expect(contract.schemaVersion).toBe(1);
            expect(readContractJson(contract.schema).properties.schemaVersion.const).toBe(1);
        }
    });

    it('keeps the setup descriptor generic — the payload stays opaque', () =>
    {
        const schema = readContractJson('schemas/setup-descriptor-envelope.v1.schema.json');

        // The CLI verifies the payload by digest; it does not know its shape.
        expect(schema.properties.payload).toEqual({ type: 'object' });
        expect(schema.required).toContain('payloadKind');
        expect(schema.required).toContain('payloadDigest');
        expect(schema.properties.cli.properties.package.const).toBe('spfn');

        // No product identifier is hard-coded: productId is a generic public ID.
        expect(schema.properties.productId.const).toBeUndefined();
    });

    it('refuses a setup URL that could carry a secret', () =>
    {
        const negatives = readContractJson('fixtures/negative/setup-descriptor-envelope.json');
        const ids = negatives.cases.map((entry: { negativeCaseId: string }) => entry.negativeCaseId);

        expect(ids).toContain('N-SETUP-01');
        expect(ids).toContain('N-SETUP-02');

        const pattern = new RegExp(
            readContractJson('schemas/setup-descriptor-envelope.v1.schema.json').$defs.setupUrl.pattern,
        );

        expect(pattern.test('https://start.superfunction.xyz/setup/landing-kit')).toBe(true);
        expect(pattern.test('https://start.superfunction.xyz/setup/landing-kit?license=spfnl_x')).toBe(false);
        expect(pattern.test('https://start.superfunction.xyz/setup/landing-kit#spfnl_x')).toBe(false);
        expect(pattern.test('http://start.superfunction.xyz/setup/landing-kit')).toBe(false);
    });

    it('names all three wait states a kit operation can resume from', () =>
    {
        const schema = readContractJson('schemas/kit-operation-journal.v1.schema.json');

        expect(schema.$defs.operationStatus.enum).toEqual([
            'active',
            'waiting-approval',
            'waiting-cloud',
            'waiting-settlement',
            'failed',
            'completed',
            'abandoned',
        ]);

        // Each wait state has a fixture, so a resume path exists for each.
        const approval = readContractJson('fixtures/positive/kit-operation-journal-waiting-approval.json');
        const cloud = readContractJson('fixtures/positive/kit-operation-journal-waiting-cloud.json');
        const settlement = readContractJson('fixtures/positive/kit-operation-journal-waiting-settlement.json');

        expect(approval.status).toBe('waiting-approval');
        expect(cloud.status).toBe('waiting-cloud');
        expect(settlement.status).toBe('waiting-settlement');

        // Settlement is a scheduled resume, not a sleeping process.
        const pending = settlement.checkpoints.at(-1);
        expect(pending.id).toBe('waiting-settlement');
        expect(pending.status).toBe('pending');
        expect(pending.resumeAfter).toBe('2026-08-17T03:35:00Z');
    });

    it('keeps every secret out of the journal by construction', () =>
    {
        const schema = readContractJson('schemas/kit-operation-journal.v1.schema.json');

        expect(schema.additionalProperties).toBe(false);
        expect(Object.keys(schema.properties.externalRefs.properties).sort()).toEqual([
            'activationId',
            'backupId',
            'deploymentId',
            'pushedCommit',
            'sourceCommit',
        ]);
        expect(schema.properties.externalRefs.additionalProperties).toBe(false);
    });

    it('carries one provider envelope with no per-provider judgement in it', () =>
    {
        const schema = readContractJson('schemas/provider-operation-envelope.v1.schema.json');

        expect(schema.$defs.provider.enum).toEqual(['github', 'vercel', 'supabase']);

        // The stable tuple of unit 04 section 3.4, and nothing else.
        expect(schema.$defs.targetIdentity.required).toEqual([
            'provider',
            'accountId',
            'resourceId',
            'environment',
        ]);
        expect(schema.$defs.targetIdentity.properties.environment.const).toBe('production');

        // A closed browser is not a denial: silence and an explicit deny are
        // different statuses.
        expect(schema.$defs.status.enum).toContain('waiting-approval');
        expect(schema.$defs.status.enum).toContain('approval-denied');
        expect(schema.$defs.status.enum).toContain('approval-expired');

        // No plan-shaped policy field: pricing, plan tiers and region pairs
        // stay in the adapters.
        const keys = Object.keys(schema.properties);
        expect(keys).not.toContain('plan');
        expect(keys).not.toContain('priceQuote');
    });

    /* I0-C2. These two contracts exist because the CLI already reads these
       shapes. A schema that agreed with the design but not with `spfn kit`
       would be worse than none, so the fixtures are fed to the real
       implementation rather than only to the validator. */
    it('feeds the wrapper fixture to the real verifier, which gets past shape to the key', () =>
    {
        const wrapper = readContractJson('fixtures/positive/signed-document-wrapper.json');
        const checked = verifySignedDocument(wrapper, [
            { keyId: 'landing-kit-release-2026', publicKey: 'not-a-real-key' },
        ]);

        /* The signature value is synthetic, so verification must fail — but it
           has to fail at the crypto step, which is only reachable once every
           shape check has passed. */
        expect(checked.ok).toBe(false);
        expect(checked.keyId).toBe('landing-kit-release-2026');
        expect(checked.reason).toBe('signature could not be verified with the trusted key');
    });

    it('rejects each negative wrapper for the reason the fixture states', () =>
    {
        const cases = readContractJson('fixtures/negative/signed-document-wrapper.json').cases;
        const byId = (id: string) => cases.find((entry: { negativeCaseId: string }) => entry.negativeCaseId === id);
        const keys = [{ keyId: 'landing-kit-release-2026', publicKey: 'not-a-real-key' }];

        const wrongAlgorithm = verifySignedDocument(byId('N-SIGNED-01').value, keys);
        expect(wrongAlgorithm.ok).toBe(false);
        expect(wrongAlgorithm.reason).toBe('signature algorithm is not ed25519');

        /* An unsigned sibling is a schema-level rejection: the verifier only
           covers `document`, so the wrapper schema is what has to refuse the
           extra key. Both layers together are the guarantee. */
        const unsignedSibling = byId('N-SIGNED-02');
        expect(unsignedSibling.expectedInvalidPointers).toEqual(['/unsignedNote']);
        expect(verifySignedDocument(unsignedSibling.value, keys).ok).toBe(false);
    });

    it('reads the catalog fixture into the view the CLI actually uses', () =>
    {
        const catalog = readCatalog(readContractJson('fixtures/positive/kit-catalog.json'));

        expect(catalog).not.toBeNull();
        expect(catalog!.kitId).toBe('campaign-landing');
        expect(catalog!.sequence).toBe(4);
        expect(catalog!.releases).toHaveLength(3);

        // Highest-sequence stable release wins, and the revoked one is never offered.
        const latest = latestStableRelease(catalog!);
        expect(latest.version).toBe('1.1.0');
        expect(latest.status).toBe('stable');
    });

    it('keeps the catalog contract to the fields the CLI reads', () =>
    {
        const schema = readContractJson('schemas/kit-catalog.v1.schema.json');

        expect(schema.required).toEqual(['schemaVersion', 'kitId', 'sequence', 'releases']);
        expect(Object.keys(schema.properties.releases.items.properties).sort())
            .toEqual(['manifestUrl', 'releaseClass', 'sequence', 'status', 'version']);

        // Open on purpose: a real signed snapshot carries more than this view.
        expect(schema.additionalProperties).toBeUndefined();

        // kitId stays generic — the CLI installs whatever Kit the descriptor names.
        expect(schema.properties.kitId.const).toBeUndefined();
        expect(schema.properties.kitId.type).toBe('string');
    });

    it('requires an approval digest behind an external write', () =>
    {
        const negatives = readContractJson('fixtures/negative/provider-operation-envelope.json');
        const ids = negatives.cases.map((entry: { negativeCaseId: string }) => entry.negativeCaseId);

        expect(ids).toContain('N-PROVIDER-01');

        const waiting = readContractJson('fixtures/positive/provider-operation-envelope-waiting-approval.json');
        const applied = readContractJson('fixtures/positive/provider-operation-envelope-applied.json');

        expect(waiting.approvalDigest).toBeNull();
        expect(waiting.status).toBe('waiting-approval');
        expect(applied.approvalDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
        expect(applied.status).toBe('applied');
    });
});
