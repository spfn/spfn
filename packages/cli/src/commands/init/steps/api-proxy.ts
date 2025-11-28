import { existsSync } from 'fs';
import { join } from 'path';
import fse from 'fs-extra';
import { logger } from '../../../utils/logger.js';

const { ensureDirSync, writeFileSync } = fse;

/**
 * Create API actions proxy route in Next.js app directory
 * Enables HttpOnly session cookies to work in client components
 */
export async function setupApiProxy(cwd: string, includeAuth: boolean): Promise<void>
{
    // Check if src directory exists (created by create-next-app --src-dir)
    const appDir = existsSync(join(cwd, 'src', 'app'))
        ? join(cwd, 'src', 'app')
        : join(cwd, 'app');
    const actionsDir = join(appDir, 'api', 'actions', '[[...path]]');
    const actionsRoutePath = join(actionsDir, 'route.ts');

    if (!existsSync(actionsRoutePath))
    {
        ensureDirSync(actionsDir);

        const authImport = includeAuth ? `import '@spfn/auth/nextjs/api';\n` : '';

        const routeContent = `/**
 * SPFN API Route Proxy
 *
 * Forwards all requests to SPFN API server with automatic:
 * - Cookie forwarding
 * - Interceptor execution
 * - Header manipulation
 *
 * Note: Imports from '@spfn/core/nextjs/server' (server-only)
 * Uses next/headers internally - do not import in Client Components
 */

${authImport}export { GET, POST, PUT, PATCH, DELETE } from '@spfn/core/nextjs/server';
`;
        writeFileSync(actionsRoutePath, routeContent);
        const relativePath = actionsRoutePath.replace(cwd + '/', '');
        logger.success(`Created ${relativePath} (API proxy)`);
    }
}