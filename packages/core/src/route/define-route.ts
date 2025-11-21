/**
 * Route Definition Helper
 *
 * Provides tRPC-style route definition with:
 * - Input validation (params, query, body)
 * - Optional response type
 * - Middleware support
 * - Type inference from handler return value
 */

import type { TSchema, Static } from '@sinclair/typebox';
import type { MiddlewareHandler, Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

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
 * Structured input - separates each input source
 *
 * @example
 * ```ts
 * type Input = {
 *   params: Type.Object({ id: Type.String() }),
 *   query: Type.Object({ page: Type.Number() }),
 *   body: Type.Object({ name: Type.String() }),
 *   headers: Type.Object({ authorization: Type.String() })
 * };
 * // StructuredInput<Input> = {
 * //   params: { id: string },
 * //   query: { page: number },
 * //   body: { name: string },
 * //   headers: { authorization: string },
 * //   cookies: {}
 * // }
 * ```
 */
type StructuredInput<TInput extends RouteInput> = {
    params: TInput['params'] extends TSchema ? Static<TInput['params']> : {};
    query: TInput['query'] extends TSchema ? Static<TInput['query']> : {};
    body: TInput['body'] extends TSchema ? Static<TInput['body']> : {};
    headers: TInput['headers'] extends TSchema ? Static<TInput['headers']> : {};
    cookies: TInput['cookies'] extends TSchema ? Static<TInput['cookies']> : {};
};

/**
 * RouteBuilderContext - define-route dedicated context
 *
 * Provides structured input access through data() method
 */
export type RouteBuilderContext<TInput extends RouteInput = RouteInput> = {
    /**
     * Get structured input data
     *
     * Returns an object with separate params, query, body, headers, cookies
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
     * ```
     */
    data(): Promise<StructuredInput<TInput>>;

    // Response helpers
    json(
        data: any,
        status?: ContentfulStatusCode,
        headers?: Record<string, string | string[]>
    ): Response;
    success(data: any, meta?: any, status?: ContentfulStatusCode): Response;
    created(data: any, location?: string): Response;
    accepted(data?: any): Response;
    noContent(): Response;
    notModified(): Response;

    // Pagination helper
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
    TResponse = any
> = (c: RouteBuilderContext<TInput>) => Response | Promise<Response> | TResponse | Promise<TResponse>;

/**
 * Route definition result
 *
 * Contains all information needed for type inference and registration
 */
export type RouteDef<
    TInput extends RouteInput = RouteInput,
    TResponse = any
> = {
    method?: HttpMethod;
    path?: string;
    input?: TInput;
    middlewares?: MiddlewareHandler[];
    skipMiddlewares?: string[] | '*';
    handler: RouteHandlerFn<TInput, TResponse>;

    // Type inference helpers
    _input: TInput;
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
    TResponse = never
>
{
    public _method?: HttpMethod;
    public _path?: string;
    public _input?: TInput;
    public _middlewares?: MiddlewareHandler[];
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
    input<TNewInput extends RouteInput>(input: TNewInput): RouteBuilder<TNewInput, TResponse>
    {
        const builder = new RouteBuilder<TNewInput, TResponse>();
        builder._method = this._method;
        builder._path = this._path;
        builder._middlewares = this._middlewares;
        builder._skipMiddlewares = this._skipMiddlewares;
        builder._input = input;
        return builder;
    }

    /**
     * Add middlewares
     *
     * @example
     * ```ts
     * route.get('/users')
     *   .use([AuthMiddleware(), RateLimitMiddleware()])
     * ```
     */
    use(middlewares: MiddlewareHandler[]): RouteBuilder<TInput, TResponse>
    {
        const builder = new RouteBuilder<TInput, TResponse>();
        builder._method = this._method;
        builder._path = this._path;
        builder._input = this._input;
        builder._middlewares = middlewares;
        builder._skipMiddlewares = this._skipMiddlewares;
        return builder;
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
    skip(middlewareNames: string[] | '*'): RouteBuilder<TInput, TResponse>
    {
        const builder = new RouteBuilder<TInput, TResponse>();
        builder._method = this._method;
        builder._path = this._path;
        builder._input = this._input;
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
        fn: RouteHandlerFn<TInput, THandlerResponse>
    ): RouteDef<TInput, THandlerResponse>
    {
        return {
            method: this._method,
            path: this._path,
            input: this._input,
            middlewares: this._middlewares,
            skipMiddlewares: this._skipMiddlewares,
            handler: fn,
            _input: {} as TInput,
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
export type Router<TRoutes extends Record<string, RouteDef<any> | Router<any>>> = {
    routes: TRoutes;
    // Type inference helpers
    _routes: TRoutes;
};

/**
 * Define a router with multiple routes (tRPC-style)
 *
 * Supports multiple patterns for convenience:
 *
 * ## Pattern 1: Spread (recommended for simplicity)
 *
 * @example
 * ```ts
 * // src/server/routes/users.ts
 * export const getUser = route.get('/users/:id')...;
 * export const createUser = route.post('/users')...;
 * export const updateUser = route.put('/users/:id')...;
 * export const deleteUser = route.delete('/users/:id')...;
 *
 * // src/server/routes/teams.ts
 * export const getTeam = route.get('/teams/:id')...;
 * export const createTeam = route.post('/teams')...;
 *
 * // src/server/router.ts
 * import * as users from './routes/users';
 * import * as teams from './routes/teams';
 *
 * export const appRouter = defineRouter({
 *   ...users,  // Spread all user routes
 *   ...teams,  // Spread all team routes
 * });
 *
 * export type AppRouter = typeof appRouter;
 * ```
 *
 * ## Pattern 2: Explicit (for fine-grained control)
 *
 * @example
 * ```ts
 * export const appRouter = defineRouter({
 *   getUser: users.getUser,
 *   createUser: users.createUser,
 *   // Only include specific routes
 * });
 * ```
 *
 * ## Pattern 3: Nested (for namespacing)
 *
 * @example
 * ```ts
 * export const appRouter = defineRouter({
 *   users: defineRouter({ ...users }),
 *   teams: defineRouter({ ...teams }),
 * });
 *
 * // Access: appRouter.routes.users.routes.getUser
 * ```
 *
 * The router captures all route types, enabling:
 * - Full type inference on the client
 * - Automatic API client generation
 * - Type-safe request/response handling
 */
export function defineRouter<TRoutes extends Record<string, RouteDef<any, any> | Router<any>>>(
    routes: TRoutes
): Router<TRoutes>
{
    return {
        routes,
        _routes: routes,
    };
}