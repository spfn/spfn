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
        const [middlewares, handler] = args.length === 1
            ? [[], args[0]]
            : [args[0], args[1]];

        // Register with Hono using bind() for validation
        const boundHandler = bind(contract, handler);

        // Build handler array
        const handlers = middlewares.length > 0
            ? [...middlewares, boundHandler]
            : [boundHandler];

        // Register based on HTTP method
        switch (method)
        {
            case 'get':
                hono.get(path, ...handlers);
                break;
            case 'post':
                hono.post(path, ...handlers);
                break;
            case 'put':
                hono.put(path, ...handlers);
                break;
            case 'patch':
                hono.patch(path, ...handlers);
                break;
            case 'delete':
                hono.delete(path, ...handlers);
                break;
            case 'head':
                hono.head(path, ...handlers);
                break;
            case 'options':
                hono.options(path, ...handlers);
                break;
            default:
                throw new Error(`Unsupported HTTP method: ${contract.method}`);
        }
    };

    return app;
}