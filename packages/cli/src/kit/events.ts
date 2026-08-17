/**
 * What a `spfn kit` command prints (unit 06 section 8).
 *
 * Two audiences, one source. The agent reads newline-delimited JSON events with
 * a stable code, a phase and a safe next command; the person reads four things
 * and no more — what finished, what is waiting on them, what failed and what
 * state was kept. Neither is asked to read the other's output.
 *
 * `--json` never opens a prompt. A command that needs a secret in JSON mode
 * exits 2 and says `input: masked-stdin`, because a prompt an agent cannot see
 * is a hang, and a secret on a command line is a leak.
 */

import chalk from 'chalk';
import { redactSecrets } from './secret-scan.js';

export interface KitCliEventV1
{
    schemaVersion: 1;
    operationId?: string;
    phase: string;
    status: 'started' | 'progress' | 'waiting' | 'failed' | 'completed';
    /** Stable machine code. Failures use the frozen Kit error vocabulary. */
    code: string;
    summary: string;
    evidence?: Record<string, string | number | boolean | null>;
    next?: {
        command: string;
        requiresHumanApproval: boolean;
        approvalDigest?: string;
    };
}

export interface KitEventSink
{
    emit(event: KitCliEventV1): void;
    /** Every event emitted, in order. Kept for the final result and tests. */
    readonly events: readonly KitCliEventV1[];
}

export interface EventSinkOptions
{
    json: boolean;
    write?: (line: string) => void;
    /** Secret values held in memory right now, redacted from any output. */
    knownSecrets?: readonly string[];
}

export function createEventSink(options: EventSinkOptions): KitEventSink
{
    const events: KitCliEventV1[] = [];
    const write = options.write ?? ((line: string) => process.stdout.write(`${line}\n`));

    return {
        events,
        emit(event: KitCliEventV1)
        {
            const safe = redactEvent(event, options.knownSecrets);

            events.push(safe);
            write(options.json ? JSON.stringify(safe) : humanLine(safe));
        },
    };
}

function redactEvent(event: KitCliEventV1, knownSecrets?: readonly string[]): KitCliEventV1
{
    const scrub = (text: string): string => redactSecrets(text, { knownValues: knownSecrets });
    const evidence = event.evidence === undefined
        ? undefined
        : Object.fromEntries(Object.entries(event.evidence)
            .map(([key, value]) => [key, typeof value === 'string' ? scrub(value) : value]));

    return {
        ...event,
        summary: scrub(event.summary),
        ...(evidence === undefined ? {} : { evidence }),
        ...(event.next === undefined ? {} : { next: { ...event.next, command: scrub(event.next.command) } }),
    };
}

function humanLine(event: KitCliEventV1): string
{
    switch (event.status)
    {
        case 'completed':
            return `${chalk.green('✓')} ${event.summary}`;
        case 'waiting':
            return `${chalk.yellow('…')} ${event.summary}${nextLine(event)}`;
        case 'failed':
            return `${chalk.red('✗')} ${event.summary}\n  ${chalk.gray(event.code)}${nextLine(event)}`;
        case 'started':
            return chalk.gray(`→ ${event.summary}`);
        default:
            return chalk.gray(`  ${event.summary}`);
    }
}

function nextLine(event: KitCliEventV1): string
{
    if (!event.next)
    {
        return '';
    }

    const approval = event.next.requiresHumanApproval
        ? chalk.yellow(' (needs your approval)')
        : '';

    return `\n  ${chalk.gray('next:')} ${event.next.command}${approval}`;
}

/** How an operation ended, in the shape a command turns into an exit code. */
export interface KitOperationResult
{
    status: 'completed' | 'waiting' | 'failed';
    exitCode: number;
    code: string;
    summary: string;
    operationId?: string;
    phase: string;
    evidence?: Record<string, string | number | boolean | null>;
    next?: KitCliEventV1['next'];
    events: readonly KitCliEventV1[];
}
