/**
 * Route Builder Context
 *
 * Provides structured input access and response helpers for route handlers
 */

import type { Static, TSchema } from '@sinclair/typebox';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { RouteInput } from './route-input';

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
        data: unknown,
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
    created(data: unknown, location?: string): Response;

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
    accepted(data?: unknown): Response;

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
        data: unknown[],
        page: number,
        limit: number,
        total: number
    ): Response;

    // Raw Hono context for advanced usage
    raw: Context;
};