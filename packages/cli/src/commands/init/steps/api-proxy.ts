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
 * Resolves routeName to actual HTTP method and path from routeMap,
 * then forwards requests to SPFN API server with automatic:
 * - Cookie forwarding
 * - Interceptor execution
 * - Header manipulation
 *
 * Note: Uses generated route-map to avoid loading server code in Next.js process.
 * Run \`spfn codegen run\` if route-map.ts is missing.
 */

${authImport}import { routeMap } from '@/generated/route-map';
import { createRpcProxy } from '@spfn/core/nextjs/server';

export const { GET, POST } = createRpcProxy({ routeMap });
`;
        writeFileSync(rpcRoutePath, routeContent);
        const relativePath = rpcRoutePath.replace(cwd + '/', '');
        logger.success(`Created ${relativePath} (RPC proxy)`);
    }
}