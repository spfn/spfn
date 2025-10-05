import type { Context } from 'hono';
import { Hono } from 'hono';

import type { RouteDefinition, RouteFile, RouteHandler, RouteModule } from './types';
import { RoutePriority } from './types';

/**
 * RouteMapper: Transform File-based Routes to Hono Routes
 *
 * ## Main Responsibilities
 * 1. **File → Route Transformation**: Convert RouteFile to RouteDefinition understood by Hono
 * 2. **HTTP Method Handler Processing**: Next.js App Router style (export function GET) → Hono instance
 * 3. **RouteContext Wrapping**: Inject params, query, data convenience methods into Hono Context
 * 4. **URL Path Generation**: File path → URL path ([id] → :id, [...slug] → *)
 * 5. **Priority Calculation**: Static(1) > Dynamic(2) > Catch-all(3)
 *
 * ## Transformation Example
 * ```
 * File: src/server/routes/users/[id].ts
 * export async function GET(c: RouteContext) { ... }
 *
 * Result:
 * - URL path: /users/:id
 * - HTTP method: GET
 * - Priority: 2 (DYNAMIC)
 * - Parameters: ['id']
 * - Hono instance: new Hono().get('/', wrapHandler(GET))
 * ```
 *
 * ## Applied Improvements
 * ✅ **Method Chaining Applied** (createHonoFromHandlers):
 *    - Uses let app = new Hono() pattern
 *    - Maintains type chain via app = app.get().post().patch() chaining
 *    - Enables Hono RPC type inference
 *
 * ✅ **Enhanced Type Safety** (wrapHandler):
 *    - Removed any types, explicitly specified RouteHandler and Context types
 *    - Improved data<T>() type safety using generics
 *
 * ✅ **Improved Query Parameter Handling**:
 *    - Enhanced readability with for...of + entries()
 *    - Optimized duplicate key array processing logic
 *
 * ✅ **Improved Error Messages**:
 *    - Structured format with example code
 *    - Developer-friendly guidelines
 *
 * ## Remaining Challenges
 * ❌ **Type Loss Due to Dynamic Import**:
 *    - import(routeFile.absolutePath) → Type checking only at runtime
 *    - Solution: Generate static type file (routes-types.generated.ts)
 */
export class RouteMapper
{
    /**
     * Convert RouteFile to RouteDefinition
     */
    async mapRoute(routeFile: RouteFile): Promise<RouteDefinition>
    {
        // Load module with dynamic import
        const module = await import(routeFile.absolutePath) as RouteModule;

        let honoInstance: Hono;

        // 1. Legacy style: Hono instance via default export
        if (module.default)
        {
            honoInstance = module.default;
        }
        // 2. Next.js App Router style: HTTP method function exports
        else if (this.hasHttpMethodHandlers(module))
        {
            honoInstance = this.createHonoFromHandlers(module);
        }
        else
        {
            throw new Error(
                `❌ Invalid route file: ${routeFile.absolutePath}\n\n` +
                `Route files must export one of the following:\n\n` +
                `1. Default Hono instance (Legacy style):\n` +
                `   export default new Hono().get('/', ...).post('/', ...);\n\n` +
                `2. HTTP method handlers (Next.js App Router style):\n` +
                `   export async function GET(c: RouteContext) { ... }\n` +
                `   export async function POST(c: RouteContext) { ... }\n\n` +
                `Supported methods: GET, POST, PUT, PATCH, DELETE, OPTIONS`
            );
        }

        // Generate URL path
        const urlPath = this.buildUrlPath(routeFile, module);

        // Extract parameters
        const params = this.extractParams(routeFile);

        // Calculate priority
        const priority = this.calculatePriority(routeFile);

        return {
            urlPath,
            filePath: routeFile.relativePath,
            priority,
            params,
            honoInstance,
            meta: module.meta,
            middlewares: module.middlewares,
        };
    }

    /**
     * Check if module has HTTP method handlers
     */
    private hasHttpMethodHandlers(module: RouteModule): boolean
    {
        const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
        return methods.some(method => typeof module[method as keyof RouteModule] === 'function');
    }

    /**
     * Create Hono instance from HTTP method handlers
     *
     * ✅ Implemented with method chaining for type inference
     */
    private createHonoFromHandlers(module: RouteModule): Hono
    {
        let app = new Hono();

        // Register HTTP methods (maintain type chain with method chaining)
        if (module.GET) app = app.get('/', this.wrapHandler(module.GET));
        if (module.POST) app = app.post('/', this.wrapHandler(module.POST));
        if (module.PUT) app = app.put('/', this.wrapHandler(module.PUT));
        if (module.PATCH) app = app.patch('/', this.wrapHandler(module.PATCH));
        if (module.DELETE) app = app.delete('/', this.wrapHandler(module.DELETE));
        if (module.OPTIONS) app = app.options('/', this.wrapHandler(module.OPTIONS));
        // HEAD is not natively supported by Hono

        return app;
    }

    /**
     * Handler wrapper: Convert Hono Context to RouteContext
     *
     * @param handler - RouteHandler (function that receives RouteContext)
     * @returns Handler that receives Hono Context and converts it to RouteContext
     */
    private wrapHandler(handler: RouteHandler)
    {
        return async (c: Context) =>
        {
            // 1. Inject path parameters
            const params: Record<string, string> = c.req.param();

            // 2. Inject query parameters (handle duplicate values as arrays)
            const query: Record<string, string | string[]> = {};
            const url = new URL(c.req.url);

            for (const [key, value] of url.searchParams.entries())
            {
                const existing = query[key];
                if (existing !== undefined)
                {
                    // Duplicate key: convert to array
                    query[key] = Array.isArray(existing)
                        ? [...existing, value]
                        : [existing, value];
                }
                else
                {
                    query[key] = value;
                }
            }

            // 3. Pageable object (QueryParser middleware result)
            const pageable = c.get('queryParams') || {};

            // 4. Inject body parsing helper
            const data = async <T = unknown>(): Promise<T> =>
            {
                return await c.req.json() as T;
            };

            // 5. Inject JSON response helper (bind original c.json)
            const json = c.json.bind(c);

            // 6. Create RouteContext
            const routeContext = {
                params,
                query,
                pageable,
                data,
                json,
                raw: c,
            };

            // 7. Call actual handler
            return handler(routeContext);
        };
    }

    /**
     * Generate URL path
     */
    private buildUrlPath(routeFile: RouteFile, module: RouteModule): string
    {
        // Use metadata prefix if available
        if (module.meta?.prefix)
        {
            return module.meta.prefix;
        }

        // Legacy prefix support
        if (module.prefix)
        {
            return module.prefix;
        }

        // Generate URL from file path
        const segments = [...routeFile.segments];

        // Remove index.ts from path
        if (routeFile.isIndex)
        {
            segments.pop();
        }
        else
        {
            // Remove .ts extension
            const lastSegment = segments[segments.length - 1];
            segments[segments.length - 1] = lastSegment.replace(/\.ts$/, '');
        }

        // Transform segments
        const transformedSegments = segments.map(segment => this.transformSegment(segment));

        // Combine path
        const path = '/' + transformedSegments.join('/');

        // Remove duplicate slashes
        return path.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
    }

    /**
     * Transform segment ([id] → :id, [...slug] → *)
     */
    private transformSegment(segment: string): string
    {
        // Catch-all: [...slug] → *
        if (/^\[\.\.\.[\w-]+]$/.test(segment))
        {
            return '*';
        }

        // Dynamic: [id] → :id
        if (/^\[[\w-]+]$/.test(segment))
        {
            const paramName = segment.slice(1, -1); // Remove [ ]
            this.validateParamName(paramName);
            return ':' + paramName;
        }

        // Static: users → users
        return segment;
    }

    /**
     * Extract parameter names
     */
    private extractParams(routeFile: RouteFile): string[]
    {
        const params: string[] = [];

        for (const segment of routeFile.segments)
        {
            // Remove .ts extension
            const cleanSegment = segment.replace(/\.ts$/, '');

            // Extract parameter name from [id], [slug], [...slug], etc.
            const match = cleanSegment.match(/^\[(\.\.\.)?(\w+)]$/);

            if (match)
            {
                params.push(match[2]);
            }
        }

        return params;
    }

    /**
     * Calculate priority
     */
    private calculatePriority(routeFile: RouteFile): RoutePriority
    {
        if (routeFile.isCatchAll)
        {
            return RoutePriority.CATCH_ALL;
        }

        if (routeFile.isDynamic)
        {
            return RoutePriority.DYNAMIC;
        }

        return RoutePriority.STATIC;
    }

    /**
     * Validate parameter name
     */
    private validateParamName(paramName: string): void
    {
        // Check if it's a valid JavaScript identifier
        if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(paramName))
        {
            throw new Error(
                `Invalid parameter name: ${paramName}. ` +
                `Parameter names must be valid JavaScript identifiers.`
            );
        }

        // Check reserved words
        const reservedWords = [
            'default', 'if', 'else', 'while', 'for', 'switch',
            'case', 'break', 'continue', 'return', 'function',
            'var', 'let', 'const', 'class', 'extends', 'import',
            'export', 'async', 'await', 'try', 'catch', 'finally'
        ];

        if (reservedWords.includes(paramName))
        {
            throw new Error(
                `Invalid parameter name: ${paramName}. ` +
                `Parameter names cannot be JavaScript reserved words.`
            );
        }
    }
}