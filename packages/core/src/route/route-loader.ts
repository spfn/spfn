import { join } from 'path';

import type { Hono } from 'hono';

import { RouteMapper } from './route-mapper';
import { RouteRegistry } from './route-registry';
import { RouteScanner } from './route-scanner';

/**
 * RouteLoader: Integrated Manager for File-based Routing Process
 *
 * ## Main Responsibilities
 * 1. **Module Integration**: Integrate Scanner, Mapper, Registry into a single pipeline
 * 2. **Process Coordination**: Manage entire flow: scan → transform → register → apply to Hono
 * 3. **Error Handling**: Catch errors at each stage and provide clear messages
 * 4. **Performance Measurement**: Measure route loading time for performance monitoring
 * 5. **Default Providers**: Provide convenience functions to run routing system with minimal configuration
 *
 * ## Operation Flow
 * ```
 * loadRoutes(app)
 *   ├─ 1️⃣ scanner.scanRoutes()        → RouteFile[]
 *   ├─ 2️⃣ mapper.mapRoute()           → RouteDefinition (for each)
 *   ├─ 3️⃣ registry.register()         → Duplicate/conflict check & storage
 *   └─ 4️⃣ registry.applyToHono(app)   → Final registration to Hono app
 * ```
 *
 * ## Usage Examples
 * ```typescript
 * // Method 1: Direct use
 * const loader = new RouteLoader('/path/to/routes', true);
 * await loader.loadRoutes(app);
 *
 * // Method 2: Convenience function (recommended)
 * await loadRoutesFromDirectory(app, debug);
 * ```
 *
 * ## Error Handling
 * - No route files: Warn and exit (app continues normally)
 * - Individual route load failure: Output error message and throw exception (app exits)
 * - Duplicate/conflicting routes: Registry detects and throws exception
 *
 * ## Applied Improvements
 * ✅ **Parallel Processing**: Parallelized mapping with Promise.allSettled
 * ✅ **Partial Failure Tolerance**: Separate handling of fulfilled/rejected for error logging
 * ✅ **Statistics Output**: Logging statistics by priority, HTTP method, and tag
 *
 * ## Future Improvements
 * 1. **Route Validation**: Add pre-validation stage before mapping (schema validation)
 * 2. **Hot Reload**: File change detection and automatic reload
 * 3. **Plugin System**: Enable injection of custom transformation/validation logic
 */
export class RouteLoader
{
    private scanner: RouteScanner;
    private mapper: RouteMapper;
    private registry: RouteRegistry;
    private readonly debug: boolean;

    constructor(routesDir: string, debug: boolean = false)
    {
        this.debug = debug;
        this.scanner = new RouteScanner({
            routesDir,
            debug,
            exclude: [
                /\.test\.ts$/,
                /\.spec\.ts$/,
                /\.d\.ts$/,
            ],
        });

        this.mapper = new RouteMapper();
        this.registry = new RouteRegistry(debug);
    }

    /**
     * Load and register all routes
     */
    async loadRoutes(app: Hono): Promise<void>
    {
        const startTime = Date.now();

        // 1. Scan files
        const routeFiles = await this.scanner.scanRoutes();

        if (routeFiles.length === 0)
        {
            console.warn('⚠️  No route files found');
            return;
        }

        // 2. Transform each file to RouteDefinition (parallel processing)
        const mappingResults = await Promise.allSettled(
            routeFiles.map(file => this.mapper.mapRoute(file))
        );

        // 3. Register successful routes only, log failed routes
        for (let i = 0; i < mappingResults.length; i++)
        {
            const result = mappingResults[i];
            const routeFile = routeFiles[i];

            if (result.status === 'fulfilled')
            {
                try
                {
                    this.registry.register(result.value);
                }
                catch (error)
                {
                    console.error(`❌ Failed to register route: ${routeFile.relativePath}`);
                    console.error(error);
                    throw error;
                }
            }
            else
            {
                console.error(`❌ Failed to load route: ${routeFile.relativePath}`);
                console.error(result.reason);
                throw result.reason;
            }
        }

        // 3. Apply to Hono app
        this.registry.applyToHono(app);

        // 4. Output statistics
        const stats = this.registry.getStats();
        const elapsed = Date.now() - startTime;

        // Simple output in production, detailed in debug mode
        if (this.debug)
        {
            console.log(`\n📊 Route Statistics:`);
            console.log(`   Priority: ${stats.byPriority.static} static, ${stats.byPriority.dynamic} dynamic, ${stats.byPriority.catchAll} catch-all`);

            const methodCounts = Object.entries(stats.byMethod)
                .filter(([_, count]) => count > 0)
                .map(([method, count]) => `${method}(${count})`)
                .join(', ');
            if (methodCounts)
            {
                console.log(`   Methods: ${methodCounts}`);
            }

            if (Object.keys(stats.byTag).length > 0)
            {
                const tagCounts = Object.entries(stats.byTag)
                    .map(([tag, count]) => `${tag}(${count})`)
                    .join(', ');
                console.log(`   Tags: ${tagCounts}`);
            }

            console.log(`\n✅ Routes loaded in ${elapsed}ms\n`);
        }
    }

    /**
     * Return registered route information
     */
    getRoutes()
    {
        return this.registry.getAllRoutes();
    }
}

/**
 * Convenience function: Load routes with default configuration
 */
export async function loadRoutesFromDirectory(app: Hono, debug: boolean = false, routesPath?: string): Promise<void>
{
    const cwd = process.cwd();
    const routesDir = routesPath ?? join(cwd, 'src', 'server', 'routes');

    const loader = new RouteLoader(routesDir, debug);
    await loader.loadRoutes(app);
}