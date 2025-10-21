/**
 * Create App - Hono Wrapper for Contract-based Routing
 *
 * Provides a cleaner API for registering routes with contracts
 */

import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { bind } from './bind.js';
import type { RouteContract, RouteHandler } from './types.js';

export type SPFNApp = Hono & {
    bind<TContract extends RouteContract>(
        contract: TContract,
        handler: RouteHandler
    ): void;

    bind<TContract extends RouteContract>(
        contract: TContract,
        middlewares: MiddlewareHandler[],
        handler: RouteHandler
    ): void;

    _contractMetas?: Map<string, RouteContract['meta']>;
};

/**
 * Create SPFN app instance
 *
 * Wraps Hono with contract-based routing support
 */
export function createApp(): SPFNApp
{
    const hono = new Hono();
    const app = hono as SPFNApp;

    app._contractMetas = new Map();

    const methodMap = new Map<string, (path: string, handlers: any[]) => void>([
        ['get', (path, handlers) => hono.get(path, ...handlers)],
        ['post', (path, handlers) => hono.post(path, ...handlers)],
        ['put', (path, handlers) => hono.put(path, ...handlers)],
        ['patch', (path, handlers) => hono.patch(path, ...handlers)],
        ['delete', (path, handlers) => hono.delete(path, ...handlers)],
    ]);

    app.bind = function <TContract extends RouteContract>(
        contract: TContract,
        ...args: [RouteHandler] | [MiddlewareHandler[], RouteHandler]
    )
    {
        const method = contract.method.toLowerCase();
        const path = contract.path;

        const [middlewares, handler] = args.length === 1
            ? [[], args[0]]
            : [args[0], args[1]];

        if (contract.meta)
        {
            const key = `${contract.method} ${path}`;
            app._contractMetas!.set(key, contract.meta);
        }

        const boundHandler = bind(contract, handler);
        const handlers = middlewares.length > 0
            ? [...middlewares, boundHandler]
            : [boundHandler];

        const registerMethod = methodMap.get(method);
        if (!registerMethod)
        {
            throw new Error(`Unsupported HTTP method: ${contract.method}`);
        }

        registerMethod(path, handlers);
    };

    return app;
}