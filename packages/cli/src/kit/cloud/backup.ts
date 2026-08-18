/**
 * The backup a free-tier database does not give you.
 *
 * Unit 09's versioned correction of 2026-08-18 puts certification on Supabase
 * free, which has neither automatic backups nor a backup endpoint. The evidence
 * a migration needs therefore has to be produced by the Kit itself, before the
 * migration runs — so this is `pg_dump`, and the thing recorded is the file's
 * digest rather than the file.
 *
 * Three rules, and the first two are why this is not a one-line shell-out:
 *
 *   - **the connection string never becomes an argument.** `pg_dump "postgres://
 *     user:password@host/db"` puts a database password in the process table for
 *     every local user to read. It goes in `PGPASSWORD` and the rest of the
 *     connection in the other `PG*` variables, which are environment;
 *   - **the dump is checked for credentials before it is trusted.** A dump can
 *     legitimately contain a `CREATE ROLE ... PASSWORD` line, and a file the
 *     journal points at is a file somebody will eventually open. It is scanned,
 *     and a dump that carries one is refused rather than recorded;
 *   - **a missing `pg_dump` is a clear refusal.** Silently skipping the backup
 *     would mean a migration ran with nothing to go back to, and the operation
 *     would look identical to one that was safe.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { KitError } from '../errors.js';
import { runCommand, summarize, type CommandRunner } from '../local/process.js';
import { scanTextForSecrets } from '../secret-scan.js';

/** Where a dump goes: per-machine state, beside the operation journal. */
export const BACKUP_DIR = '.spfn/operations/backups';

export interface DumpTarget
{
    host: string;
    port: number;
    database: string;
    user: string;
    /** Sent through `PGPASSWORD`. Never an argument, never written down. */
    password: string;
}

export interface BackupRecord
{
    backupId: string;
    /** Project-relative path of the dump. The file itself is gitignored. */
    path: string;
    digest: string;
    bytes: number;
}

export interface PgDumpBackupOptions
{
    projectDir: string;
    target: () => Promise<DumpTarget>;
    now: () => string;
    run?: CommandRunner;
    binary?: string;
    timeoutMs?: number;
}

export class PgDumpBackup
{
    private readonly options: PgDumpBackupOptions;

    constructor(options: PgDumpBackupOptions)
    {
        this.options = options;
    }

    /**
     * Take the dump, and report what can safely be recorded about it.
     *
     * The identifier is the digest rather than a counter, because two runs that
     * produced the same bytes produced the same backup, and a resume that finds
     * an identical dump has nothing to do.
     */
    async createBackup(request: { projectRef: string }): Promise<{ backupId: string } & BackupRecord>
    {
        const target = await this.options.target();
        const file = this.dumpPath(request.projectRef);

        mkdirSync(dirname(file), { recursive: true });

        const result = await (this.options.run ?? runCommand)({
            file: this.options.binary ?? 'pg_dump',
            args: [
                '--no-owner',
                '--no-privileges',
                // No large objects and no role passwords: neither belongs in a
                // file whose digest goes in the journal.
                '--no-acl',
                '--format=plain',
                `--file=${file}`,
            ],
            cwd: this.options.projectDir,
            extraEnv: {
                PGHOST: target.host,
                PGPORT: String(target.port),
                PGDATABASE: target.database,
                PGUSER: target.user,
                PGPASSWORD: target.password,
                PGSSLMODE: 'require',
            },
            timeoutMs: this.options.timeoutMs,
        });

        if (result.missing)
        {
            throw new KitError('KIT_MIGRATION_FAILED', 'This machine has no pg_dump, so no backup can be taken.', {
                evidence: { reason: 'pg-dump-missing', binary: this.options.binary ?? 'pg_dump' },
                next: { command: 'spfn kit status --json', requiresHumanApproval: false },
            });
        }
        if (result.exitCode !== 0)
        {
            throw new KitError('KIT_MIGRATION_FAILED', 'The pre-migration backup did not complete.', {
                evidence: { reason: 'pg-dump-failed', detail: summarize(result) },
            });
        }

        return this.record(file, request.projectRef);
    }

    /** The dump's digest and size, once it has been checked for credentials. */
    private record(file: string, projectRef: string): { backupId: string } & BackupRecord
    {
        if (!existsSync(file))
        {
            throw new KitError('KIT_MIGRATION_FAILED', 'pg_dump reported success and wrote no file.', {
                evidence: { reason: 'pg-dump-empty', projectRef },
            });
        }

        const bytes = readFileSync(file);
        const found = scanTextForSecrets(bytes.toString('utf8'));

        if (found.length > 0)
        {
            throw new KitError('KIT_MIGRATION_FAILED', 'The backup contains something that looks like a credential.', {
                evidence: { reason: 'credential-in-dump', findings: found.length, kind: found[0].shape },
            });
        }

        const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

        return {
            backupId: `bk-${digest.slice(7, 23)}`,
            path: this.relativePath(projectRef),
            digest,
            bytes: statSync(file).size,
        };
    }

    private dumpPath(projectRef: string): string
    {
        return join(this.options.projectDir, this.relativePath(projectRef));
    }

    private relativePath(projectRef: string): string
    {
        const stamp = this.options.now().replace(/[-:TZ]/g, '').slice(0, 14);

        return `${BACKUP_DIR}/${projectRef}-${stamp}.sql`;
    }
}
