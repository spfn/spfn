/**
 * Route Definition Helper
 *
 * Provides tRPC-style route definition with:
 * - Input validation (params, query, body)
 * - Optional response type
 * - Middleware support
 * - Type inference from handler return value
 */

import type { Static, TSchema } from '@sinclair/typebox';
import type { Context, MiddlewareHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { NamedMiddleware } from './define-middleware';

/**
 * Route input schemas
 */
export type RouteInput = {
    params?: TSchema;
    query?: TSchema;
    body?: TSchema;
    headers?: TSchema;
    cookies?: TSchema;
};

/**
 * Merge input with interceptor-injected fields
 * Server receives both client input and interceptor-injected fields
 *
 * @example
 * ```ts
 * type ClientInput = { body: { email: string, password: string } };
 * type InterceptorInput = { body: { publicKey: string, keyId: string } };
 * // MergedInput = { body: { email: string, password: string, publicKey: string, keyId: string } }
 * ```
 */
type MergedInput<TInput extends RouteInput, TInterceptor extends RouteInput> = {
    params: (TInput['params'] extends TSchema ? Static<TInput['params']> : {}) &
            (TInterceptor['params'] extends TSchema ? Static<TInterceptor['params']> : {});
    query: (TInput['query'] extends TSchema ? Static<TInput['query']> : {}) &
           (TInterceptor['query'] extends TSchema ? Static<TInterceptor['query']> : {});
    body: (TInput['body'] extends TSchema ? Static<TInput['body']> : {}) &
          (TInterceptor['body'] extends TSchema ? Static<TInterceptor['body']> : {});
    headers: (TInput['headers'] extends TSchema ? Static<TInput['headers']> : {}) &
             (TInterceptor['headers'] extends TSchema ? Static<TInterceptor['headers']> : {});
    cookies: (TInput['cookies'] extends TSchema ? Static<TInput['cookies']> : {}) &
             (TInterceptor['cookies'] extends TSchema ? Static<TInterceptor['cookies']> : {});
};

/**
 * RouteBuilderContext - define-route dedicated context
 *
 * Provides structured input access through data() method
 */
export type RouteBuilderContext<
    TInput extends RouteInput = RouteInput,
    TInterceptor extends RouteInput = {}
> = {
    /**
     * Get structured input data
     *
     * Returns an object with separate params, query, body, headers, cookies
     * If interceptor fields are defined, they are merged with input fields
     *
     * @example
     * ```ts
     * // GET /users/:id?page=1
     * const { params, query } = await c.data();
     * // params = { id: string }
     * // query = { page: number }
     *
     * // POST /users with headers
     * const { body, headers } = await c.data();
     * // body = { name: string }
     * // headers = { authorization: string }
     *
     * // With interceptor-injected fields
     * const { body } = await c.data();
     * // body = { email: string, password: string, publicKey: string, keyId: string }
     * ```
     */
    data(): Promise<MergedInput<TInput, TInterceptor>>;

    // Response helpers

    /**
     * Return JSON response with custom status and headers
     *
     * @example
     * ```ts
     * return c.json({ message: 'Custom response' }, 200);
     * ```
     */
    json(
        data: any,
        status?: ContentfulStatusCode,
        headers?: Record<string, string | string[]>
    ): Response;

    /**
     * Return 201 Created response with optional Location header
     * Returns data directly (no wrapper)
     *
     * @example
     * ```ts
     * const user = await createUser(body);
     * return c.created(user, `/users/${user.id}`);
     * // Response: 201 Created
     * // Header: Location: /users/123
     * // Body: { id: '123', name: 'John' }
     * ```
     */
    created(data: any, location?: string): Response;

    /**
     * Return 202 Accepted response
     * Returns data directly (no wrapper), or empty body if no data
     *
     * @example
     * ```ts
     * // With data
     * return c.accepted({ jobId: '123' });
     * // Response: 202 Accepted, Body: { jobId: '123' }
     *
     * // Without data
     * return c.accepted();
     * // Response: 202 Accepted, Body: (empty)
     * ```
     */
    accepted(data?: any): Response;

    /**
     * Return 204 No Content response (empty body)
     *
     * @example
     * ```ts
     * await deleteUser(id);
     * return c.noContent();
     * // Response: 204 No Content, Body: (empty)
     * ```
     */
    noContent(): Response;

    /**
     * Return 304 Not Modified response (empty body)
     *
     * @example
     * ```ts
     * if (etag === requestEtag) {
     *   return c.notModified();
     * }
     * // Response: 304 Not Modified, Body: (empty)
     * ```
     */
    notModified(): Response;

    /**
     * Return paginated response with metadata
     * Returns `{ items: [...], pagination: {...} }` format
     *
     * @example
     * ```ts
     * const users = await getUsers(page, limit);
     * const total = await countUsers();
     * return c.paginated(users, page, limit, total);
     * // Response: {
     * //   items: [...],
     * //   pagination: {
     * //     page: 1,
     * //     limit: 20,
     * //     total: 100,
     * //     totalPages: 5
     * //   }
     * // }
     * ```
     */
    paginated(
        data: any[],
        page: number,
        limit: number,
        total: number
    ): Response;

    // Raw Hono context for advanced usage
    raw: Context;
};

/**
 * Route handler function
 */
export type RouteHandlerFn<
    TInput extends RouteInput = RouteInput,
    TInterceptor extends RouteInput = {},
    TResponse = any
> = (c: RouteBuilderContext<TInput, TInterceptor>) => Response | Promise<Response> | TResponse | Promise<TResponse>;

/**
 * Route definition result
 *
 * Contains all information needed for type inference and registration
 */
export type RouteDef<
    TInput extends RouteInput = RouteInput,
    TInterceptor extends RouteInput = {},
    TResponse = any
> = {
    method?: HttpMethod;
    path?: string;
    input?: TInput;
    interceptor?: TInterceptor;
    middlewares?: (MiddlewareHandler | NamedMiddleware<any>)[];
    skipMiddlewares?: string[] | '*';
    handler: RouteHandlerFn<TInput, TInterceptor, TResponse>;

    // Type inference helpers
    _input: TInput;
    _interceptor: TInterceptor;
    _response: TResponse;
};

/**
 * HTTP methods
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Route builder with chainable API (tRPC-style)
 */
export class RouteBuilder<
    TInput extends RouteInput = {},
    TInterceptor extends RouteInput = {},
    TResponse = never
>
{
    public _method?: HttpMethod;
    public _path?: string;
    public _input?: TInput;
    public _interceptor?: TInterceptor;
    public _middlewares?: (MiddlewareHandler | NamedMiddleware<any>)[];
    public _skipMiddlewares?: string[] | '*';

    /**
     * Define input schemas
     *
     * @example
     * ```ts
     * route.get('/users/:id')
     *   .input({
     *     params: Type.Object({ id: Type.String() }),
     *     query: Type.Object({ page: Type.Number() }),
     *     headers: Type.Object({ authorization: Type.String() })
     *   })
     *   .handler(async (c) => {
     *     const { params, query, headers } = await c.data();
     *     // params = { id: string }
     *     // query = { page: number }
     *     // headers = { authorization: string }
     *   })
     * ```
     */
    input<TNewInput extends RouteInput>(input: TNewInput): RouteBuilder<TNewInput, TInterceptor, TResponse>
    {
        const builder = new RouteBuilder<TNewInput, TInterceptor, TResponse>();
        builder._method = this._method;
        builder._path = this._path;
        builder._middlewares = this._middlewares;
        builder._skipMiddlewares = this._skipMiddlewares;
        builder._interceptor = this._interceptor;
        builder._input = input;
        return builder;
    }

    /**
     * Define fields injected by interceptors
     *
     * These fields are:
     * - Available in the handler (merged with input)
     * - Excluded from client types (codegen uses only input)
     * - Not validated by route input schema (injected by middleware)
     *
     * Use this when middleware/interceptors add fields to the request
     * before it reaches the handler.
     *
     * @example
     * ```ts
     * // Auth interceptor injects crypto key fields
     * route.post('/_auth/login')
     *   .input({
     *     body: Type.Object({
     *       email: Type.String(),
     *       password: Type.String()
     *     })
     *   })
     *   .interceptor({
     *     body: Type.Object({
     *       publicKey: Type.String(),
     *       keyId: Type.String(),
     *       fingerprint: Type.String()
     *     })
     *   })
     *   .handler(async (c) => {
     *     const { body } = await c.data();
     *     // body type: { email, password, publicKey, keyId, fingerprint }
     *     // Client only sees: { email, password }
     *     return loginService(body);
     *   });
     * ```
     */
    interceptor<TNewInterceptor extends RouteInput>(
        interceptor: TNewInterceptor
    ): RouteBuilder<TInput, TNewInterceptor, TResponse>
    {
        const builder = new RouteBuilder<TInput, TNewInterceptor, TResponse>();
        builder._method = this._method;
        builder._path = this._path;
        builder._input = this._input;
        builder._middlewares = this._middlewares;
        builder._skipMiddlewares = this._skipMiddlewares;
        builder._interceptor = interceptor;
        return builder;
    }

    /**
     * Add middlewares to the route
     *
     * Accepts both regular middleware handlers and named middlewares (NamedMiddleware).
     * Named middlewares that are already registered globally will be automatically
     * deduplicated to prevent double execution.
     *
     * @example
     * ```ts
     * import { authenticate } from '@spfn/auth/server/middleware';
     *
     * // With NamedMiddleware (auto-deduped if registered globally)
     * route.get('/users')
     *   .use([authenticate, RateLimitMiddleware()])
     *
     * // With regular middleware handlers
     * route.get('/users')
     *   .use([AuthMiddleware(), RateLimitMiddleware()])
     * ```
     */
    middleware(middlewares: (MiddlewareHandler | NamedMiddleware<any>)[]): RouteBuilder<TInput, TInterceptor, TResponse>
    {
        const builder = new RouteBuilder<TInput, TInterceptor, TResponse>();
        builder._method = this._method;
        builder._path = this._path;
        builder._input = this._input;
        builder._interceptor = this._interceptor;
        builder._middlewares = middlewares;
        builder._skipMiddlewares = this._skipMiddlewares;
        return builder;
    }

    /**
     * Add middlewares to the route (alias for `.middleware()`)
     *
     * Accepts both regular middleware handlers and named middlewares (NamedMiddleware).
     * Named middlewares that are already registered globally will be automatically
     * deduplicated to prevent double execution.
     *
     * @example
     * ```ts
     * import { authenticate } from '@spfn/auth/server/middleware';
     *
     * // With NamedMiddleware (auto-deduped if registered globally)
     * route.get('/users')
     *   .use([authenticate, RateLimitMiddleware()])
     *
     * // With regular middleware handlers
     * route.get('/users')
     *   .use([AuthMiddleware(), RateLimitMiddleware()])
     * ```
     */
    use(middlewares: (MiddlewareHandler | NamedMiddleware<any>)[]): RouteBuilder<TInput, TInterceptor, TResponse>
    {
        return this.middleware(middlewares);
    }

    /**
     * Skip server-level named middlewares
     *
     * Useful for public endpoints that should bypass auth or rate limiting
     *
     * @param middlewareNames - Array of middleware names to skip, or '*' to skip all
     *
     * @example
     * ```ts
     * // Skip specific middlewares
     * route.get('/health')
     *   .skip(['auth', 'rateLimit'])
     *   .handler(async (c) => c.success({ status: 'ok' }));
     *
     * // Skip only auth (still apply rate limiting)
     * route.get('/public-data')
     *   .skip(['auth'])
     *   .handler(async (c) => { ... });
     *
     * // Skip all middlewares
     * route.get('/public-health')
     *   .skip('*')
     *   .handler(async (c) => c.success({ status: 'ok' }));
     * ```
     */
    skip(middlewareNames: string[] | '*'): RouteBuilder<TInput, TInterceptor, TResponse>
    {
        const builder = new RouteBuilder<TInput, TInterceptor, TResponse>();
        builder._method = this._method;
        builder._path = this._path;
        builder._input = this._input;
        builder._interceptor = this._interceptor;
        builder._middlewares = this._middlewares;
        builder._skipMiddlewares = middlewareNames;
        return builder;
    }

    /**
     * Define handler function
     *
     * @example
     * ```ts
     * route.get('/users/:id')
     *   .input(Type.Object({ id: Type.String() }))
     *   .handler(async (c) => {
     *     const { id } = await c.data();
     *     const user = await getUser(id);
     *     return c.success(user); // Type inferred!
     *   })
     * ```
     */
    handler<THandlerResponse>(
        fn: RouteHandlerFn<TInput, TInterceptor, THandlerResponse>
    ): RouteDef<TInput, TInterceptor, THandlerResponse>
    {
        return {
            method: this._method,
            path: this._path,
            input: this._input,
            interceptor: this._interceptor,
            middlewares: this._middlewares,
            skipMiddlewares: this._skipMiddlewares,
            handler: fn,
            _input: {} as TInput,
            _interceptor: {} as TInterceptor,
            _response: {} as THandlerResponse,
        };
    }
}

/**
 * Create a route definition with HTTP method shortcuts
 *
 * ## Explicit input definition
 *
 * @example
 * ```ts
 * // GET request - path params + query params
 * export const getUser = route.get('/users/:id')
 *   .input({
 *     params: Type.Object({ id: Type.String() }),
 *     query: Type.Object({ includeOrg: Type.Boolean() })
 *   })
 *   .handler(async (c) => {
 *     // GET /users/123?includeOrg=true
 *     const { params, query } = await c.data();
 *     const user = await db.user.findUnique({
 *       where: { id: params.id },
 *       include: { organization: query.includeOrg }
 *     });
 *     return c.success(user);
 *   });
 *
 * // POST request - body only
 * export const createUser = route.post('/users')
 *   .input({
 *     body: Type.Object({
 *       name: Type.String(),
 *       email: Type.String()
 *     })
 *   })
 *   .handler(async (c) => {
 *     // POST /users { name, email }
 *     const { body } = await c.data();
 *     const user = await db.user.create({ data: body });
 *     return c.created(user);
 *   });
 *
 * // PUT request - path params + body
 * export const updateUser = route.put('/users/:id')
 *   .input({
 *     params: Type.Object({ id: Type.String() }),
 *     body: Type.Object({
 *       name: Type.String(),
 *       email: Type.String()
 *     })
 *   })
 *   .handler(async (c) => {
 *     // PUT /users/123 { name, email }
 *     const { params, body } = await c.data();
 *     const user = await db.user.update({
 *       where: { id: params.id },
 *       data: body
 *     });
 *     return c.success(user);
 *   });
 *
 * // With headers validation
 * export const protectedRoute = route.get('/protected')
 *   .input({
 *     headers: Type.Object({
 *       authorization: Type.String()
 *     })
 *   })
 *   .handler(async (c) => {
 *     const { headers } = await c.data();
 *     const token = headers.authorization;
 *     // ... verify token
 *     return c.success({ message: 'authorized' });
 *   });
 * ```
 *
 * ## With middleware
 *
 * @example
 * ```ts
 * export const createUser = route.post('/users')
 *   .input({
 *     body: Type.Object({ name: Type.String() })
 *   })
 *   .use([AuthMiddleware(), Transactional()])
 *   .handler(async (c) => {
 *     const { body } = await c.data();
 *     const user = await db.user.create({ data: body });
 *     return c.created(user);
 *   });
 * ```
 *
 * ## Explicit response type (for union types, complex types)
 *
 * @example
 * ```ts
 * type PostResponse =
 *   | { status: 'draft'; content: string }
 *   | { status: 'published'; content: string; publishedAt: Date };
 *
 * export const getPost = route.get('/posts/:id')
 *   .input({
 *     params: Type.Object({ id: Type.String() })
 *   })
 *   .handler<PostResponse>(async (c) => {
 *     const { params } = await c.data();
 *     const post = await getPost(params.id);
 *     if (post.published) {
 *       return c.success({ status: 'published', content: post.content, publishedAt: post.publishedAt });
 *     }
 *     return c.success({ status: 'draft', content: post.content });
 *   });
 * ```
 */
function createMethodRoute(method: HttpMethod): (path: string) => RouteBuilder
{
    return (path: string) =>
    {
        const builder = new RouteBuilder();
        builder._method = method;
        builder._path = path;
        return builder;
    };
}

export const route = {
    get: createMethodRoute('GET'),
    post: createMethodRoute('POST'),
    put: createMethodRoute('PUT'),
    patch: createMethodRoute('PATCH'),
    delete: createMethodRoute('DELETE'),
};

/**
 * Router definition - holds all routes
 */
export interface Router<TRoutes extends Record<string, RouteDef<any> | Router<any>>> {
    routes: TRoutes;
    _routes: TRoutes;
    _packageRouters: Router<any>[];
    _globalMiddlewares: NamedMiddleware<any>[];

    /**
     * Register package routers (type-hidden)
     *
     * Package routes are:
     * - Recognized by RPC proxy and backend
     * - NOT exposed in client types (use package's own API like authApi, cmsApi)
     *
     * @example
     * ```ts
     * import { authRouter } from '@spfn/auth/server';
     * import { cmsAppRouter } from '@spfn/cms/server';
     *
     * export const appRouter = defineRouter({
     *     getRoot,
     *     getHealth,
     * })
     * .packages([authRouter, cmsAppRouter]);
     *
     * // Client usage:
     * // api.getRoot.call({})     ✅ app routes
     * // api.auth.login.call()    ❌ type error (use authApi instead)
     * // authApi.login.call({})   ✅ package API
     * ```
     */
    packages(routers: Router<any>[]): Router<TRoutes>;

    /**
     * Register global middlewares
     *
     * Applied to all routes unless explicitly skipped via .skip()
     *
     * @example
     * ```ts
     * import { authMiddleware, loggingMiddleware } from './middlewares';
     *
     * export const appRouter = defineRouter({
     *     getRoot,
     *     getHealth,
     * })
     * .packages([authRouter])
     * .use([authMiddleware, loggingMiddleware]);
     * ```
     */
    use(middlewares: NamedMiddleware<any>[]): Router<TRoutes>;
}

/**
 * Create a Router instance with chainable methods
 */
function createRouterInstance<TRoutes extends Record<string, RouteDef<any> | Router<any>>>(
    routes: TRoutes,
    packageRouters: Router<any>[] = [],
    globalMiddlewares: NamedMiddleware<any>[] = []
): Router<TRoutes>
{
    const router: Router<TRoutes> = {
        routes,
        _routes: routes,
        _packageRouters: packageRouters,
        _globalMiddlewares: globalMiddlewares,

        packages(routers: Router<any>[]): Router<TRoutes>
        {
            const newPackageRouters = [...this._packageRouters, ...routers];

            // Also include nested package routers if any
            for (const pkgRouter of routers)
            {
                if (pkgRouter._packageRouters?.length > 0)
                {
                    newPackageRouters.push(...pkgRouter._packageRouters);
                }
            }

            return createRouterInstance(this.routes, newPackageRouters, this._globalMiddlewares);
        },

        use(middlewares: NamedMiddleware<any>[]): Router<TRoutes>
        {
            return createRouterInstance(this.routes, this._packageRouters, [...this._globalMiddlewares, ...middlewares]);
        },
    };

    return router;
}

/**
 * Define a router with multiple routes (tRPC-style)
 *
 * Supports chainable API for packages and middlewares:
 *
 * @example
 * ```ts
 * // Basic usage
 * export const appRouter = defineRouter({
 *     getRoot,
 *     getHealth,
 *     listExamples,
 * });
 *
 * // With package routers (type-hidden)
 * export const appRouter = defineRouter({
 *     getRoot,
 *     getHealth,
 * })
 * .packages([authRouter, cmsAppRouter]);
 *
 * // With global middlewares
 * export const appRouter = defineRouter({
 *     getRoot,
 *     getHealth,
 * })
 * .packages([authRouter])
 * .use([authMiddleware, loggingMiddleware]);
 *
 * export type AppRouter = typeof appRouter;
 * ```
 *
 * Package routes:
 * - Recognized by RPC proxy and backend for routing
 * - NOT included in AppRouter type (use authApi, cmsApi instead)
 * - Prevents confusion between app API and package APIs
 */
export function defineRouter<TRoutes extends Record<string, RouteDef<any> | Router<any>>>(
    routes: TRoutes
): Router<TRoutes>
{
    return createRouterInstance(routes);
}