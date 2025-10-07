/**
 * Create App - Hono Wrapper for Contract-based Routing
 *
 * Provides a cleaner API for registering routes with contracts
 */

import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { bind } from './bind.js';
import type { RouteContract, RouteHandler } from './types.js';

/**
 * Extended Hono app with bind() method
 */
export type SPFNApp = Hono & {
    /**
     * Bind a contract to a handler with optional middlewares
     *
     * @example
     * ```ts
     * // Handler only
     * app.bind(getUserContract, async (c) => {
     *     return c.json({ id: c.params.id });
     * });
     *
     * // With middlewares
     * app.bind(createUserContract, [authMiddleware, logMiddleware], async (c) => {
     *     const body = await c.data();
     *     return c.json({ id: '123' });
     * });
     * ```
     */
    bind<TContract extends RouteContract>(
        contract: TContract,
        handler: RouteHandler
    ): void;

    bind<TContract extends RouteContract>(
        contract: TContract,
        middlewares: MiddlewareHandler[],
        handler: RouteHandler
    ): void;
};

/**
 * Create SPFN app instance
 *
 * Wraps Hono with contract-based routing support
 *
 * @example
 * ```ts
 * import { createApp } from '@spfn/core/route';
 * import { getUserContract, createUserContract } from '@/server/contracts/users';
 *
 * const app = createApp();
 *
 * // Register routes using contracts
 * app.bind(getUserContract, async (c) => {
 *     return c.json({ id: c.params.id });
 * });
 *
 * app.bind(createUserContract, [authMiddleware], async (c) => {
 *     const body = await c.data();
 *     return c.json({ id: '123' });
 * });
 *
 * export default app;
 * ```
 */
export function createApp(): SPFNApp
{
    const hono = new Hono();

    // Add bind method
    const app = hono as SPFNApp;

    app.bind = function <TContract extends RouteContract>(
        contract: TContract,
        ...args: [RouteHandler] | [MiddlewareHandler[], RouteHandler]
    )
    {
        const method = contract.method.toLowerCase();
        const path = contract.path;

        // Extract middlewares and handler
        let middlewares: MiddlewareHandler[] = [];
        let handler: RouteHandler;

        if (args.length === 1)
        {
            handler = args[0];
        }
        else
        {
            middlewares = args[0];
            handler = args[1];
        }

        // Register with Hono using bind() for validation
        const boundHandler = bind(contract, handler);

        // Register based on HTTP method
        if (middlewares.length > 0)
        {
            switch (method)
            {
                case 'get':
                    hono.get(path, ...middlewares, boundHandler);
                    break;
                case 'post':
                    hono.post(path, ...middlewares, boundHandler);
                    break;
                case 'put':
                    hono.put(path, ...middlewares, boundHandler);
                    break;
                case 'patch':
                    hono.patch(path, ...middlewares, boundHandler);
                    break;
                case 'delete':
                    hono.delete(path, ...middlewares, boundHandler);
                    break;
                default:
                    throw new Error(`Unsupported HTTP method: ${contract.method}`);
            }
        }
        else
        {
            switch (method)
            {
                case 'get':
                    hono.get(path, boundHandler);
                    break;
                case 'post':
                    hono.post(path, boundHandler);
                    break;
                case 'put':
                    hono.put(path, boundHandler);
                    break;
                case 'patch':
                    hono.patch(path, boundHandler);
                    break;
                case 'delete':
                    hono.delete(path, boundHandler);
                    break;
                default:
                    throw new Error(`Unsupported HTTP method: ${contract.method}`);
            }
        }
    };

    return app;
}