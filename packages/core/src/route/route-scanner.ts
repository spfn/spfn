import { readdir, stat } from 'fs/promises';
import { join, relative } from 'path';

import type { RouteFile, ScanOptions } from './types';

/**
 * RouteScanner: File System Based Route File Scanner
 *
 * ## Main Responsibilities
 * 1. **Recursive Directory Traversal**: Recursively explore routes folder to discover all route files
 * 2. **File Filtering**: Select only valid route files (.ts allowed, excluding .test/.spec/.d.ts)
 * 3. **RouteFile Object Creation**: Convert file information to RouteFile type
 * 4. **Dynamic Route Detection**: Automatically recognize patterns like [id], [...slug]
 * 5. **Exclude Pattern Processing**: Apply user-defined exclusion rules
 *
 * ## Operation Flow
 * ```
 * scanRoutes()
 *   ↓
 * scanDirectory() (recursive)
 *   ├─ Directory → Recursive call
 *   └─ File → isValidRouteFile() → createRouteFile()
 *       ↓
 * Return RouteFile[]
 * ```
 *
 * ## RouteFile Creation Example
 * ```typescript
 * // Input: src/server/routes/users/[id]/posts/index.ts
 * {
 *   absolutePath: "/absolute/path/to/routes/users/[id]/posts/index.ts",
 *   relativePath: "users/[id]/posts/index.ts",
 *   segments: ["users", "[id]", "posts", "index.ts"],
 *   isDynamic: true,      // Contains [id] pattern
 *   isCatchAll: false,    // Not [...slug] pattern
 *   isIndex: true         // Is index.ts file
 * }
 * ```
 *
 * ## Applied Improvements
 * ✅ **Async File System API**: Uses fs/promises (readdir, stat)
 * ✅ **Enhanced Error Handling**: Provides clear error messages with try-catch
 *    - Directory read failure → Throws exception
 *    - File access failure → Warns and continues
 *
 * ## Future Improvements
 * 1. Extend file extension configuration (.js, .jsx, .tsx support options)
 * 2. glob pattern support (more flexible file matching)
 * 3. Caching mechanism (prevent re-scanning based on file hash)
 */
export class RouteScanner
{
    private routesDir: string;
    private exclude: RegExp[];
    private debug: boolean;

    constructor(options: ScanOptions)
    {
        this.routesDir = options.routesDir;
        this.exclude = options.exclude || [];
        this.debug = options.debug || false;
    }

    /**
     * Scan all route files
     */
    async scanRoutes(): Promise<RouteFile[]>
    {
        const files: RouteFile[] = [];

        this.log('🔍 Scanning routes directory:', this.routesDir);

        try
        {
            await this.scanDirectory(this.routesDir, files);
            this.log(`📁 Found ${files.length} route files`);
        }
        catch (error)
        {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to scan routes directory: ${this.routesDir}\n${message}`);
        }

        return files;
    }

    /**
     * Recursively scan directory (async)
     */
    private async scanDirectory(dir: string, files: RouteFile[]): Promise<void>
    {
        let entries: string[];

        try
        {
            entries = await readdir(dir);
        }
        catch (error)
        {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Cannot read directory: ${dir}\n${message}`);
        }

        for (const entry of entries)
        {
            const fullPath = join(dir, entry);

            // Check exclude patterns
            if (this.shouldExclude(fullPath))
            {
                this.log(`  ⏭️  Excluded: ${entry}`);
                continue;
            }

            let fileStat;
            try
            {
                fileStat = await stat(fullPath);
            }
            catch (error)
            {
                const message = error instanceof Error ? error.message : String(error);
                console.warn(`⚠️  Cannot access: ${fullPath} (${message})`);
                continue;
            }

            if (fileStat.isDirectory())
            {
                // Recursively explore subdirectories
                await this.scanDirectory(fullPath, files);
            }
            else if (fileStat.isFile() && this.isValidRouteFile(entry))
            {
                const routeFile = this.createRouteFile(fullPath);
                files.push(routeFile);
                this.log(`  ✓ ${routeFile.relativePath}`);
            }
        }
    }

    /**
     * Create RouteFile object
     */
    private createRouteFile(absolutePath: string): RouteFile
    {
        const relativePath = relative(this.routesDir, absolutePath);
        const segments = relativePath.split('/');
        const fileName = segments[segments.length - 1];

        return {
            absolutePath,
            relativePath,
            segments,
            isDynamic: this.isDynamicRoute(relativePath),
            isCatchAll: this.isCatchAllRoute(relativePath),
            isIndex: fileName === 'index.ts',
        };
    }

    /**
     * Validate if file is a valid route file
     */
    private isValidRouteFile(fileName: string): boolean
    {
        // Only allow .ts files
        if (!fileName.endsWith('.ts'))
        {
            return false;
        }

        // Exclude .d.ts, .test.ts, .spec.ts
        if (fileName.endsWith('.d.ts') ||
            fileName.endsWith('.test.ts') ||
            fileName.endsWith('.spec.ts'))
        {
            return false;
        }

        return true;
    }

    /**
     * Check if route is dynamic ([id], [slug], [...slug], etc.)
     */
    private isDynamicRoute(path: string): boolean
    {
        // Catch-all patterns are also considered dynamic routes
        return /\[[\w.-]+\]/.test(path);
    }

    /**
     * Check if route is catch-all ([...slug], etc.)
     */
    private isCatchAllRoute(path: string): boolean
    {
        return /\[\.\.\.[\w-]+\]/.test(path);
    }

    /**
     * Check exclude patterns
     */
    private shouldExclude(path: string): boolean
    {
        return this.exclude.some(pattern => pattern.test(path));
    }

    /**
     * Debug log
     */
    private log(...args: unknown[]): void
    {
        if (this.debug)
        {
            console.log(...args);
        }
    }
}