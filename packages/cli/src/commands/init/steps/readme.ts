import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import fse from 'fs-extra';
import { logger } from '../../../utils/logger.js';
import { findTemplatesPath } from '../utils/templates.js';
import type { PackageJson } from './validate.js';

const { writeFileSync } = fse;

interface ReadmeContext
{
    pm: string;
    packageJson: PackageJson;
    includeAuth: boolean;
}

interface RenderVars
{
    projectName: string;
    pm: string;
    pmRun: string;
    includeAuth: boolean;
}

/**
 * Create a SPFN-flavored README.md when the project doesn't already have one.
 *
 * Policy: if a README.md is present, leave it untouched — we never clobber an
 * existing README. `spfn create` deletes the create-next-app README right after
 * scaffolding, so a fresh `create` lands the SPFN README here, while a standalone
 * `spfn init` preserves whatever README the project already has.
 */
export async function setupReadme(cwd: string, ctx: ReadmeContext): Promise<void>
{
    const readmePath = join(cwd, 'README.md');

    if (existsSync(readmePath))
    {
        logger.info('README.md already exists — keeping it');
        return;
    }

    const templatePath = join(findTemplatesPath(), 'README.md');

    if (!existsSync(templatePath))
    {
        logger.warn('README template not found — skipping README generation');
        return;
    }

    const projectName = ctx.packageJson.name || cwd.split('/').pop() || 'my-app';
    const pmRun = ctx.pm === 'npm' ? 'npm run' : `${ctx.pm} run`;

    const content = renderReadme(readFileSync(templatePath, 'utf-8'), {
        projectName,
        pm: ctx.pm,
        pmRun,
        includeAuth: ctx.includeAuth,
    });

    writeFileSync(readmePath, content);
    logger.success('Created README.md');
}

/**
 * Substitute template placeholders and resolve the optional auth block.
 * The auth block is delimited by `<!-- {{#auth}} -->` / `<!-- {{/auth}} -->`:
 * kept (markers stripped) when auth is included, removed entirely otherwise.
 */
function renderReadme(template: string, vars: RenderVars): string
{
    const authBlock = /\n?<!-- \{\{#auth\}\} -->\n([\s\S]*?)\n<!-- \{\{\/auth\}\} -->\n/;

    return template
        .replace(authBlock, vars.includeAuth ? '\n$1\n' : '\n')
        .replaceAll('{{projectName}}', vars.projectName)
        .replaceAll('{{pmRun}}', vars.pmRun)
        .replaceAll('{{pm}}', vars.pm);
}
