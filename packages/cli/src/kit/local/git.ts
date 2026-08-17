/**
 * Git, in the narrow shape unit 06 asks for: start a repository, say whether
 * it is clean, make one commit, name the current one.
 *
 * Deliberately nothing else. No remote is added, nothing is pushed, no branch
 * is renamed and no history is rewritten — a Kit install finishes at a
 * verified local repository, and a port that could push would make that
 * boundary a matter of trust rather than of capability.
 *
 * The identity question is handled the way it should be: the user's own
 * `user.name` and `user.email` are used whenever Git can find them, and a
 * fallback is supplied *for one command* only when it cannot. Writing an
 * identity into the repository's config would change a setting the person
 * owns; passing it with `-c` changes nothing that outlives the commit.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { GitPort } from '../ports.js';
import { runCommand, summarize, type CommandRunner } from './process.js';

/** Used only when the machine has no Git identity of its own. */
export const FALLBACK_AUTHOR_NAME = 'spfn kit';
export const FALLBACK_AUTHOR_EMAIL = 'kit@superfunction.xyz';

/** Git is fast; a call that takes this long is stuck on a lock or a prompt. */
export const DEFAULT_GIT_TIMEOUT_MS = 120_000;

export interface SystemGitOptions
{
    binary?: string;
    timeoutMs?: number;
    run?: CommandRunner;
}

export class SystemGitPort implements GitPort
{
    private readonly options: SystemGitOptions;

    constructor(options: SystemGitOptions = {})
    {
        this.options = options;
    }

    /** Start a repository, or leave the one that is already there alone. */
    async init(request: { cwd: string }): Promise<void>
    {
        if (existsSync(join(request.cwd, '.git')))
        {
            return;
        }

        const result = await this.git(request.cwd, ['init']);

        if (result.exitCode !== 0)
        {
            throw new Error(`git init failed: ${summarize(result)}`);
        }
    }

    /**
     * Whether the worktree has nothing uncommitted.
     *
     * A Git call that fails is *not* reported as clean. An update refuses to
     * start on a dirty worktree, and answering "clean" because the question
     * could not be asked would turn a missing answer into permission.
     */
    async isClean(request: { cwd: string }): Promise<boolean>
    {
        const result = await this.git(request.cwd, ['status', '--porcelain']);

        if (result.exitCode !== 0)
        {
            throw new Error(`git status failed: ${summarize(result)}`);
        }

        return result.stdout.trim().length === 0;
    }

    async commit(request: { cwd: string; message: string }): Promise<{ commit: string }>
    {
        const staged = await this.git(request.cwd, ['add', '-A']);

        if (staged.exitCode !== 0)
        {
            throw new Error(`git add failed: ${summarize(staged)}`);
        }

        const result = await this.git(request.cwd, [
            ...(await this.identityArguments(request.cwd)),
            'commit',
            '--no-verify',
            '-m',
            request.message,
        ]);

        if (result.exitCode !== 0)
        {
            throw new Error(`git commit failed: ${summarize(result)}`);
        }

        const head = await this.head(request);

        if (head === null)
        {
            throw new Error('git commit reported success but the repository has no HEAD.');
        }

        return { commit: head };
    }

    /** The current commit, or null in a repository that has none yet. */
    async head(request: { cwd: string }): Promise<string | null>
    {
        const result = await this.git(request.cwd, ['rev-parse', 'HEAD']);

        return result.exitCode === 0 ? result.stdout.trim() || null : null;
    }

    /**
     * `-c user.name=… -c user.email=…`, but only when Git has neither.
     *
     * `--no-verify` above and this together mean a commit works on a machine
     * that has never been set up, without either one changing what the machine
     * does for anything else.
     */
    private async identityArguments(cwd: string): Promise<string[]>
    {
        const name = await this.git(cwd, ['config', '--get', 'user.name']);
        const email = await this.git(cwd, ['config', '--get', 'user.email']);

        if (name.exitCode === 0 && name.stdout.trim().length > 0
            && email.exitCode === 0 && email.stdout.trim().length > 0)
        {
            return [];
        }

        return ['-c', `user.name=${FALLBACK_AUTHOR_NAME}`, '-c', `user.email=${FALLBACK_AUTHOR_EMAIL}`];
    }

    private git(cwd: string, args: string[]): ReturnType<CommandRunner>
    {
        return (this.options.run ?? runCommand)({
            file: this.options.binary ?? 'git',
            args,
            cwd,
            // Git must never stop for a credential prompt inside an operation
            // that has no terminal to answer it on.
            extraEnv: { GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' },
            timeoutMs: this.options.timeoutMs ?? DEFAULT_GIT_TIMEOUT_MS,
        });
    }
}
