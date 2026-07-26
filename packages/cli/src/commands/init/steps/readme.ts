import { existsSync, readFileSync } from 'fs';
import { basename, join } from 'path';
import fse from 'fs-extra';
import { logger } from '../../../utils/logger.js';
import { getRunCommand, type PackageManager } from '../../../utils/package-manager.js';
import { findTemplatesPath } from '../utils/templates.js';
import type { PackageJson } from './validate.js';
import type { ScaffoldMode } from '../mode.js';

const { writeFileSync } = fse;

interface ReadmeContext
{
    pm: PackageManager;
    packageJson: PackageJson;
    mode: ScaffoldMode;
    // `spfn create` sets this so the SPFN README replaces the create-next-app
    // default; a standalone `spfn init` leaves it false to keep any existing README.
    overwrite: boolean;
}

interface RenderVars
{
    projectName: string;
    pm: string;
    pmExec: string;
    pmRun: string;
    mode: ScaffoldMode;
}

/**
 * Create a SPFN-flavored README.md.
 *
 * Policy: a standalone `spfn init` never clobbers an existing README. `spfn create`
 * passes `overwrite: true` so the freshly scaffolded create-next-app README is
 * replaced with the SPFN one. If the template can't be read, the existing README
 * (e.g. the create-next-app default) is left in place rather than deleted.
 */
export async function setupReadme(cwd: string, ctx: ReadmeContext): Promise<void>
{
    const readmePath = join(cwd, 'README.md');

    if (existsSync(readmePath) && !ctx.overwrite)
    {
        logger.info('README.md already exists — keeping it');

        return;
    }

    const templatePath = join(findTemplatesPath(), 'README.md');
    let template: string;

    try
    {
        template = readFileSync(templatePath, 'utf-8');
    }
    catch
    {
        logger.warn('README template not found — skipping README generation');

        return;
    }

    const content = renderReadme(template, {
        projectName: ctx.packageJson.name || basename(cwd) || 'my-app',
        pm: ctx.pm,
        pmExec: ctx.pm === 'npm' ? 'npx' : ctx.pm,
        pmRun: getRunCommand(ctx.pm),
        mode: ctx.mode,
    });

    writeFileSync(readmePath, content);
    logger.success('Created README.md');
}

/**
 * Substitute template placeholders and resolve the optional auth block.
 * The auth block is delimited by `<!-- {{#auth}} -->` / `<!-- {{/auth}} -->`:
 * kept (markers stripped) when auth is included, removed entirely otherwise.
 * Line terminators are matched as `\r?\n` so a CRLF-checked-out template still
 * strips the block.
 */
function renderReadme(template: string, vars: RenderVars): string
{
    const authBlock = /\r?\n?<!-- \{\{#auth\}\} -->\r?\n([\s\S]*?)\r?\n<!-- \{\{\/auth\}\} -->\r?\n/;

    // Function replacers so a value containing `$` (e.g. a directory name used as
    // projectName) is inserted literally, not read as a $1/$& replacement pattern.
    return template
        .replace(authBlock, vars.mode === 'full' ? '\n$1\n' : '\n')
        .replaceAll('{{mode}}', () => vars.mode)
        .replaceAll('{{projectName}}', () => vars.projectName)
        .replaceAll('{{pmRun}}', () => vars.pmRun)
        .replaceAll('{{pmExec}}', () => vars.pmExec)
        .replaceAll('{{pm}}', () => vars.pm);
}
