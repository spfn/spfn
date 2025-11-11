/**
 * Codegen Helper Utilities
 *
 * Helper functions for grouping and organizing contract mappings
 */

import type { RouteContractMapping } from '../../core/types';

/**
 * Group mappings by resource
 */
export function groupByResource(mappings: RouteContractMapping[]): Record<string, RouteContractMapping[]>
{
    const grouped: Record<string, RouteContractMapping[]> = {};

    for (let i = 0; i < mappings.length; i++)
    {
        const mapping = mappings[i];
        const resource = extractResourceName(mapping.path);

        if (!grouped[resource])
        {
            grouped[resource] = [];
        }

        grouped[resource].push(mapping);
    }

    return grouped;
}

/**
 * Extract resource name from path
 *
 * Examples:
 * - /users → users
 * - /users/:id → users
 * - /users/:id/posts → usersPosts
 * - /videos/upload-and-analyze → videosUploadAndAnalyze
 * - /_cms/labels → labels (with prefix='/_cms')
 * - /_cms/published-cache → publishedCache (with prefix='/_cms')
 */
function extractResourceName(path: string): string
{
    // Strip prefix from path if provided
    let processedPath = path;
    if (!processedPath.startsWith('/'))
    {
        processedPath = '/' + processedPath;
    }

    // Remove leading slash
    const segments = processedPath.slice(1).split('/').filter(s => s && s !== '*');

    // Remove dynamic segments
    const staticSegments: string[] = [];
    for (let i = 0; i < segments.length; i++)
    {
        const seg = segments[i];
        if (!seg.startsWith(':'))
        {
            staticSegments.push(seg);
        }
    }

    // Join with camelCase
    if (staticSegments.length === 0)
    {
        return 'root';
    }

    // Convert first segment (keep lowercase for first)
    const first = toCamelCase(staticSegments[0], false);

    if (staticSegments.length === 1)
    {
        return first;
    }

    // Convert to camelCase: users/posts → usersPosts, videos/upload-and-analyze → videosUploadAndAnalyze
    const result: string[] = [first];
    for (let i = 1; i < staticSegments.length; i++)
    {
        const seg = staticSegments[i];
        result.push(toCamelCase(seg, true));
    }

    return result.join('');
}

/**
 * Convert string to camelCase, handling hyphens
 *
 * @param str - Input string
 * @param capitalize - Capitalize first letter
 * @returns camelCase string
 *
 * Examples:
 * - toCamelCase('upload-and-analyze', true) → 'UploadAndAnalyze'
 * - toCamelCase('upload-and-analyze', false) → 'uploadAndAnalyze'
 * - toCamelCase('users', false) → 'users'
 */
function toCamelCase(str: string, capitalize: boolean): string
{
    // Split by hyphen or underscore
    const parts = str.split(/[-_]/);

    if (parts.length === 1)
    {
        // No hyphens/underscores
        return capitalize
            ? str.charAt(0).toUpperCase() + str.slice(1)
            : str;
    }

    // Convert to camelCase
    const result: string[] = [];
    for (let i = 0; i < parts.length; i++)
    {
        const part = parts[i];
        if (i === 0 && !capitalize)
        {
            result.push(part);
        }
        else
        {
            result.push(part.charAt(0).toUpperCase() + part.slice(1));
        }
    }

    return result.join('');
}

/**
 * Convert resource name to PascalCase
 *
 * @param resourceName - Resource name in camelCase (e.g., 'schedule', 'schedules', 'schedulesRecurring')
 * @returns PascalCase string
 *
 * Examples:
 * - toPascalCase('schedule') → 'Schedule'
 * - toPascalCase('schedules') → 'Schedules'
 * - toPascalCase('schedulesRecurring') → 'SchedulesRecurring'
 */
export function toPascalCase(str: string): string
{
    if (str.length === 0)
    {
        return str;
    }

    return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Collision detection result
 */
export interface CollisionInfo
{
    typeCollisions: Set<string>;      // Type names that have collisions
    functionCollisions: Set<string>;  // Function names that have collisions
}

/**
 * Detect type and function name collisions across resources
 *
 * @param grouped - Resources grouped by name
 * @param generateTypeName - Function to generate type name from mapping
 * @param generateFunctionName - Function to generate function name from mapping
 * @returns Collision information
 */
export function detectCollisions(
    grouped: Record<string, RouteContractMapping[]>,
    generateTypeName: (mapping: RouteContractMapping) => string,
    generateFunctionName: (mapping: RouteContractMapping) => string
): CollisionInfo
{
    const typeToResources = new Map<string, Set<string>>();
    const functionToResources = new Map<string, Set<string>>();

    // Collect all type and function names by resource
    for (const resourceName of Object.keys(grouped))
    {
        const routes = grouped[resourceName];

        for (let i = 0; i < routes.length; i++)
        {
            const route = routes[i];
            const baseTypeName = generateTypeName(route);
            const functionName = generateFunctionName(route);

            // Check type collisions for all variants (Response, Query, Params, Body)
            const typeVariants = [
                `${baseTypeName}Response`,
                route.hasQuery ? `${baseTypeName}Query` : null,
                (route.hasParams || route.path.includes(':')) ? `${baseTypeName}Params` : null,
                route.hasBody ? `${baseTypeName}Body` : null
            ].filter((name): name is string => name !== null);

            for (const typeName of typeVariants)
            {
                if (!typeToResources.has(typeName))
                {
                    typeToResources.set(typeName, new Set());
                }
                typeToResources.get(typeName)!.add(resourceName);
            }

            // Check function collisions
            if (!functionToResources.has(functionName))
            {
                functionToResources.set(functionName, new Set());
            }
            functionToResources.get(functionName)!.add(resourceName);
        }
    }

    // Filter to only collisions (2+ resources using same name)
    const typeCollisions = new Set<string>();
    for (const [typeName, resources] of typeToResources.entries())
    {
        if (resources.size > 1)
        {
            typeCollisions.add(typeName);
        }
    }

    const functionCollisions = new Set<string>();
    for (const [functionName, resources] of functionToResources.entries())
    {
        if (resources.size > 1)
        {
            functionCollisions.add(functionName);
        }
    }

    return {
        typeCollisions,
        functionCollisions
    };
}