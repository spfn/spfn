import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import fse from 'fs-extra';
import { logger } from '../../../utils/logger.js';

const { writeFileSync } = fse;

// Generated into the user's app — 2-space style, matching create-next-app output.
const AUTH_REWRITES_BLOCK = `  async rewrites() {
    // @spfn/auth: OAuth provider callbacks must return to this app's origin —
    // the oauth_csrf cookie is set here. Forward /_auth/* to the SPFN API.
    return [
      {
        source: '/_auth/:path*',
        destination: \`\${process.env.SPFN_API_URL || 'http://localhost:8790'}/_auth/:path*\`,
      },
    ];
  },`;

const NEW_CONFIG_TEMPLATE = `import type { NextConfig } from "next";

const nextConfig: NextConfig = {
${AUTH_REWRITES_BLOCK}
};

export default nextConfig;
`;

/**
 * Print the rewrite block for the user to apply by hand when the existing
 * next.config can't be patched safely.
 */
function printManualInstructions(): void
{
    logger.warn('Could not update next.config automatically.');
    logger.info('@spfn/auth OAuth requires this rewrite in your next.config:\n');
    console.log(chalk.gray(AUTH_REWRITES_BLOCK + '\n'));
}

/**
 * Ensure the /_auth/:path* → SPFN API rewrite exists in next.config.
 *
 * The OAuth CSRF cookie is host-only on the Next.js app origin, so provider
 * callbacks default to `{app URL}/_auth/oauth/:provider/callback` and must be
 * forwarded to the API by the app — without this rewrite every OAuth callback
 * 404s, including in local dev.
 */
export async function setupNextConfig(cwd: string, includeAuth: boolean): Promise<void>
{
    if (!includeAuth)
    {
        return;
    }

    const configPath = ['next.config.ts', 'next.config.js', 'next.config.mjs']
        .map(name => join(cwd, name))
        .find(existsSync);

    if (!configPath)
    {
        writeFileSync(join(cwd, 'next.config.ts'), NEW_CONFIG_TEMPLATE);
        logger.step('Created next.config.ts with the /_auth/* → SPFN API rewrite');

        return;
    }

    const content = readFileSync(configPath, 'utf-8');

    if (content.includes('/_auth/:path*'))
    {
        logger.warn('next.config already forwards /_auth/*, skipping');

        return;
    }

    if (content.includes('rewrites'))
    {
        // An existing rewrites() would need merging — leave it to the user.
        printManualInstructions();

        return;
    }

    // The optional second group captures an immediately-closed empty object
    // (`const nextConfig = {}`) so the closing brace lands on its own line.
    const patched = content.replace(
        /(const\s+nextConfig[^=]*=\s*\{)(\s*\})?/,
        (_match, opening, closing) => `${opening}\n${AUTH_REWRITES_BLOCK}${closing ? '\n}' : ''}`,
    );

    if (patched === content)
    {
        printManualInstructions();

        return;
    }

    writeFileSync(configPath, patched);
    logger.step(`Added the /_auth/* → SPFN API rewrite to ${configPath.split('/').pop()}`);
}
