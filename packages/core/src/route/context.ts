/**
 * Route Builder Context
 *
 * Provides structured input access and response helpers for route handlers
 */

import type { Static, TSchema } from '@sinclair/typebox';
import type { Context } from 'hono';
import type { ContentfulStatusCode, RedirectStatusCode } from 'hono/utils/http-status';
import type { RouteInput } from './route-input';

/**
 * Paginated response structure
 */
export type PaginatedResult<T> = {
    items: T[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
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
export type MergedInput<TInput extends RouteInput, TInterceptor extends RouteInput> = {
    params: (TInput['params'] extends TSchema ? Static<TInput['params']> : {}) &
            (TInterceptor['params'] extends TSchema ? Static<TInterceptor['params']> : {});
    query: (TInput['query'] extends TSchema ? Static<TInput['query']> : {}) &
           (TInterceptor['query'] extends TSchema ? Static<TInterceptor['query']> : {});
    body: (TInput['body'] extends TSchema ? Static<TInput['body']> : {}) &
          (TInterceptor['body'] extends TSchema ? Static<TInterceptor['body']> : {});
    formData: (TInput['formData'] extends TSchema ? Static<TInput['formData']> : {}) &
              (TInterceptor['formData'] extends TSchema ? Static<TInterceptor['formData']> : {});
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
    TInterceptor extends RouteInput = {},
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
        data: unknown,
        status?: ContentfulStatusCode,
        headers?: Record<string, string | string[]>
    ): Response;

    /**
     * Return 201 Created response with optional Location header
     * Returns data directly for type inference
     *
     * @example
     * ```ts
     * const user = await createUser(body);
     * return c.created(user, `/users/${user.id}`);
     * // Response: 201 Created
     * // Header: Location: /users/123
     * // Body: { id: '123', name: 'John' }
     * // Type: User (inferred from data)
     * ```
     */
    created<T>(data: T, location?: string): T;

    /**
     * Return 202 Accepted response
     * Returns data directly for type inference
     *
     * @example
     * ```ts
     * // With data
     * return c.accepted({ jobId: '123' });
     * // Response: 202 Accepted, Body: { jobId: '123' }
     * // Type: { jobId: string }
     *
     * // Without data
     * return c.accepted();
     * // Response: 202 Accepted, Body: (empty)
     * // Type: void
     * ```
     */
    accepted(): void;
    accepted<T>(data: T): T;

    /**
     * Return 204 No Content response (empty body)
     *
     * @example
     * ```ts
     * await deleteUser(id);
     * return c.noContent();
     * // Response: 204 No Content, Body: (empty)
     * // Type: void
     * ```
     */
    noContent(): void;

    /**
     * Return 304 Not Modified response (empty body)
     *
     * @example
     * ```ts
     * if (etag === requestEtag) {
     *   return c.notModified();
     * }
     * // Response: 304 Not Modified, Body: (empty)
     * // Type: void
     * ```
     */
    notModified(): void;

    /**
     * Return paginated response with metadata
     * Returns `{ items: [...], pagination: {...} }` format with type inference
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
     * // Type: PaginatedResult<User>
     * ```
     */
    paginated<T>(
        data: T[],
        page: number,
        limit: number,
        total: number
    ): PaginatedResult<T>;

    /**
     * Redirect to another URL
     *
     * @param url - Target URL to redirect to
     * @param status - HTTP status code (301, 302, 303, 307, 308). Default: 302
     *
     * @example
     * ```ts
     * // Temporary redirect (302)
     * return c.redirect('/login');
     *
     * // Permanent redirect (301)
     * return c.redirect('/new-path', 301);
     *
     * // See Other (303) - useful after POST
     * return c.redirect('/success', 303);
     * ```
     */
    redirect(url: string, status?: RedirectStatusCode): Response;

    // Raw Hono context for advanced usage
    raw: Context;
};
