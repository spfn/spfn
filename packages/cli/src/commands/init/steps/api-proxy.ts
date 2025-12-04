import { existsSync } from 'fs';
import { join } from 'path';
import fse from 'fs-extra';
import { logger } from '../../../utils/logger.js';

const { ensureDirSync, writeFileSync } = fse;

/**
 * Create RPC proxy route in Next.js app directory
 * Enables HttpOnly session cookies to work in client components
 */
export async function setupApiProxy(cwd: string, includeAuth: boolean): Promise<void>
{
    // Check if src directory exists (created by create-next-app --src-dir)
    const appDir = existsSync(join(cwd, 'src', 'app'))
        ? join(cwd, 'src', 'app')
        : join(cwd, 'app');
    const rpcDir = join(appDir, 'api', 'rpc', '[routeName]');
    const rpcRoutePath = join(rpcDir, 'route.ts');

    if (!existsSync(rpcRoutePath))
    {
        ensureDirSync(rpcDir);

        const authImport = includeAuth ? `import '@spfn/auth/nextjs/api';\n` : '';

        const routeContent = `/**
 * SPFN RPC Proxy
 *
 * Resolves routeName to actual HTTP method and path from router,
 * then forwards requests to SPFN API server with automatic:
 * - Cookie forwarding
 * - Interceptor execution
 * - Header manipulation
 *
 * Note: Imports from '@spfn/core/nextjs/server' (server-only)
 * Uses next/headers internally - do not import in Client Components
 */

${authImport}import { appRouter } from '@/server/router';
import { createRpcProxy } from '@spfn/core/nextjs/server';

export const { GET, POST } = createRpcProxy({ router: appRouter });
`;
        writeFileSync(rpcRoutePath, routeContent);
        const relativePath = rpcRoutePath.replace(cwd + '/', '');
        logger.success(`Created ${relativePath} (RPC proxy)`);
    }
}