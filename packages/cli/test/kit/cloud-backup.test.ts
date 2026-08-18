/**
 * The pre-migration dump, on the plan that gives you no backup.
 *
 * Certification runs on Supabase free, which has neither automatic backups nor
 * a backup endpoint, so the thing a migration needs to be reversible is a file
 * this CLI makes. That moves three risks onto this code, and each has a test:
 * the database password must not become an argument, the dump must not be
 * recorded if it contains a credential, and a machine with no `pg_dump` must be
 * told plainly rather than allowed to migrate with nothing behind it.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BACKUP_DIR, PgDumpBackup, type DumpTarget } from '../../src/kit/cloud/backup.js';
import { isKitError, type KitError } from '../../src/kit/errors.js';
import type { RunRequest, RunResult } from '../../src/kit/local/process.js';

const NOW = '2026-08-18T09:00:00Z';
const PASSWORD = 'database-password-do-not-leak';

let root: string;
let calls: RunRequest[];

beforeEach(() =>
{
    root = mkdtempSync(join(tmpdir(), 'spfn-kit-backup-'));
    calls = [];
});

afterEach(() =>
{
    rmSync(root, { recursive: true, force: true });
});

function target(): DumpTarget
{
    return { host: 'db.example.test', port: 5432, database: 'postgres', user: 'postgres', password: PASSWORD };
}

/** A runner that writes whatever the case wants the dump to contain. */
function writingRunner(contents: string | null, result: Partial<RunResult> = {}): (request: RunRequest) => Promise<RunResult>
{
    return async (request: RunRequest) =>
    {
        calls.push(request);

        const file = request.args.find(argument => argument.startsWith('--file='))?.slice('--file='.length);

        if (contents !== null && file !== undefined)
        {
            mkdirSync(dirname(file), { recursive: true });
            writeFileSync(file, contents, 'utf8');
        }

        return { exitCode: 0, stdout: '', stderr: '', missing: false, ...result };
    };
}

function backup(run: (request: RunRequest) => Promise<RunResult>): PgDumpBackup
{
    return new PgDumpBackup({ projectDir: root, target: async () => target(), now: () => NOW, run });
}

describe('the pre-migration dump', () =>
{
    it('writes a dump and reports its digest, path and size', async () =>
    {
        const record = await backup(writingRunner('-- a dump\nCREATE TABLE t (id int);\n'))
            .createBackup({ projectRef: 'abcdefgh' });

        expect(record.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
        expect(record.backupId).toBe(`bk-${record.digest.slice(7, 23)}`);
        expect(record.path).toBe(`${BACKUP_DIR}/abcdefgh-20260818090000.sql`);
        expect(record.bytes).toBeGreaterThan(0);
        expect(readFileSync(join(root, record.path), 'utf8')).toContain('CREATE TABLE');
    });

    it('never puts the connection details in an argument', async () =>
    {
        await backup(writingRunner('-- a dump\n')).createBackup({ projectRef: 'abcdefgh' });

        const serialized = JSON.stringify(calls[0].args);

        expect(serialized).not.toContain(PASSWORD);
        expect(serialized).not.toContain('postgres://');
        expect(serialized).not.toContain('db.example.test');
        // In the environment, which is the one channel a secret may use.
        expect(calls[0].extraEnv?.PGPASSWORD).toBe(PASSWORD);
        expect(calls[0].extraEnv?.PGHOST).toBe('db.example.test');
    });

    it('asks for a dump with no owners, privileges or ACLs in it', async () =>
    {
        await backup(writingRunner('-- a dump\n')).createBackup({ projectRef: 'abcdefgh' });

        for (const flag of ['--no-owner', '--no-privileges', '--no-acl'])
        {
            expect(calls[0].args).toContain(flag);
        }
    });

    it('refuses to record a dump that carries something credential-shaped', async () =>
    {
        const leaky = '-- a dump\nCREATE ROLE app LOGIN PASSWORD \'postgres://user:hunter2@db.internal/app\';\n';
        const failed = await backup(writingRunner(leaky)).createBackup({ projectRef: 'abcdefgh' })
            .catch(error => error as KitError);

        expect(isKitError(failed) && failed.code).toBe('KIT_MIGRATION_FAILED');
        expect((failed as KitError).evidence.reason).toBe('credential-in-dump');
        // The finding is counted and named by shape; the value never travels.
        expect(JSON.stringify((failed as KitError).evidence)).not.toContain('hunter2');
    });

    it('says plainly when this machine has no pg_dump', async () =>
    {
        const failed = await backup(writingRunner(null, { exitCode: 127, missing: true }))
            .createBackup({ projectRef: 'abcdefgh' })
            .catch(error => error as KitError);

        expect(isKitError(failed) && failed.code).toBe('KIT_MIGRATION_FAILED');
        expect((failed as KitError).evidence.reason).toBe('pg-dump-missing');
        expect((failed as KitError).next?.command).toBe('spfn kit status --json');
    });

    it('reports a dump that failed, with a summary and no connection string', async () =>
    {
        const failed = await backup(writingRunner(null, {
            exitCode: 1,
            stderr: 'pg_dump: error: connection to postgres://postgres:hunter2@db.example.test/postgres failed',
        })).createBackup({ projectRef: 'abcdefgh' }).catch(error => error as KitError);

        expect((failed as KitError).evidence.reason).toBe('pg-dump-failed');
        expect(String((failed as KitError).evidence.detail)).not.toContain('hunter2');
        expect(String((failed as KitError).evidence.detail)).toContain('<redacted>');
    });

    it('refuses a run that reported success and wrote nothing', async () =>
    {
        const failed = await backup(writingRunner(null)).createBackup({ projectRef: 'abcdefgh' })
            .catch(error => error as KitError);

        expect((failed as KitError).evidence.reason).toBe('pg-dump-empty');
    });

    it('gives the same identifier to two dumps of the same bytes', async () =>
    {
        const first = await backup(writingRunner('-- identical\n')).createBackup({ projectRef: 'abcdefgh' });
        const second = await backup(writingRunner('-- identical\n')).createBackup({ projectRef: 'abcdefgh' });

        expect(second.backupId).toBe(first.backupId);
    });

    it('keeps the dump under the per-machine operations directory', () =>
    {
        // `.spfn/operations/` is gitignored by the install, so a dump of a
        // customer's data cannot be committed by an `git add -A` that meant
        // to pick up source.
        expect(BACKUP_DIR.startsWith('.spfn/operations/')).toBe(true);
    });
});
