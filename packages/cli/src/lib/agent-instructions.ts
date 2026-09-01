import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { BEGIN_MARKER, END_MARKER, renderAgentInstructions } from './agent-instructions-template.js';

export type AgentInstructionsAction = 'created' | 'appended' | 'replaced' | 'unchanged' | 'skipped';

export interface AgentInstructionsResult
{
    action: AgentInstructionsAction;

    /**
     * Set only when the sync refused to touch the file and the user has to act.
     * Returned rather than printed so the module stays free of console output;
     * the caller logs it once.
     */
    warning?: string;
}

export interface SyncAgentInstructionsOptions
{
    /** `false` from `spfn dev --no-agent-files`. The environment opts out too. */
    agentFiles?: boolean;
}

const AGENTS_FILE = 'AGENTS.md';
const CLAUDE_FILE = 'CLAUDE.md';

/**
 * Write the generated agent-instruction block into `<projectRoot>/AGENTS.md`.
 *
 * `projectRoot` is exactly where dev runs — the sync never walks upward looking
 * for another AGENTS.md, so a package inside a monorepo gets its own file next
 * to the app it describes rather than editing the repository root's.
 */
export function syncAgentInstructions(projectRoot: string, options: SyncAgentInstructionsOptions = {}): AgentInstructionsResult
{
    if (isOptedOut(options))
    {
        return { action: 'skipped' };
    }

    const agentsPath = join(projectRoot, AGENTS_FILE);
    const block = renderAgentInstructions();

    if (!existsSync(agentsPath))
    {
        writeFileSync(agentsPath, `${block}\n`, 'utf8');
        ensureClaudeReference(projectRoot);

        return { action: 'created' };
    }

    // A UTF-8 BOM is invisible to the author but would glue itself to the first
    // marker line and make a perfectly valid file look malformed forever. Drop
    // it on read; nothing writes one back.
    const content = withoutByteOrderMark(readFileSync(agentsPath, 'utf8'));
    const lines = content.split('\n');
    const location = locateBlock(lines);

    if (location.kind === 'malformed')
    {
        return {
            action: 'skipped',
            warning: `${AGENTS_FILE} has a malformed spfn block — expected exactly one "${BEGIN_MARKER}" line followed by one "${END_MARKER}" line. Fix or delete the markers; nothing was written.`,
        };
    }

    ensureClaudeReference(projectRoot);

    if (location.kind === 'absent')
    {
        const eol = content.includes('\r\n') ? '\r\n' : '\n';

        // One blank line separates the block from what is already there. An
        // empty file has nothing to separate from, so it gets no leading gap.
        const existing = content.replace(/(\r?\n)+$/, '');
        const separator = existing.length > 0 ? `${eol}${eol}` : '';

        writeFileSync(agentsPath, `${existing}${separator}${block.split('\n').join(eol)}${eol}`, 'utf8');

        return { action: 'appended' };
    }

    // Compare before writing. An unchanged block must cause no write at all:
    // dev may be watching this file, and a fresh mtime would feed the watcher.
    const carriageReturn = lines[location.begin].endsWith('\r') ? '\r' : '';
    const blockLines = block.split('\n').map(line => line + carriageReturn);
    const currentLines = lines.slice(location.begin, location.end + 1);

    if (currentLines.length === blockLines.length && currentLines.every((line, index) => line === blockLines[index]))
    {
        return { action: 'unchanged' };
    }

    // Only the marked lines are replaced; every other byte of the file survives.
    lines.splice(location.begin, location.end - location.begin + 1, ...blockLines);
    writeFileSync(agentsPath, lines.join('\n'), 'utf8');

    return { action: 'replaced' };
}

function isOptedOut(options: SyncAgentInstructionsOptions): boolean
{
    const fromEnv = (process.env.SPFN_AGENT_FILES ?? '').toLowerCase();

    return options.agentFiles === false || fromEnv === '0' || fromEnv === 'false';
}

type BlockLocation =
    | { kind: 'absent' }
    | { kind: 'malformed' }
    | { kind: 'found'; begin: number; end: number };

/**
 * Find the block by whole-line marker match, outside fenced code blocks.
 *
 * Anything other than one begin followed by one end is malformed: a reversed,
 * half-written or duplicated pair could be resolved several ways, and guessing
 * risks eating the user's text.
 */
function locateBlock(lines: string[]): BlockLocation
{
    const fenced = fencedLines(lines);
    const begins = lineIndicesOf(lines, BEGIN_MARKER, fenced);
    const ends = lineIndicesOf(lines, END_MARKER, fenced);

    if (begins.length === 0 && ends.length === 0)
    {
        return { kind: 'absent' };
    }

    if (begins.length !== 1 || ends.length !== 1 || ends[0] < begins[0])
    {
        return { kind: 'malformed' };
    }

    return { kind: 'found', begin: begins[0], end: ends[0] };
}

/**
 * Indices of the lines that *are* the marker. A line that merely contains the
 * marker string inside prose, or one quoted inside a code fence, is not a
 * boundary — a file documenting this very feature must survive a sync.
 */
function lineIndicesOf(lines: string[], marker: string, fenced: boolean[]): number[]
{
    const found: number[] = [];

    lines.forEach((line, index) =>
    {
        if (!fenced[index] && withoutCarriageReturn(line) === marker)
        {
            found.push(index);
        }
    });

    return found;
}

/** Opening/closing fence: three or more backticks or tildes, indentation allowed. */
const FENCE_LINE = /^\s*(`{3,}|~{3,})(.*)$/;

/**
 * Flag every line that sits inside a fenced code block, the fence lines
 * themselves included.
 *
 * Deliberately pragmatic rather than a full CommonMark parser: a fence opens on
 * a run of three or more backticks or tildes and closes on a bare run of at
 * least that many of the same character. An unclosed fence swallows the rest of
 * the file, which is what CommonMark does too.
 */
function fencedLines(lines: string[]): boolean[]
{
    let open: { character: string; length: number } | null = null;

    return lines.map(rawLine =>
    {
        const fence = FENCE_LINE.exec(withoutCarriageReturn(rawLine));

        if (open === null)
        {
            open = fence ? { character: fence[1][0], length: fence[1].length } : null;

            return false;
        }

        // A closing fence carries no info string and repeats the opening
        // character at least as many times.
        if (fence && fence[1][0] === open.character && fence[1].length >= open.length && fence[2].trim() === '')
        {
            open = null;
        }

        return true;
    });
}

function withoutCarriageReturn(line: string): string
{
    return line.endsWith('\r') ? line.slice(0, -1) : line;
}

function withoutByteOrderMark(content: string): string
{
    return content.startsWith('\uFEFF') ? content.slice(1) : content;
}

/**
 * CLAUDE.md gets created pointing at AGENTS.md, and is never touched again —
 * whatever an existing one contains is the user's, including a deliberate
 * absence of that reference.
 */
function ensureClaudeReference(projectRoot: string): void
{
    const claudePath = join(projectRoot, CLAUDE_FILE);

    if (existsSync(claudePath))
    {
        return;
    }

    writeFileSync(claudePath, `@${AGENTS_FILE}\n`, 'utf8');
}
