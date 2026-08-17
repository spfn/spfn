/**
 * `spfn kit` — the generic product installer (unit 06 section 2).
 *
 * One binary, one command group, no per-Kit CLI. Nothing here names a product:
 * the setup descriptor says which Kit, the manifest says which packages, and
 * the product's own tooling — discovered, never hard-coded — supplies every
 * judgement that is specific to it.
 *
 * Three things about this surface are contract, not taste:
 *
 *   - there is no `--license-key <value>` option. A secret on a command line is
 *     in the process table, the shell history and every log that records an
 *     argv. The only ways in are a masked prompt and `--license-key-stdin`;
 *   - `--json` never prompts. An agent cannot answer a prompt it cannot see, so
 *     a JSON-mode command that needs a secret exits 2 and says
 *     `input: masked-stdin`;
 *   - there is no blanket `--yes`. What needs approval needs the exact plan
 *     digest, and the digest is only obtainable by looking at the plan.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import prompts from 'prompts';
import { resolve } from 'node:path';
import { KitError, KIT_EXIT, isKitError } from '../../kit/errors.js';
import { resolveKitAdapters } from '../../kit/adapters.js';
import { runInstall } from '../../kit/operations/install.js';
import { runRestore } from '../../kit/operations/restore.js';
import { runUpdate } from '../../kit/operations/update.js';
import { runCheck, runStatus } from '../../kit/operations/inspect.js';
import { runAbandon, runResume } from '../../kit/operations/resume.js';
import type { KitOperationResult } from '../../kit/events.js';
import type { KitAdapters } from '../../kit/ports.js';

interface CommonOptions
{
    json?: boolean;
    dir?: string;
}

interface SecretInputOptions extends CommonOptions
{
    licenseKeyStdin?: boolean;
}

function projectDir(options: CommonOptions): string
{
    return resolve(options.dir ?? process.cwd());
}

/**
 * Read a license key without it ever becoming an argument.
 *
 * The reader is a function rather than a value so the key is only asked for at
 * the moment activation needs it — an install that stops before then never
 * holds one.
 */
function licenseKeyReader(options: SecretInputOptions): () => Promise<string>
{
    return async () =>
    {
        if (options.licenseKeyStdin === true)
        {
            return readSecretFromStdin();
        }
        if (options.json === true || !process.stdin.isTTY)
        {
            throw new KitError('KIT_LICENSE_REQUIRED', 'This command needs a license key on stdin.', {
                evidence: { input: 'masked-stdin' },
                next: { command: 'spfn kit install <setup-url> <dir> --license-key-stdin --json', requiresHumanApproval: true },
            });
        }

        const answer = await prompts({
            type: 'password',
            name: 'licenseKey',
            message: 'License key',
        });

        if (typeof answer.licenseKey !== 'string' || answer.licenseKey.length === 0)
        {
            throw new KitError('KIT_LICENSE_REQUIRED', 'No license key was entered.', {
                evidence: { input: 'masked-stdin' },
            });
        }

        return answer.licenseKey;
    };
}

async function readSecretFromStdin(): Promise<string>
{
    const chunks: Buffer[] = [];

    for await (const chunk of process.stdin)
    {
        chunks.push(Buffer.from(chunk));
    }

    const value = Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');

    if (value.length === 0)
    {
        throw new KitError('KIT_LICENSE_REQUIRED', 'Nothing was written to stdin.', {
            evidence: { input: 'masked-stdin' },
        });
    }

    return value;
}

/** Runs an operation, prints what it produced, and exits with its code. */
async function withResult(json: boolean, run: () => Promise<KitOperationResult>): Promise<void>
{
    try
    {
        const result = await run();

        if (result.exitCode !== KIT_EXIT.OK)
        {
            process.exitCode = result.exitCode;
        }
    }
    catch (error)
    {
        reportFailure(error, json);
    }
}

function reportFailure(error: unknown, json: boolean): void
{
    if (!isKitError(error))
    {
        throw error;
    }

    const event = {
        schemaVersion: 1 as const,
        phase: error.phase ?? 'preflight',
        status: 'failed' as const,
        code: error.code,
        summary: error.message,
        evidence: error.evidence,
        next: error.next,
    };

    if (json)
    {
        console.log(JSON.stringify(event));
    }
    else
    {
        console.error(`${chalk.red('✗')} ${error.message}`);
        console.error(`  ${chalk.gray(error.code)}`);

        if (error.next)
        {
            console.error(`  ${chalk.gray('next:')} ${error.next.command}`);
        }
    }

    process.exitCode = error.exitCode;
}

function printJson(json: boolean, value: unknown, render: () => void): void
{
    if (json)
    {
        console.log(JSON.stringify(value, null, 2));

        return;
    }

    render();
}

/**
 * The ports for a read-only command, or `null` when this build cannot reach
 * them.
 *
 * Section 4.3: an unreachable remote must not hide the local state. `status`
 * and `check` read the lock, the license file and the operation journal from
 * disk either way, and report everything they could not determine as
 * `unknown` — which is a different answer from "healthy" and from "broken".
 */
async function readOnlyAdapters(projectDir: string): Promise<KitAdapters | null>
{
    try
    {
        return await resolveKitAdapters({ projectDir });
    }
    catch (error)
    {
        if (isKitError(error) && error.code === 'CLI_CONTROL_PLANE_CLIENT_ABSENT')
        {
            return null;
        }

        throw error;
    }
}

export const kitCommand = new Command('kit')
    .description('Install, verify and update a Superfunction Kit in this project');

kitCommand.command('install <setup-url> <directory>')
    .description('Install a Kit into a new, empty directory')
    .option('--json', 'newline-delimited JSON events and a machine-readable result')
    .option('--license-key-stdin', 'read the license key from stdin instead of prompting')
    .action(async (setupUrl: string, directory: string, options: SecretInputOptions) =>
    {
        const targetDir = resolve(directory);

        await withResult(options.json === true, async () => runInstall({
            setupUrl,
            targetDir,
            readLicenseKey: licenseKeyReader(options),
            json: options.json === true,
        }, await resolveKitAdapters({ projectDir: targetDir })));
    });

kitCommand.command('restore')
    .description('Reinstall the exact release this checkout records')
    .option('--json', 'newline-delimited JSON events and a machine-readable result')
    .option('--dir <path>', 'the project directory (default: current directory)')
    .action(async (options: CommonOptions) =>
    {
        const dir = projectDir(options);

        await withResult(options.json === true, async () => runRestore({
            projectDir: dir,
            json: options.json === true,
        }, await resolveKitAdapters({ projectDir: dir })));
    });

kitCommand.command('status')
    .description('Report what is installed, activated and pending — writes nothing')
    .option('--json', 'print the machine-readable report')
    .option('--dir <path>', 'the project directory (default: current directory)')
    .action(async (options: CommonOptions) =>
    {
        const dir = projectDir(options);

        try
        {
            const report = await runStatus({ projectDir: dir }, await readOnlyAdapters(dir));

            printJson(options.json === true, report, () =>
            {
                console.log(chalk.bold(report.installed ? `${report.kitId} ${report.release}` : 'No Kit installed here'));
                console.log(`  activation: ${report.activationId ?? '-'}   credential: ${report.credential}`);
                console.log(`  managed drift: ${report.managedDrift}   update available: ${report.updateAvailable ?? 'none'}`);

                if (report.operation)
                {
                    console.log(`  open operation: ${report.operation.type} (${report.operation.status})`);
                }
            });
        }
        catch (error)
        {
            reportFailure(error, options.json === true);
        }
    });

kitCommand.command('check')
    .description('Check the installed release against its contract — writes nothing')
    .option('--json', 'print stable diagnostic codes')
    .option('--dir <path>', 'the project directory (default: current directory)')
    .action(async (options: CommonOptions) =>
    {
        const dir = projectDir(options);

        try
        {
            const report = await runCheck({ projectDir: dir }, await readOnlyAdapters(dir));

            printJson(options.json === true, report, () =>
            {
                if (report.diagnostics.length === 0)
                {
                    console.log(`${chalk.green('✓')} No problems found.`);

                    return;
                }

                for (const diagnostic of report.diagnostics)
                {
                    const mark = diagnostic.severity === 'error' ? chalk.red('✗') : chalk.yellow('!');

                    console.log(`${mark} ${diagnostic.summary}`);
                    console.log(`  ${chalk.gray(diagnostic.code)}${diagnostic.path ? ` ${diagnostic.path}` : ''}`);

                    if (diagnostic.fixCommand)
                    {
                        console.log(`  ${chalk.gray('next:')} ${diagnostic.fixCommand}`);
                    }
                }
            });

            if (!report.healthy)
            {
                process.exitCode = KIT_EXIT.REFUSED;
            }
        }
        catch (error)
        {
            reportFailure(error, options.json === true);
        }
    });

kitCommand.command('plan')
    .description('Show what an update would change — writes nothing')
    .option('--to <release>', 'an exact entitled release (default: newest entitled stable)')
    .option('--json', 'print the plan and its approval digest')
    .option('--dir <path>', 'the project directory (default: current directory)')
    .action(async (options: CommonOptions & { to?: string }) =>
    {
        const dir = projectDir(options);

        await withResult(options.json === true, async () => runUpdate({
            projectDir: dir,
            toRelease: options.to,
            planOnly: true,
            json: options.json === true,
        }, await resolveKitAdapters({ projectDir: dir })));
    });

kitCommand.command('update')
    .description('Update to an entitled release through its signed edges')
    .option('--to <release>', 'an exact entitled release (default: newest entitled stable)')
    .option('--approve-plan <digest>', 'the exact plan digest a person approved')
    .option('--plan-only', 'produce the plan and write nothing')
    .option('--json', 'newline-delimited JSON events and a machine-readable result')
    .option('--dir <path>', 'the project directory (default: current directory)')
    .action(async (options: CommonOptions & { to?: string; approvePlan?: string; planOnly?: boolean }) =>
    {
        const dir = projectDir(options);

        await withResult(options.json === true, async () => runUpdate({
            projectDir: dir,
            toRelease: options.to,
            planOnly: options.planOnly === true,
            approvedPlanDigest: options.approvePlan,
            json: options.json === true,
        }, await resolveKitAdapters({ projectDir: dir })));
    });

kitCommand.command('resume [operation-id]')
    .description('Continue the operation this project has open, after re-checking it')
    .option('--approve-plan <digest>', 'the exact plan digest a person approved')
    .option('--license-key-stdin', 'read the license key from stdin instead of prompting')
    .option('--json', 'newline-delimited JSON events and a machine-readable result')
    .option('--dir <path>', 'the project directory (default: current directory)')
    .action(async (operationId: string | undefined, options: SecretInputOptions & { approvePlan?: string }) =>
    {
        const dir = projectDir(options);

        await withResult(options.json === true, async () => runResume({
            projectDir: dir,
            operationId,
            approvedPlanDigest: options.approvePlan,
            readLicenseKey: licenseKeyReader(options),
            json: options.json === true,
        }, await resolveKitAdapters({ projectDir: dir })));
    });

kitCommand.command('abandon [operation-id]')
    .description('Record that an operation will not be finished, and report what it left behind')
    .option('--json', 'newline-delimited JSON events and a machine-readable result')
    .option('--dir <path>', 'the project directory (default: current directory)')
    .action(async (operationId: string | undefined, options: CommonOptions) =>
    {
        const dir = projectDir(options);

        await withResult(options.json === true, async () => runAbandon({
            projectDir: dir,
            operationId,
            json: options.json === true,
        }, await resolveKitAdapters({ projectDir: dir })));
    });
