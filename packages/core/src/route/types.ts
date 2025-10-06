import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { TSchema, Static } from '@sinclair/typebox';

/**
 * Header record type compatible with Hono's c.json headers parameter
 */
export type HeaderRecord = Record<string, string | string[]>;

/**
 * File-based Routing System Type Definitions
 *
 * ## Type Flow
 * ```
 * RouteFile (scan)
 *   ↓
 * RouteModule (dynamic import + contracts)
 *   ↓
 * RouteDefinition (transformation + validation)
 *   ↓
 * Hono App (registration)
 * ```
 *
 * ## Core Types
 * 1. **RouteContract**: TypeBox-based contract definition for type safety and validation
 * 2. **RouteContext**: Extended Context for route handlers (params, query, data)
 * 3. **RouteHandler**: Next.js App Router style handler function type
 * 4. **RouteFile**: File system scan result (Scanner output)
 * 5. **RouteModule**: Dynamic import result (Mapper input)
 * 6. **RouteDefinition**: Transformed route definition (Mapper output, Registry storage)
 * 7. **RouteMeta**: Route metadata (auth, tags, description, etc.)
 * 8. **RoutePriority**: Priority enum (STATIC, DYNAMIC, CATCH_ALL)
 * 9. **ScanOptions**: Scanner configuration options
 *
 * ## Applied Improvements
 * ✅ **HTTP Method Types**: Added HttpMethod union type
 * ✅ **Route Grouping**: Added RouteGroup, RouteStats types
 * ✅ **Type Guards**: isRouteFile, isRouteDefinition, isHttpMethod, hasHttpMethodHandlers
 * ✅ **Contract-based Types**: RouteContract, InferContract for end-to-end type safety
 * ✅ **Generic RouteContext**: RouteContext<TContract> for typed params, query, body, response
 */

// ============================================================================
// Contract Types
// ============================================================================

/**
 * Route Contract: TypeBox-based type-safe route definition
 *
 * Defines the shape of request/response for a route endpoint
 *
 * Note: params and query are always Record<string, string> from URL,
 * but can be validated and transformed via TypeBox schemas
 *
 * The HTTP method is determined by the export name (GET, POST, PUT, etc.)
 * so it's not included in the contract.
 */
export type RouteContract = {
    /** Path parameters schema (optional) - input is always Record<string, string> */
    params?: TSchema;
    /** Query parameters schema (optional) - input is always Record<string, string | string[]> */
    query?: TSchema;
    /** Request body schema (optional) */
    body?: TSchema;
    /** Response schema (required) */
    response: TSchema;
};

/**
 * Infer types from RouteContract
 *
 * Extracts TypeScript types from TypeBox schemas
 */
export type InferContract<TContract extends RouteContract> = {
    params: TContract['params'] extends TSchema
        ? Static<TContract['params']>
        : Record<string, never>;
    query: TContract['query'] extends TSchema
        ? Static<TContract['query']>
        : Record<string, never>;
    body: TContract['body'] extends TSchema
        ? Static<TContract['body']>
        : Record<string, never>;
    response: TContract['response'] extends TSchema
        ? Static<TContract['response']>
        : unknown;
};

/**
 * RouteContext: Route Handler Dedicated Context
 *
 * Generic version with contract-based type inference
 *
 * Convenience methods provided:
 * - params: Path parameters (typed via contract)
 * - query: Query parameters (typed via contract)
 * - pageable: QueryParser middleware result (Spring Pageable style)
 * - data(): Request Body parsing helper (typed via contract)
 * - json(): JSON response helper (typed via contract)
 * - raw: Original Hono Context (advanced features: raw.req, raw.get(), raw.set(), etc.)
 */
export type RouteContext<TContract extends RouteContract = any> = {
    /**
     * Path parameters (typed via contract)
     */
    params: InferContract<TContract>['params'];

    /**
     * Query parameters (typed via contract)
     */
    query: InferContract<TContract>['query'];

    /**
     * Pageable object (QueryParser middleware result)
     * Spring Boot Pageable style (filters, sort, pagination)
     */
    pageable: {
        filters?: Record<string, any>;
        sort?: Array<{ field: string; direction: 'asc' | 'desc' }>;
        pagination?: { page: number; limit: number };
    };

    /**
     * Request Body parsing helper (typed via contract)
     */
    data(): Promise<InferContract<TContract>['body']>;

    /**
     * JSON response helper (typed via contract)
     */
    json(
        data: InferContract<TContract>['response'],
        status?: ContentfulStatusCode,
        headers?: HeaderRecord
    ): Response;

    /**
     * Original Hono Context (for advanced features when needed)
     * - raw.req: Request object (headers, cookies, etc.)
     * - raw.get(): Read context variables (middleware data)
     * - raw.set(): Set context variables
     */
    raw: Context;
};

/**
 * HTTP method type
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

/**
 * Next.js App Router Style Route Handler
 *
 * Function that receives RouteContext and returns Response
 */
export type RouteHandler = (c: RouteContext) => Response | Promise<Response>;

/**
 * HttpMethod type guard
 */
export function isHttpMethod(value: unknown): value is HttpMethod
{
    return (
        typeof value === 'string' &&
        ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(value)
    );
}