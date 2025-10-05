import type { Context, Hono, MiddlewareHandler } from 'hono';

/**
 * File-based Routing System Type Definitions
 *
 * ## Type Flow
 * ```
 * RouteFile (scan)
 *   ↓
 * RouteModule (dynamic import)
 *   ↓
 * RouteDefinition (transformation)
 *   ↓
 * Hono App (registration)
 * ```
 *
 * ## Core Types
 * 1. **RouteContext**: Extended Context for route handlers (params, query, data)
 * 2. **RouteHandler**: Next.js App Router style handler function type
 * 3. **RouteFile**: File system scan result (Scanner output)
 * 4. **RouteModule**: Dynamic import result (Mapper input)
 * 5. **RouteDefinition**: Transformed route definition (Mapper output, Registry storage)
 * 6. **RouteMeta**: Route metadata (auth, tags, description, etc.)
 * 7. **RoutePriority**: Priority enum (STATIC, DYNAMIC, CATCH_ALL)
 * 8. **ScanOptions**: Scanner configuration options
 *
 * ## Applied Improvements
 * ✅ **HTTP Method Types**: Added HttpMethod union type
 * ✅ **Route Grouping**: Added RouteGroup, RouteStats types
 * ✅ **Type Guards**: isRouteFile, isRouteDefinition, isHttpMethod, hasHttpMethodHandlers
 *
 * ## Future Improvements
 * 1. **Generic Type Safety**: Add params, body type parameters to RouteContext
 * 2. **Metadata Validation**: Zod/Joi schema-based metadata validation
 * 3. **OpenAPI Spec**: OpenAPI 3.0 spec type integration
 */

/**
 * RouteContext: Route Handler Dedicated Context
 *
 * Convenience methods provided:
 * - params: Path parameters (e.g., /users/:id → { id: string })
 * - query: Query parameters (handles duplicate values as arrays)
 * - pageable: QueryParser middleware result (Spring Pageable style)
 * - data<T>(): Request Body parsing helper (with generic support)
 * - json<T>(): JSON response helper
 * - raw: Original Hono Context (advanced features: raw.req, raw.get(), raw.set(), etc.)
 */
export type RouteContext = {
    /**
     * Path parameters (e.g., /users/:id → { id: string })
     */
    params: Record<string, string>;

    /**
     * Query parameters (e.g., /users?page=1 → { page: string })
     */
    query: Record<string, string | string[]>;

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
     * Request Body parsing helper
     */
    data<T = unknown>(): Promise<T>;

    /**
     * JSON response helper (same as Hono Context's json method)
     */
    json: Context['json'];

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
 * Scanned route file information
 */
export type RouteFile = {
    /** Absolute path */
    absolutePath: string;
    /** Relative path from routes/ */
    relativePath: string;
    /** Path segment array */
    segments: string[];
    /** Whether it contains dynamic parameters [id] */
    isDynamic: boolean;
    /** Whether it's a catch-all route [...slug] */
    isCatchAll: boolean;
    /** Whether it's an index.ts file */
    isIndex: boolean;
};

/**
 * Route metadata (optional export)
 */
export type RouteMeta = {
    /** Route description */
    description?: string;
    /** OpenAPI tags */
    tags?: string[];
    /** Whether authentication is required */
    auth?: boolean;
    /** Custom prefix (default: based on file path) */
    prefix?: string;
    /** Additional metadata */
    [key: string]: unknown;
};

/**
 * Route module type (dynamic import result)
 *
 * Supports two styles:
 * 1. Legacy style: Hono instance via default export
 * 2. Next.js style: HTTP method function exports (GET, POST, etc.)
 */
export type RouteModule = {
    /** Hono instance (legacy style, optional) */
    default?: Hono;

    /** HTTP method handlers (Next.js style) */
    GET?: RouteHandler;
    POST?: RouteHandler;
    PUT?: RouteHandler;
    PATCH?: RouteHandler;
    DELETE?: RouteHandler;
    HEAD?: RouteHandler;
    OPTIONS?: RouteHandler;

    /** Route metadata (optional) */
    meta?: RouteMeta;
    /** Middleware array (optional) */
    middlewares?: MiddlewareHandler[];
    /** Legacy prefix support (optional) */
    prefix?: string;
};

/**
 * Transformed route definition
 */
export type RouteDefinition = {
    /** URL path (/users/:id) */
    urlPath: string;
    /** File path (routes/users/[id].ts) */
    filePath: string;
    /** Priority (1: static, 2: dynamic, 3: catch-all) */
    priority: number;
    /** Parameter name array ['id'] */
    params: string[];
    /** Hono instance */
    honoInstance: Hono;
    /** Route metadata */
    meta?: RouteMeta;
    /** Middleware array */
    middlewares?: MiddlewareHandler[];
};

/**
 * Route priority
 */
export enum RoutePriority
{
    STATIC = 1,
    DYNAMIC = 2,
    CATCH_ALL = 3,
}

/**
 * Route scanner options
 */
export type ScanOptions = {
    /** Routes directory path */
    routesDir: string;
    /** Exclude patterns */
    exclude?: RegExp[];
    /** Debug log output */
    debug?: boolean;
};

/**
 * Route group (for grouping routes by tag)
 */
export type RouteGroup = {
    /** Group name (tag or prefix) */
    name: string;
    /** Routes belonging to this group */
    routes: RouteDefinition[];
};

/**
 * Route statistics
 */
export type RouteStats = {
    /** Total number of routes */
    total: number;
    /** Count by HTTP method */
    byMethod: Record<HttpMethod, number>;
    /** Count by priority */
    byPriority: {
        static: number;
        dynamic: number;
        catchAll: number;
    };
    /** Count by tag */
    byTag: Record<string, number>;
};

// ============================================================================
// Type Guard Functions
// ============================================================================

/**
 * RouteFile type guard
 */
export function isRouteFile(value: unknown): value is RouteFile
{
    return (
        typeof value === 'object' &&
        value !== null &&
        'absolutePath' in value &&
        'relativePath' in value &&
        'segments' in value &&
        'isDynamic' in value &&
        'isCatchAll' in value &&
        'isIndex' in value
    );
}

/**
 * RouteDefinition type guard
 */
export function isRouteDefinition(value: unknown): value is RouteDefinition
{
    return (
        typeof value === 'object' &&
        value !== null &&
        'urlPath' in value &&
        'filePath' in value &&
        'priority' in value &&
        'params' in value &&
        'honoInstance' in value
    );
}

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

/**
 * Check if RouteModule is Next.js style
 */
export function hasHttpMethodHandlers(module: RouteModule): boolean
{
    const methods: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
    return methods.some(method => typeof module[method] === 'function');
}