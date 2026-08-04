import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
    compareVersions,
    listSnapshots,
    newestSnapshot,
    readSnapshot,
    releasedDir,
    writeCurrentDocument,
    writeSnapshot,
} from '../snapshot';
import { stableStringifyPretty } from '../stable-json';
import type { ContractDocument } from '../types';

const ROOT = resolve(process.cwd(), '.test-tmp-contract-snapshot');

const document: ContractDocument = {
    documentVersion: 1,
    operations: [{
        name: 'getUser',
        method: 'GET',
        path: '/users/:id',
        since: '1.0.0',
        auth: 'none',
        requiresSession: false,
        request: {},
        interceptor: {},
        response: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    }],
};

describe('version ordering', () =>
{
    it('orders numerically, not as text', () =>
    {
        expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
    });

    it('places a pre-release before the release it leads to', () =>
    {
        expect(compareVersions('1.2.0-beta.1', '1.2.0')).toBeLessThan(0);
        expect(compareVersions('1.2.0-beta.2', '1.2.0-beta.10')).toBeLessThan(0);
    });

    it('refuses a version that is not major.minor.patch', () =>
    {
        expect(() => compareVersions('1.2', '1.2.0')).toThrow(/major\.minor\.patch/);
    });
});

describe('released snapshots', () =>
{
    beforeEach(() => rmSync(ROOT, { recursive: true, force: true }));
    afterEach(() => rmSync(ROOT, { recursive: true, force: true }));

    it('has no baseline before the first release', () =>
    {
        expect(listSnapshots(ROOT)).toEqual([]);
        expect(newestSnapshot(ROOT)).toBeUndefined();
    });

    it('writes a snapshot that reads back', () =>
    {
        const file = writeSnapshot(ROOT, '1.2.0', document);
        const snapshot = readSnapshot(file);

        expect(snapshot.version).toBe('1.2.0');
        expect(snapshot.document).toEqual(document);
    });

    it('picks the newest release as the baseline', () =>
    {
        writeSnapshot(ROOT, '1.9.0', document);
        writeSnapshot(ROOT, '1.10.0', document);

        expect(newestSnapshot(ROOT)?.version).toBe('1.10.0');
    });

    it('refuses to rewrite a released version', () =>
    {
        writeSnapshot(ROOT, '1.2.0', document);

        expect(() => writeSnapshot(ROOT, '1.2.0', document)).toThrow(/never rewritten/);
    });

    it('refuses a snapshot filled in behind the newest one', () =>
    {
        writeSnapshot(ROOT, '1.2.0', document);

        expect(() => writeSnapshot(ROOT, '1.1.0', document)).toThrow(/not newer than/);
    });

    it('refuses a snapshot that was edited after release', () =>
    {
        const file = writeSnapshot(ROOT, '1.2.0', document);
        const snapshot = JSON.parse(readFileSync(file, 'utf-8'));

        snapshot.document.operations[0].path = '/edited';
        writeFileSync(file, stableStringifyPretty(snapshot), 'utf-8');

        expect(() => readSnapshot(file)).toThrow(/edited after release/);
    });

    it('refuses a file that is not a snapshot', () =>
    {
        mkdirSync(releasedDir(ROOT), { recursive: true });
        const file = join(releasedDir(ROOT), '1.2.0.json');
        writeFileSync(file, JSON.stringify({ hello: 'world' }), 'utf-8');

        expect(() => readSnapshot(file)).toThrow(/not a contract snapshot/);
    });
});

describe('current.json', () =>
{
    beforeEach(() => rmSync(ROOT, { recursive: true, force: true }));
    afterEach(() => rmSync(ROOT, { recursive: true, force: true }));

    it('writes once and then reports no change for the same document', () =>
    {
        expect(writeCurrentDocument(ROOT, document)).toBe(true);
        expect(writeCurrentDocument(ROOT, document)).toBe(false);
    });

    it('does not depend on key order in the router', () =>
    {
        writeCurrentDocument(ROOT, document);
        const first = readFileSync(join(ROOT, 'current.json'), 'utf-8');

        const reordered: ContractDocument = {
            operations: document.operations.map(operation => ({
                response: operation.response,
                interceptor: operation.interceptor,
                request: operation.request,
                requiresSession: operation.requiresSession,
                auth: operation.auth,
                since: operation.since,
                path: operation.path,
                method: operation.method,
                name: operation.name,
            })),
            documentVersion: 1,
        };

        rmSync(ROOT, { recursive: true, force: true });
        writeCurrentDocument(ROOT, reordered);

        expect(readFileSync(join(ROOT, 'current.json'), 'utf-8')).toBe(first);
    });
});
