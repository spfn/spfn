/**
 * Landing Kit I0 conformance runner.
 *
 * One runner, three repositories. spfn-course owns this file; capabilities and
 * spfn hold byte-identical copies, so "the fixture is valid" means the same
 * thing everywhere without a shared package.
 *
 * What a run proves, in order:
 *
 *  1. Copy integrity — every contract file the calling repository is supposed
 *     to hold is present and its bytes hash to the digest the manifest
 *     records. A copy that drifted by one byte fails here.
 *  2. Set identity — the digest of the whole file list is recomputed from the
 *     manifest and compared with the value the manifest carries, so a doctored
 *     manifest cannot quietly bless a doctored file.
 *  3. Schema version agreement — each schema document really pins the
 *     schemaVersion the manifest claims for it.
 *  4. Positive conformance — every positive fixture validates against its
 *     schema.
 *  5. Negative conformance — every negative case fails, and fails at the
 *     pointer the case says it should. A schema that got looser somewhere else
 *     is caught here rather than at gate time.
 *  6. Contract cross-checks — the setup descriptor's payload digest is the
 *     real digest of its canonical payload, and the case map holds exactly the
 *     cases unit 10 declares.
 */

import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate } from './json-schema.mjs';

export const CONTRACT_SET = 'landing-kit/i0';

/** Case counts unit 10 section 15 declares, table by table. */
export const EXPECTED_CASE_COUNTS = { A: 12, B: 10, C: 12, D: 11, E: 11, F: 10, H: 9 };

export const EXPECTED_TOTAL_CASES = 75;

function sha256(bytes)
{
    return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

/**
 * RFC 8785 JSON Canonicalization Scheme, restricted to the value shapes these
 * contracts use: objects, arrays, strings, booleans, null and integers.
 * Signature and digest checks have to agree byte for byte across three
 * repositories, so property order and whitespace cannot be left to JSON
 * stringify defaults.
 */
export function canonicalJson(value)
{
    if (Array.isArray(value))
    {
        return `[${value.map(canonicalJson).join(',')}]`;
    }

    if (value !== null && typeof value === 'object')
    {
        const entries = Object.keys(value)
            .sort()
            .map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);

        return `{${entries.join(',')}}`;
    }

    if (typeof value === 'number' && !Number.isInteger(value))
    {
        throw new Error(`Non-integer number ${value} is outside the canonicalization subset.`);
    }

    return JSON.stringify(value);
}

/**
 * Digest of the whole contract set: one line per file, sorted by path, so the
 * value changes if any file is added, removed, renamed or edited.
 */
export function computeContractSetDigest(files)
{
    const lines = [...files]
        .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
        .map(file => `${file.path} ${file.sha256}\n`)
        .join('');

    return sha256(Buffer.from(lines, 'utf8'));
}

async function listFiles(root, prefix = '')
{
    const entries = await readdir(join(root, prefix), { withFileTypes: true });
    const found = [];

    for (const entry of entries)
    {
        const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory())
        {
            found.push(...await listFiles(root, relative));
        }
        else
        {
            found.push(relative);
        }
    }

    return found;
}

function checkCaseMap(caseMap, failures)
{
    let total = 0;

    for (const [table, expected] of Object.entries(EXPECTED_CASE_COUNTS))
    {
        const cases = caseMap.tables?.[table] ?? [];
        total += cases.length;

        if (cases.length !== expected)
        {
            failures.push(`case map table ${table} holds ${cases.length} cases, unit 10 declares ${expected}`);
        }

        cases.forEach((entry, index) =>
        {
            const expectedId = `${table}${index + 1}`;
            if (entry.id !== expectedId)
            {
                failures.push(`case map table ${table} position ${index + 1} is "${entry.id}", expected "${expectedId}"`);
            }
            if (entry.table !== table)
            {
                failures.push(`case ${entry.id} records table "${entry.table}" but sits under table ${table}`);
            }
        });
    }

    if (total !== EXPECTED_TOTAL_CASES)
    {
        failures.push(`case map holds ${total} cases, unit 10 declares ${EXPECTED_TOTAL_CASES}`);
    }

    const routeSlugs = new Set((caseMap.fixtures?.routes ?? []).map(route => route.routeSlug));
    if (routeSlugs.size !== 4)
    {
        failures.push(`canonical fixture declares ${routeSlugs.size} distinct route slugs, expected 4`);
    }

    for (const route of caseMap.fixtures?.routes ?? [])
    {
        if (route.route !== `/demo/${route.routeSlug}`)
        {
            failures.push(`fixture ${route.fixtureId} route "${route.route}" does not follow /demo/<routeSlug>`);
        }
    }

    const consented = (caseMap.fixtures?.visits ?? []).filter(visit => visit.consent === 'allow').length;
    if (consented !== caseMap.fixtures?.expectedAggregate?.eligibleVisits)
    {
        failures.push('eligible visits must equal the number of consented visits; the denied visit never enters the denominator');
    }

    return total;
}

function checkSetupDescriptorPayload(descriptor, failures)
{
    const actual = sha256(Buffer.from(canonicalJson(descriptor.payload), 'utf8'));

    if (actual !== descriptor.payloadDigest)
    {
        failures.push(`setup descriptor payloadDigest is ${descriptor.payloadDigest} but the canonical payload hashes to ${actual}`);
    }
}

/**
 * @typedef {object} ConformanceSummary
 * @property {'spfn-course'|'capabilities'|'spfn'} repo Scope that was checked.
 * @property {string} contractSetDigest Digest of the whole file list.
 * @property {number} files Files in scope for this repository.
 * @property {number} contracts Contracts in scope for this repository.
 * @property {number} positives Positive fixtures validated.
 * @property {number} negatives Negative cases exercised.
 * @property {number|null} caseCount Cases in the case map, or null when out of scope.
 */

/**
 * Run the conformance suite against one repository's copy of the contract set.
 *
 * @param {object} options
 * @param {string} options.root Directory holding fixture-manifest.json.
 * @param {'spfn-course'|'capabilities'|'spfn'} options.repo Which repository's scope to check.
 * @returns {Promise<{ failures: string[], checked: ConformanceSummary }>}
 */
export async function runConformance({ root, repo })
{
    const failures = [];
    const contractsRoot = resolve(root);
    const manifestPath = join(contractsRoot, 'fixture-manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

    if (manifest.contractSet !== CONTRACT_SET)
    {
        failures.push(`manifest is for contract set "${manifest.contractSet}", expected "${CONTRACT_SET}"`);
    }

    const recomputed = computeContractSetDigest(manifest.files);
    if (recomputed !== manifest.contractSetDigest)
    {
        failures.push(`manifest records contractSetDigest ${manifest.contractSetDigest} but its own file list hashes to ${recomputed}`);
    }

    const scoped = manifest.files.filter(file => file.repos.includes(repo));
    const present = new Set(await listFiles(contractsRoot));
    present.delete('fixture-manifest.json');

    // A file that never arrived cannot be read later either. Remember it so the
    // run reports one clear failure instead of dying on an ENOENT halfway
    // through and hiding every check that came after it.
    const missing = new Set();

    for (const file of scoped)
    {
        if (!present.has(file.path))
        {
            failures.push(`missing required file ${file.path} for repo ${repo}`);
            missing.add(file.path);
            continue;
        }

        present.delete(file.path);

        const actual = sha256(await readFile(join(contractsRoot, file.path)));
        if (actual !== file.sha256)
        {
            failures.push(`${file.path} hashes to ${actual}, manifest records ${file.sha256}`);
        }
    }

    for (const extra of present)
    {
        failures.push(`${extra} is not listed in the manifest; the copy must not carry files of its own`);
    }

    const schemas = new Map();
    for (const contract of manifest.contracts)
    {
        if (!contract.repos.includes(repo) || missing.has(contract.schema))
        {
            continue;
        }

        const schema = JSON.parse(await readFile(join(contractsRoot, contract.schema), 'utf8'));
        schemas.set(contract.id, schema);

        const pinned = schema.properties?.schemaVersion?.const;
        if (pinned !== contract.schemaVersion)
        {
            failures.push(`contract ${contract.id} claims schemaVersion ${contract.schemaVersion} but its schema pins ${pinned}`);
        }
    }

    let positives = 0;
    let negatives = 0;

    for (const file of scoped)
    {
        if (missing.has(file.path))
        {
            continue;
        }

        if (file.role === 'positive')
        {
            const schema = schemas.get(file.contract);
            if (!schema)
            {
                failures.push(`positive fixture ${file.path} names unknown contract ${file.contract}`);
                continue;
            }

            positives += 1;
            const result = validate(schema, JSON.parse(await readFile(join(contractsRoot, file.path), 'utf8')));
            if (!result.valid)
            {
                const detail = result.errors.map(error => `${error.pointer || '/'}: ${error.message}`).join('; ');
                failures.push(`positive fixture ${file.path} does not validate — ${detail}`);
            }
        }

        if (file.role === 'negative')
        {
            const schema = schemas.get(file.contract);
            if (!schema)
            {
                failures.push(`negative fixture ${file.path} names unknown contract ${file.contract}`);
                continue;
            }

            const bundle = JSON.parse(await readFile(join(contractsRoot, file.path), 'utf8'));
            for (const negative of bundle.cases)
            {
                negatives += 1;
                const result = validate(schema, negative.value);

                if (result.valid)
                {
                    failures.push(`negative case ${negative.negativeCaseId} validated, but it must be rejected: ${negative.reason}`);
                    continue;
                }

                const pointers = new Set(result.errors.map(error => error.pointer));
                for (const expected of negative.expectedInvalidPointers)
                {
                    if (!pointers.has(expected))
                    {
                        failures.push(
                            `negative case ${negative.negativeCaseId} was rejected, but not at ${expected} `
                            + `(rejected at ${[...pointers].join(', ') || '/'})`,
                        );
                    }
                }
            }
        }
    }

    let caseCount = null;
    const caseMapEntry = scoped.find(file => file.role === 'case-map' && !missing.has(file.path));
    if (caseMapEntry)
    {
        caseCount = checkCaseMap(
            JSON.parse(await readFile(join(contractsRoot, caseMapEntry.path), 'utf8')),
            failures,
        );
    }

    const descriptorEntry = scoped.find(
        file => file.role === 'positive'
            && file.contract === 'setup-descriptor-envelope'
            && !missing.has(file.path),
    );
    if (descriptorEntry)
    {
        checkSetupDescriptorPayload(
            JSON.parse(await readFile(join(contractsRoot, descriptorEntry.path), 'utf8')),
            failures,
        );
    }

    return {
        failures,
        checked: {
            repo,
            contractSetDigest: manifest.contractSetDigest,
            files: scoped.length,
            contracts: schemas.size,
            positives,
            negatives,
            caseCount,
        },
    };
}

/** Directory this runner lives in, so a caller can point at the copy beside it. */
export const contractsRoot = dirname(dirname(fileURLToPath(import.meta.url)));
